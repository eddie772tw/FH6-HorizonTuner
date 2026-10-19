import { useEffect, useState } from 'react';

// Keep a local draft so a minus sign can be typed before committing a signed offset.
export function HudOffsetInput({ id, value, min, onCommit }: {
  id: string; value: number; min: number; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const number = Number(draft);
    const next = Number.isFinite(number) ? Math.max(min, Math.min(4000, number)) : value;
    setDraft(String(next));
    onCommit(next);
  };
  return <input id={id} type="number" className="form-control form-control-sm" min={min} max={4000} step={1}
    value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
