// Headless smoke simulation with normal production, costs, card effects and bank trades.
// No resources, dice results, cards or structures are injected into a running game.
import { pathToFileURL } from 'node:url';
import { createGame, action, viewGame, RESOURCES } from '../server/game.js';

const COSTS = { placeSettlement: { wood: 1, brick: 1, wool: 1, wheat: 1 }, upgradeCity: { wheat: 2, ore: 3 }, buyDevelopment: { wheat: 1, ore: 1, wool: 1 }, placeRoad: { wood: 1, brick: 1 } };
const canPay = (p, c) => Object.entries(c).every(([r, n]) => p.resources[r] >= n);
const at = (g, id) => g.board.vertices.find(v => v.id === id);
const edge = (g, id) => g.board.edges.find(e => e.id === id);
const expected = (g, v) => v.hexIds.reduce((sum, id) => { const h = g.board.hexes.find(h => h.id === id); return sum + (h.number ? 6 - Math.abs(7 - h.number) : 0); }, 0);
function bestSetup(g, id, legal) {
  const touched = new Set(g.board.vertices.filter(v => v.building?.owner === id).flatMap(v => v.hexIds).map(hId => g.board.hexes.find(h => h.id === hId).terrain));
  return legal.map(vId => {
    const v = at(g, vId), types = new Set(v.hexIds.map(hId => g.board.hexes.find(h => h.id === hId).terrain));
    const diversity = [...types].filter(r => r !== 'desert' && !touched.has(r)).length;
    return { id: vId, score: expected(g, v) + 2 * diversity + (types.has('wheat') ? 1 : 0) + (types.has('ore') ? 1 : 0) };
  }).sort((a, b) => b.score - a.score)[0].id;
}
function bestRoad(g, id, legalIds) {
  // Value the shortest route to an available settlement site. Existing roads are free.
  let best = null;
  for (const firstId of legalIds) {
    const first = edge(g, firstId), queue = [first.a, first.b].map(v => ({ v, steps: 1 })), seen = new Set();
    while (queue.length) {
      queue.sort((a, b) => a.steps - b.steps);
      const item = queue.shift(); if (seen.has(item.v) || item.steps > 5) continue; seen.add(item.v);
      const v = at(g, item.v);
      if (!v.building && v.neighborIds.every(n => !at(g, n).building)) {
        const score = 30 - item.steps * 7 + expected(g, v);
        if (!best || score > best.score) best = { id: firstId, score };
      }
      if (v.building && v.building.owner !== id) continue;
      for (const eId of v.edgeIds) {
        const e = edge(g, eId); if (e.owner && e.owner !== id) continue;
        queue.push({ v: e.a === v.id ? e.b : e.a, steps: item.steps + (e.owner === id ? 0 : 1) });
      }
    }
  }
  return best?.id || legalIds[0];
}
function supplyTrade(g, id, cost) {
  const p = g.players.find(p => p.id === id), deficits = RESOURCES.filter(r => p.resources[r] < (cost[r] || 0) && g.bank[r] > 0);
  if (!deficits.length) return false;
  const ports = g.board.vertices.filter(v => v.building?.owner === id).map(v => v.port);
  const choices = RESOURCES.map(r => ({ resource: r, ratio: ports.includes(r) ? 2 : ports.includes('any') ? 3 : 4 })).filter(({ resource, ratio }) => p.resources[resource] - (cost[resource] || 0) >= ratio);
  if (!choices.length) return false;
  choices.sort((a, b) => p.resources[b.resource] / b.ratio - p.resources[a.resource] / a.ratio);
  action(g, id, 'bankTrade', { give: choices[0].resource, receive: deficits[0] }); return true;
}
function goals(g, p, legal) {
  const options = [];
  if (legal.cities.length) options.push({ type: 'upgradeCity', vertexId: [...legal.cities].sort((a, b) => expected(g, at(g, b)) - expected(g, at(g, a)))[0] });
  if (legal.settlements.length) options.unshift({ type: 'placeSettlement', vertexId: bestSetup(g, p.id, legal.settlements) });
  if (legal.roads.length && p.settlementsLeft && p.roadsLeft > 0) options.push({ type: 'placeRoad', edgeId: bestRoad(g, p.id, legal.roads) });
  if (g.developmentDeck.length) options.push({ type: 'buyDevelopment' });
  return options;
}
function playCard(g, id, legal) {
  const p = g.players.find(p => p.id === id);
  if (g.developmentPlayed) return false;
  const card = p.development.find(c => c.type !== 'victoryPoint' && c.turnBought < g.turn && (c.type !== 'roadBuilding' || legal.roads.length));
  if (!card) return false;
  const payload = { cardId: card.id };
  if (card.type === 'invention') {
    payload.resources = {};
    const target = goals(g, p, legal)[0], cost = target ? COSTS[target.type] : COSTS.buyDevelopment;
    for (let i = 0; i < 2; i++) {
      const r = RESOURCES.filter(r => g.bank[r] > (payload.resources[r] || 0)).sort((a, b) => ((cost[b] || 0) - p.resources[b] - (payload.resources[b] || 0)) - ((cost[a] || 0) - p.resources[a] - (payload.resources[a] || 0)))[0];
      if (!r) return false; payload.resources[r] = (payload.resources[r] || 0) + 1;
    }
  }
  // Choose by board production potential; the bot does not inspect private opponent hands.
  if (card.type === 'monopoly') payload.resource = ['ore', 'wheat', 'wood', 'brick', 'wool'][g.turn % 5];
  action(g, id, 'playDevelopment', payload); return true;
}
export function simulate(count, settings = {}) {
  const g = createGame(Array.from({ length: count }, (_, i) => ({ id: `bot${i}`, name: `Bot ${i + 1}`, color: `hsl(${i * 60} 50% 50%)` })), { extendedBoard: count > 4, seed: `simulation-${count}`, turnSeconds: 0, ...settings });
  let decisions = 0;
  while (g.phase !== 'finished' && decisions++ < 20000 && g.turn < 2000) {
    const id = g.activePlayerId, p = g.players.find(p => p.id === id), view = viewGame(g, id), legal = view.legal;
    if (g.phase === 'setupSettlement') action(g, id, 'placeSettlement', { vertexId: bestSetup(g, id, legal.settlements) });
    else if (g.phase === 'setupRoad') action(g, id, 'placeRoad', { edgeId: bestRoad(g, id, legal.roads) });
    else if (g.phase === 'roll') action(g, id, 'rollDice');
    else if (g.phase === 'discard') {
      for (const [discardId, amount] of Object.entries(g.discardRequired)) {
        const resources = {}, counts = { ...g.players.find(p => p.id === discardId).resources };
        for (let n = 0; n < amount; n++) { const r = [...RESOURCES].sort((a, b) => counts[b] - counts[a])[0]; resources[r] = (resources[r] || 0) + 1; counts[r]--; }
        action(g, discardId, 'discard', { resources });
      }
    } else if (g.phase === 'robber') {
      if (!legal.robberHexes.length) throw new Error('Robber phase has no legal destination.');
      const targets = legal.robberHexes.map(hId => {
        const h = g.board.hexes.find(h => h.id === hId);
        const value = h.vertexIds.reduce((n, vId) => { const b = at(g, vId).building; return n + (b ? b.owner === id ? -100 : (b.type === 'city' ? 3 : 1) : 0); }, 0) * (h.number ? 6 - Math.abs(7 - h.number) : 0);
        return { hId, value };
      }).sort((a, b) => b.value - a.value);
      action(g, id, 'moveRobber', { hexId: targets[0].hId });
    } else if (g.phase === 'steal') action(g, id, 'steal', { targetId: g.stealTargets[0] });
    else if (g.roadBuildingRemaining) action(g, id, 'placeRoad', { edgeId: bestRoad(g, id, legal.roads) });
    else if (g.phase === 'action') {
      if (playCard(g, id, legal)) continue;
      const options = goals(g, p, legal), affordable = options.find(option => canPay(p, COSTS[option.type]));
      if (affordable) { const { type, ...payload } = affordable; action(g, id, type, payload); }
      else if (!options.some(option => supplyTrade(g, id, COSTS[option.type]))) action(g, id, 'endTurn');
    } else throw new Error(`Unexpected phase ${g.phase}`);
    for (const r of RESOURCES) {
      const total = g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0);
      if (total !== (g.settings.extendedBoard || g.players.length >= 5 ? 24 : 19)) throw new Error(`Resource conservation failed for ${r}`);
      if (g.bank[r] < 0 || g.players.some(p => p.resources[r] < 0)) throw new Error(`Negative ${r} inventory`);
    }
  }
  if (g.phase !== 'finished') throw new Error(`Simulation did not finish: ${count} players, ${g.turn} turns, scores ${g.players.map(p => p.score).join(',')}`);
  return { players: count, extendedBoard: g.settings.extendedBoard, winner: g.players.find(p => p.id === g.winnerId).name, score: g.players.find(p => p.id === g.winnerId).score, turns: g.turn, decisions, remainingDevelopment: g.developmentDeck.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const counts = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [2, 4, 6];
  for (const n of counts) console.log(JSON.stringify(simulate(n)));
}
