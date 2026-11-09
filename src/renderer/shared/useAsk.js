import { useRef, useState } from 'react';

/** Send a question to the brain and follow its streamed answer, reasoning and tool calls. */
export function useAsk() {
  const [turn, setTurn] = useState(null); // { question, text, reasoning, model, tools, thinking, error }
  const idRef = useRef(null);

  /** opts: { conversationId, style: 'short' | 'chat', mode: 'auto' | 'fast' | 'think' | 'smart' | 'coder' } */
  async function send(question, images = [], opts = {}) {
    const id = crypto.randomUUID();
    idRef.current = id;
    const started = Date.now();
    setTurn({ question, images, text: '', reasoning: '', model: null, tools: [], thinking: true, started });
    const off = window.ather.onAskEvent((e) => {
      if (e.id !== id) return;
      if (e.type === 'model') setTurn((t) => t && ({ ...t, model: e.label }));
      if (e.type === 'reasoning') setTurn((t) => t && ({ ...t, reasoning: t.reasoning + e.text }));
      if (e.type === 'token') setTurn((t) => t && ({ ...t, text: t.text + e.text, thoughtFor: t.thoughtFor ?? (t.reasoning ? Math.round((Date.now() - started) / 1000) : null) }));
      if (e.type === 'skill') setTurn((t) => t && ({ ...t, model: [t.model, `✨ ${e.name}`].filter(Boolean).join(' · ') }));
      if (e.type === 'retry') setTurn((t) => t && ({ ...t, text: '' })); // the first answer is being redone with tools
      if (e.type === 'tool') setTurn((t) => t && ({ ...t, text: '', tools: [...t.tools, e] }));
    });
    try {
      const answer = await window.ather.ask({ id, text: question, images, ...opts });
      setTurn((t) => t && ({ ...t, text: answer, thinking: false }));
      return answer;
    } catch (err) {
      const message = /abort/i.test(err.message) ? 'Stopped.' : err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      setTurn((t) => t && ({ ...t, thinking: false, error: message }));
      return null;
    } finally {
      off();
    }
  }

  const cancel = () => idRef.current && window.ather.cancel(idRef.current);
  return { turn, send, cancel, reset: () => setTurn(null) };
}
