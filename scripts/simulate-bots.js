import { pathToFileURL } from 'node:url';
import { createGame, action, viewGame, RESOURCES } from '../server/game.js';
import { chooseBotAction } from '../src/bots/strategy.js';

export function simulateBots(count, difficulty, settings = {}) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `bot-${i}`, name: `Bot ${i + 1}`, color: '#888' }));
  const game = createGame(players, { extendedBoard: count > 4, seed: `bots-${count}-${difficulty}`, turnSeconds: 0, ...settings });
  const memories = new Map(players.map(p => [p.id, {}]));
  let decisions = 0, waits = 0, now = Date.now();
  while (game.phase !== 'finished' && decisions < 15000 && waits < 10000) {
    now += 1000;
    const order = [...players].sort((a, b) => Number(b.id !== game.activePlayerId) - Number(a.id !== game.activePlayerId));
    let moved = false;
    for (const p of order) {
      const chosen = chooseBotAction(viewGame(game, p.id), p.id, difficulty, memories.get(p.id), () => 0.5, now);
      if (!chosen) continue;
      try { action(game, p.id, chosen.type, chosen); }
      catch (error) { throw new Error(`${difficulty} ${count} players, turn ${game.turn}, ${game.phase}, ${JSON.stringify(chosen)}: ${error.message}`); }
      decisions++; moved = true; break;
    }
    if (!moved) waits++;
    for (const r of RESOURCES) {
      if (game.bank[r] < 0 || game.players.some(p => p.resources[r] < 0)) throw new Error(`Negative ${r}`);
      const total = game.bank[r] + game.players.reduce((n, p) => n + p.resources[r], 0);
      if (total !== (game.settings.extendedBoard || count >= 5 ? 24 : 19)) throw new Error(`Lost ${r}`);
    }
  }
  if (game.phase !== 'finished') throw new Error(`Bots stalled: ${difficulty}, ${count} players, turn ${game.turn}, phase ${game.phase}, scores ${game.players.map(p => p.score)}`);
  return { count, difficulty, turns: game.turn, decisions, winner: game.winnerId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [count, difficulty] of [[2, 'easy'], [4, 'normal'], [6, 'hard']]) console.log(simulateBots(count, difficulty));
}
