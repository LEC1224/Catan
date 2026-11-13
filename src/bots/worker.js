import { chooseBotAction } from './strategy.js';

// An evaluator owns memory for one controller; exporting it keeps scheduling testable without a browser.
export function createBotEvaluator() {
  let match, memories = new Map();
  return ({ key, state }, now = Date.now()) => {
    try {
      if (match !== state.matchId) { match = state.matchId; memories = new Map(); }
      // Mandatory discards and responses can belong to bots other than the active player.
      const bots = [...state.bots].sort((a, b) => Number(!!b.game.discardRequired[b.id]) - Number(!!a.game.discardRequired[a.id]) || Number(b.id !== b.game.activePlayerId) - Number(a.id !== a.game.activePlayerId));
      let retryAt = Infinity;
      for (const bot of bots) {
        if (!memories.has(bot.id)) memories.set(bot.id, {});
        const memory = memories.get(bot.id);
        const action = chooseBotAction(bot.game, bot.id, bot.difficulty, memory, Math.random, now);
        if (action) return { key, botId: bot.id, action };
        if (memory.offerUntil > now) retryAt = Math.min(retryAt, memory.offerUntil);
      }
      return { key, action: null, ...(Number.isFinite(retryAt) ? { retryAfter: retryAt - now } : {}) };
    } catch (error) {
      return { key, error: error.message };
    }
  };
}

if (typeof self !== 'undefined') {
  const evaluate = createBotEvaluator();
  self.onmessage = ({ data }) => self.postMessage(evaluate(data));
}
