import { useEffect, useState } from 'react';

/** Load data with fn(); reload whenever `version` changes (any Maya data changed). */
export function useData(fn, version, deps = []) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    fn().then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [version, ...deps]);
  return data;
}

export const tool = (name, args) => window.ather.tool(name, args);
export const today = () => new Date().toLocaleDateString('en-CA');
export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toLocaleDateString('en-CA') === today();
  const time = iso.length > 10 ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
};
