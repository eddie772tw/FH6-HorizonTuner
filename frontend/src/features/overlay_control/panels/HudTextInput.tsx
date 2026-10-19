import { useEffect, useState } from 'react';

// Persist on commit so config normalization cannot remove spaces while typing.
export function HudTextInput({ id, value, onCommit }: {
  id: string; value: string; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    const next = draft.trim() || value;
    setDraft(next);
    if (next !== value) onCommit(next);
  };
  return <input id={id} className="form-control form-control-sm" maxLength={64} value={draft}
    onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
