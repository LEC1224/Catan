// Reproducible engine microbenchmarks; timings are medians, not frame-rate claims.
// Optional module path allows a before/after comparison against a saved engine file.
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const engine = await import(pathToFileURL(resolve(process.argv[2] || 'server/game.js')).href);
const { createGame, action, viewGame } = engine;
const iterations = Number(process.env.BENCH_ITERATIONS || 500);
if (!Number.isSafeInteger(iterations) || iterations < 1) throw new Error('BENCH_ITERATIONS must be a positive integer.');

function fixture(count) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, color: '#123456' }));
  const game = createGame(players, { seed: 'engine-benchmark', map: count > 4 ? 'expanded' : 'classic', turnSeconds: 0, victoryPoints: 20, unlimitedResourceCards: true });
  while (game.phase.startsWith('setup')) {
    const legal = viewGame(game, game.activePlayerId).legal;
    const settlement = game.phase === 'setupSettlement';
    action(game, game.activePlayerId, settlement ? 'placeSettlement' : 'placeRoad', settlement ? { vertexId: legal.settlements[0] } : { edgeId: legal.roads[0] });
  }
  // Grow legal connected networks to exercise route scoring on a developed board.
  for (const player of players) {
    game.activePlayerId = player.id;
    game.phase = 'action';
    const hand = game.players.find(p => p.id === player.id).resources;
    hand.wood = hand.brick = 30;
    while (true) {
      const edgeId = viewGame(game, player.id).legal.roads[0];
      if (!edgeId) break;
      action(game, player.id, 'placeRoad', { edgeId });
    }
  }
  game.activePlayerId = players[0].id;
  game.phase = 'action';
  return game;
}

function measure(run) {
  for (let i = 0; i < 100; i++) run();
  const samples = Array.from({ length: 7 }, () => {
    const started = performance.now();
    for (let i = 0; i < iterations; i++) run();
    return (performance.now() - started) / iterations;
  }).sort((a, b) => a - b);
  return Number(samples[3].toFixed(4));
}

for (const count of [4, 6]) {
  const game = fixture(count);
  const candidate = () => engine.nextGame ? engine.nextGame(game, game.activePlayerId, 'endTurn') : action(structuredClone(game), game.activePlayerId, 'endTurn');
  console.log(JSON.stringify({
    players: count, map: game.board.map, roads: game.board.edges.filter(e => e.owner).length, iterations,
    viewAllMs: measure(() => { for (const p of game.players) viewGame(game, p.id); }),
    commandCandidateMs: measure(candidate),
  }));
}
