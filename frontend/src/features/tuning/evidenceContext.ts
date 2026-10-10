import { useRef } from 'react';

/** An engine dependency key is narrower than a setup version. Do not rebind old
 * captures to a changed setup, even after A→B→A. A new capture may establish a new context. */
export function useEvidenceContext(context: string, capture: string | null) {
  const binding = useRef({ context, seen: new Set<string>(), stale: new Set<string>() });
  if (binding.current.context !== context) {
    for (const id of binding.current.seen) binding.current.stale.add(id);
    binding.current.context = context;
  }
  if (capture != null) binding.current.seen.add(capture);
  return capture != null && !binding.current.stale.has(capture);
}
