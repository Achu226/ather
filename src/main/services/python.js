// Code interpreter: runs AI-written Python (after the user approves) in a per-conversation work folder.
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { dataDir } from '../paths.js';

const run = promisify(execFile);
const TIMEOUT = 120_000;

// Charts are saved automatically so the chat can show them, even if the code only calls plt.show().
const PRELUDE = `
import os as _os, atexit as _atexit
try:
    import matplotlib as _mpl
    _mpl.use('Agg')
    import matplotlib.pyplot as _plt
    def _ather_save_charts():
        for _i in _plt.get_fignums():
            _plt.figure(_i).savefig(f'chart_{_os.getpid()}_{_i}.png', dpi=110, bbox_inches='tight')
    _atexit.register(_ather_save_charts)
except Exception:
    pass
`;

export function createPython({ root = join(dataDir, 'python'), workRoot = join(dataDir, 'work'), base = 'python' } = {}) {
  const exe = join(root, 'Scripts', 'python.exe');
  let ready = null;

  /** One-time venv on top of the user's Python (keeps numpy/pandas/matplotlib), plus openpyxl for Excel. */
  function ensure() {
    ready ??= (async () => {
      if (existsSync(exe)) return exe;
      try {
        await run(base, ['-m', 'venv', '--system-site-packages', root], { windowsHide: true, timeout: 120_000 });
      } catch {
        throw new Error('Python is not installed. Install Python 3 from python.org (tick "Add to PATH"), then try again.');
      }
      await run(exe, ['-m', 'pip', 'install', '--quiet', 'openpyxl'], { windowsHide: true, timeout: 300_000 }).catch(() => {});
      return exe;
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  const workDir = (cid) => { const d = join(workRoot, String(cid ?? 'scratch')); mkdirSync(d, { recursive: true }); return d; };
  const listing = (dir) => Object.fromEntries(readdirSync(dir).map((f) => [f, statSync(join(dir, f)).mtimeMs]));

  async function execute(code, cid) {
    const python = await ensure();
    const dir = workDir(cid);
    const before = listing(dir);
    const script = join(dir, '_ather_run.py');
    writeFileSync(script, `${PRELUDE}\n${code}\n`);
    let stdout = '', stderr = '', exitCode = 0;
    try {
      ({ stdout, stderr } = await run(python, ['-I', script], { cwd: dir, timeout: TIMEOUT, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8', MPLBACKEND: 'Agg' } }));
    } catch (err) {
      stdout = err.stdout || ''; stderr = err.killed ? `Stopped after ${TIMEOUT / 1000} seconds.` : (err.stderr || err.message);
      exitCode = err.code ?? 1;
    }
    const after = listing(dir);
    const changed = Object.keys(after).filter((f) => f !== '_ather_run.py' && after[f] !== before[f]).map((f) => join(dir, f));
    return {
      exit_code: exitCode,
      stdout: stdout.slice(0, 8000),
      stderr: stderr.slice(-4000),
      files: changed.filter((f) => !/\.png$/i.test(f)),
      images: changed.filter((f) => /\.png$/i.test(f)),
      folder: dir,
    };
  }

  /** Put a user's file (CSV, Excel…) in the conversation's work folder so code can open it by name. */
  function addFile(cid, path) {
    const target = join(workDir(cid), basename(path));
    copyFileSync(path, target);
    return target;
  }

  const files = (cid) => readdirSync(workDir(cid)).filter((f) => f !== '_ather_run.py');
  return { ensure, execute, addFile, files, workDir };
}
