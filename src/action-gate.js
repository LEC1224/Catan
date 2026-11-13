// React's pending state updates on the next render. This gate also catches rapid
// overlapping events in the current render, without replaying a command later.
export function createActionGate() {
  let pending = false;
  return async task => {
    if (pending) return false;
    pending = true;
    try { return await task(); }
    finally { pending = false; }
  };
}
