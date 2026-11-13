// Fixed masked observations measure policy CPU cost, not playing strength or full-game FPS.
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { action, createGame, viewGame } from '../server/game.js';
import { chooseBotAction } from '../src/bots/strategy.js';

export function botBenchmarkViews() {
  const views = [];
  for (const count of [2, 4, 6]) {
    const players = Array.from({ length: count }, (_, index) => ({ id: `bot-${index}` }));
    const game = createGame(players, { seed: `bot-benchmark-${count}`, extendedBoard: count > 4, allowPlayerTrading: false });
    while (game.phase.startsWith('setup')) {
      const id = game.activePlayerId;
      const chosen = chooseBotAction(viewGame(game, id), id, 'hard', {}, () => 0.5, 0);
      action(game, id, chosen.type, chosen);
    }
    game.phase = 'action';
    for (let stage = 0; stage < 2; stage++) {
      for (const player of game.players) {
        game.activePlayerId = player.id;
        if (stage) {
          // Broaden road networks without depending on random dice or development draws.
          for (let n = 0; n < 5; n++) {
            const legalRoads = viewGame(game, player.id).legal.roads;
            const edgeId = legalRoads[n % legalRoads.length];
            if (!edgeId) break;
            game.board.edges.find(edge => edge.id === edgeId).owner = player.id;
            player.roadsLeft--;
          }
        }
        views.push({ id: player.id, game: viewGame(game, player.id) });
      }
    }
  }
  return views;
}

export function benchmarkBots(policy = chooseBotAction, iterations = 300, samples = 7) {
  const views = botBenchmarkViews();
  const run = () => {
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (const { id, game } of views) policy(game, id, 'hard', {}, () => 0.5, 0);
    }
  };
  run(); // Warm the policy before measuring.
  const durations = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    run();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const medianMs = durations[Math.floor(samples / 2)], decisions = iterations * views.length;
  return { observations: views.length, decisionsPerSample: decisions, samples, medianMs: +medianMs.toFixed(2), microsecondsPerDecision: +(medianMs * 1000 / decisions).toFixed(2) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const policy = process.argv[2] ? (await import(pathToFileURL(resolve(process.argv[2])).href)).chooseBotAction : chooseBotAction;
  console.log(JSON.stringify(benchmarkBots(policy), null, 2));
}
