import { chooseBotAction } from './strategy.js';

let match, memories = new Map();
self.onmessage = ({ data }) => {
  const { key, state } = data;
  try {
    if (match !== state.matchId) { match = state.matchId; memories = new Map(); }
    // Mandatory discards and responses can belong to bots other than the active player.
    const bots = [...state.bots].sort((a, b) => Number(!!b.game.discardRequired[b.id]) - Number(!!a.game.discardRequired[a.id]) || Number(b.id !== b.game.activePlayerId) - Number(a.id !== a.game.activePlayerId));
    for (const bot of bots) {
      if (!memories.has(bot.id)) memories.set(bot.id, {});
      const action = chooseBotAction(bot.game, bot.id, bot.difficulty, memories.get(bot.id));
      if (action) { self.postMessage({ key, botId: bot.id, action }); return; }
    }
    self.postMessage({ key, action: null });
  } catch (error) { self.postMessage({ key, error: error.message }); }
};
