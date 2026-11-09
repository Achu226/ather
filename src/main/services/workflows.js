// Runs saved routines as workflows: each step has a live state (waiting, running, awaiting approval,
// completed, failed, cancelled), a run can be paused, resumed, retried or cancelled, and every run is kept as history.
import { now } from '../store.js';
import { logWork } from './worklog.js';
import { localIso } from './calendar-feeds.js';

const STEP_TIMEOUT = 120_000;
const parse = (row) => row && { ...row, steps: JSON.parse(row.steps) };

/** tools() lists runnable tools; ctx is what tool.run gets; confirm({name,args}) asks the user; onChange(run) on every state change. */
export function createWorkflows({ store, tools, ctx, confirm = async () => false, onChange = () => {} }) {
  const live = new Map(); // run id -> { paused, cancelled, wake, stop }
  // Runs left open when Maya last closed cannot continue.
  store.run("UPDATE workflow_runs SET status = 'cancelled', finished_at = ? WHERE status IN ('running', 'paused', 'awaiting approval')", now());

  const save = (run) => {
    store.run('UPDATE workflow_runs SET status = ?, steps = ?, finished_at = ? WHERE id = ?', run.status, JSON.stringify(run.steps), run.finished_at ?? null, run.id);
    onChange(run);
  };
  const finish = (run, status) => {
    for (const s of run.steps) if (s.status === 'waiting' || s.status === 'running' || s.status === 'awaiting approval') s.status = 'cancelled';
    Object.assign(run, { status, finished_at: now() });
    live.delete(run.id);
    save(run);
    return run;
  };

  async function execute(run) {
    const ctl = { paused: false, cancelled: false, wake: () => {} };
    // Rejects the moment the run is cancelled, so a slow step does not hold the run open.
    ctl.stop = new Promise((_, reject) => { ctl.abort = () => reject(new Error('Cancelled')); });
    ctl.stop.catch(() => {});
    live.set(run.id, ctl);
    Object.assign(run, { status: 'running', finished_at: null });
    save(run);
    for (const step of run.steps) {
      if (step.status === 'completed') continue;
      while (ctl.paused && !ctl.cancelled) {
        run.status = 'paused'; save(run);
        await new Promise((r) => { ctl.wake = r; });
        run.status = 'running'; save(run);
      }
      if (ctl.cancelled) return finish(run, 'cancelled');
      Object.assign(step, { status: 'running', error: undefined, result: undefined, started_at: now() });
      const tool = tools().find((t) => t.name === step.tool);
      if (!tool || tool.name.startsWith('routines_')) { step.status = 'failed'; step.error = 'This tool is not available'; return finish(run, 'failed'); }
      if (tool.confirm) {
        step.status = run.status = 'awaiting approval'; save(run);
        const ok = await Promise.race([confirm({ name: tool.name, args: step.args || {} }), ctl.stop]).catch(() => false);
        if (!ok) { step.status = 'cancelled'; step.error = 'Not approved'; return finish(run, 'cancelled'); }
        step.status = run.status = 'running';
      }
      save(run);
      let timer;
      try {
        // shortcut: on cancel/timeout the step's own work is not aborted, only abandoned; add AbortSignal to tools if one runs long.
        const result = await Promise.race([
          tool.run(step.args || {}, ctx),
          ctl.stop,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Step took longer than 2 minutes')), STEP_TIMEOUT); }),
        ]);
        try { logWork(store, { source: 'workflow', name: tool.name, args: step.args || {}, result, ms: Date.now() - Date.parse(step.started_at || now()) }); } catch { /* monitor only */ }
        if (result?.error || result?.denied) throw new Error(result.error || 'Not approved');
        Object.assign(step, { status: 'completed', result, finished_at: now() });
        save(run);
      } catch (e) {
        Object.assign(step, { status: ctl.cancelled ? 'cancelled' : 'failed', error: e.message, finished_at: now() });
        return finish(run, ctl.cancelled ? 'cancelled' : 'failed');
      } finally {
        clearTimeout(timer);
      }
    }
    return finish(run, 'completed');
  }

  const getRun = (id) => parse(store.get('SELECT * FROM workflow_runs WHERE id = ?', id));
  const control = (id) => {
    const ctl = live.get(id);
    if (!ctl) throw new Error(`Run ${id} is not running`);
    return ctl;
  };

  return {
    /** Starts a routine by name; resolves when the run ends (callers that should not wait can ignore the promise). */
    start(name, { trigger = 'manual' } = {}) {
      const routine = store.get('SELECT * FROM routines WHERE deleted = 0 AND name = ?', name.trim().toLowerCase());
      if (!routine) throw new Error(`No routine called "${name}". Saved: ${store.all('SELECT name FROM routines WHERE deleted = 0').map((r) => r.name).join(', ') || 'none'}`);
      const steps = JSON.parse(routine.steps).map((s) => ({ tool: s.tool, args: s.args || {}, status: 'waiting' }));
      const { id } = store.get('INSERT INTO workflow_runs (routine, trigger, status, steps, started_at) VALUES (?, ?, ?, ?, ?) RETURNING id', routine.name, trigger, 'waiting', JSON.stringify(steps), now());
      const run = { id, routine: routine.name, trigger, steps, started_at: now() };
      return { run, done: execute(run) };
    },
    pause(id) { control(id).paused = true; return getRun(id); },
    resume(id) { const c = control(id); c.paused = false; c.wake(); return getRun(id); },
    cancel(id) { const c = control(id); c.cancelled = true; c.abort(); c.wake(); return getRun(id); },
    /** Re-runs a failed or cancelled run from its first unfinished step. */
    retry(id) {
      const run = getRun(id);
      if (!run || live.has(id) || !['failed', 'cancelled'].includes(run.status)) throw new Error(`Run ${id} cannot be retried`);
      for (const s of run.steps) if (s.status !== 'completed') s.status = 'waiting';
      return { run, done: execute(run) };
    },
    get: getRun,
    runs: (limit = 30) => store.all('SELECT * FROM workflow_runs ORDER BY id DESC LIMIT ?', limit).map(parse),
    /** Starts routines whose daily time ("HH:MM") has come and that have not run today. */
    tick(date = new Date()) {
      const today = localIso(date).slice(0, 10), time = localIso(date).slice(11, 16);
      for (const r of store.all("SELECT name, schedule FROM routines WHERE deleted = 0 AND schedule != '' AND schedule <= ? AND (last_scheduled IS NULL OR last_scheduled != ?)", time, today)) {
        store.run('UPDATE routines SET last_scheduled = ? WHERE name = ?', today, r.name);
        this.start(r.name, { trigger: 'schedule' }).done.catch(() => {});
      }
    },
  };
}
