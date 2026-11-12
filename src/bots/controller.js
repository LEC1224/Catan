// Owns a browser Web Worker; the server only supplies observations and validates actions.
export function attachBotController(socket, onError = () => {}) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let state = null, key = '', timer, thinking = false, inFlight = false, stopped = false;
  const stateKey = s => s ? `${s.lobbyId}/${s.matchId}/${s.lease}/${s.revision}` : '';
  const schedule = (delay = 700) => {
    clearTimeout(timer);
    if (!stopped && state && socket.connected) timer = setTimeout(() => {
      if (thinking || inFlight) { schedule(); return; }
      thinking = true; worker.postMessage({ key, state });
    }, delay);
  };
  const update = next => {
    const nextKey = stateKey(next);
    if (nextKey === key) return; // Chat/presence updates must not reset the decision delay.
    state = next; key = nextKey; schedule();
  };
  const disconnect = () => { state = null; key = ''; clearTimeout(timer); };
  worker.onmessage = ({ data }) => {
    thinking = false;
    if (stopped || data.key !== key || !state || !socket.connected) { schedule(); return; }
    if (data.error) { onError(`Bot could not choose a move: ${data.error}`); schedule(3000); return; }
    if (!data.action) { schedule(1000); return; }
    const snapshot = state;
    inFlight = true;
    socket.timeout(5000).emit('botAction', { botId: data.botId, action: data.action, matchId: snapshot.matchId, lease: snapshot.lease, revision: snapshot.revision }, (error, result) => {
      inFlight = false;
      if (stopped) return;
      if ((error || !result?.ok) && state && key === data.key) {
        // Reconcile before retrying: the server may have committed an unacknowledged move.
        socket.emit('syncBots', {}, () => {});
        if (!error && result?.error && !/changed/.test(result.error)) onError(`Bot move rejected: ${result.error}`);
      }
      schedule(error || !result?.ok ? 1500 : 700);
    });
  };
  worker.onerror = () => { onError('Local bots stopped. Reload this tab to restart them.'); stopped = true; clearTimeout(timer); };
  socket.on('botState', update); socket.on('disconnect', disconnect);
  return () => { stopped = true; clearTimeout(timer); worker.terminate(); socket.off('botState', update); socket.off('disconnect', disconnect); };
}
