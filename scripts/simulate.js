// Compatibility entry point: exercise the same masked policy as the browser bots.
import { pathToFileURL } from 'node:url';
import { simulateBots } from './simulate-bots.js';

export function simulate(count, settings = {}) {
  const result = simulateBots(count, 'normal', settings);
  return {
    players: count,
    extendedBoard: result.extendedBoard,
    winner: result.winnerName,
    score: result.score,
    turns: result.turns,
    decisions: result.decisions,
    remainingDevelopment: result.remainingDevelopment,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const counts = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [2, 4, 6];
  for (const count of counts) console.log(JSON.stringify(simulate(count)));
}
