// Browser-only decision policy. Accepts exactly one player's masked view, never server state.
import { bankTradeRate, openTradeOffers, playerTradesAvailable, resourceStock } from '../../shared/trades.js';
import { areTeammates, gameTeams, TEAM_MIN_POINTS } from '../../shared/teams.js';

export const RESOURCES = ['wood', 'brick', 'wool', 'wheat', 'ore'];
const COST = {
  placeSettlement: { wood: 1, brick: 1, wool: 1, wheat: 1 },
  upgradeCity: { wheat: 2, ore: 3 },
  placeRoad: { wood: 1, brick: 1 },
  buyDevelopment: { wool: 1, wheat: 1, ore: 1 },
};
const empty = () => Object.fromEntries(RESOURCES.map(r => [r, 0]));
const sum = map => RESOURCES.reduce((n, r) => n + (map[r] || 0), 0);
const pays = (hand, cost) => RESOURCES.every(r => hand[r] >= (cost[r] || 0));
const missing = (hand, cost) => RESOURCES.reduce((n, r) => n + Math.max(0, (cost[r] || 0) - hand[r]), 0);
const pips = hex => hex.number ? 6 - Math.abs(7 - hex.number) : 0;

function context(g, id, difficulty) {
  const p = g.players.find(p => p.id === id);
  const vertices = new Map(g.board.vertices.map(v => [v.id, v]));
  const edges = new Map(g.board.edges.map(e => [e.id, e]));
  const hexes = new Map(g.board.hexes.map(h => [h.id, h]));
  const production = empty();
  for (const v of vertices.values()) if (v.building?.owner === id) {
    for (const hId of v.hexIds) {
      const h = hexes.get(hId);
      if (h.terrain !== 'desert') production[h.terrain] += pips(h) * (v.building.type === 'city' ? 2 : 1);
    }
  }
  const ratios = Object.fromEntries(RESOURCES.map(r => [r, bankTradeRate(g.board.vertices, id, r)]));
  const yieldAt = v => v.hexIds.reduce((n, hId) => n + pips(hexes.get(hId)), 0);
  const siteValue = v => yieldAt(v) + (difficulty === 'easy' ? 0 : v.hexIds.reduce((n, hId) => {
    const h = hexes.get(hId);
    return n + (h.terrain !== 'desert' && production[h.terrain] < 4 ? pips(h) * 0.6 : 0);
  }, 0) + (v.port ? 1 : 0));
  return { p, vertices, edges, hexes, production, ratios, yieldAt, siteValue };
}

// Bounded shortest-path evaluation: value roads that actually bring a new site closer.
function roadChoices(g, id, c, difficulty) {
  const legal = g.legal.roads;
  if (!legal.length) return [];
  const sources = new Set();
  for (const v of c.vertices.values()) if (v.building?.owner === id) sources.add(v.id);
  for (const e of c.edges.values()) if (e.owner === id) { sources.add(e.a); sources.add(e.b); }
  const maxDistance = difficulty === 'hard' ? 5 : 3;
  const extendDistances = (dist, queue) => {
    for (let head = 0; head < queue.length; head++) {
      const v = c.vertices.get(queue[head]), d = dist.get(v.id);
      if (v.building && v.building.owner !== id) continue;
      for (const eId of v.edgeIds) {
        const e = c.edges.get(eId); if (e.owner && e.owner !== id) continue;
        const next = e.a === v.id ? e.b : e.a, cost = d + (e.owner === id ? 0 : 1);
        if (cost > maxDistance || cost >= (dist.get(next) ?? Infinity)) continue;
        dist.set(next, cost); queue.push(next);
      }
    }
    return dist;
  };
  const sites = g.board.vertices.filter(v => !v.building && v.neighborIds.every(n => !c.vertices.get(n).building))
    .map(v => ({ id: v.id, value: 8 + c.siteValue(v) }));
  const before = extendDistances(new Map([...sources].map(v => [v, 0])), [...sources]);
  return legal.map(edgeId => {
    const edge = c.edges.get(edgeId), after = new Map(before), changed = [];
    // A new road makes its endpoints equally close. Only propagate improvements from
    // the newly reached endpoint; all other shortest paths are already in `before`.
    const distance = Math.min(before.get(edge.a) ?? Infinity, before.get(edge.b) ?? Infinity);
    for (const endpoint of [edge.a, edge.b]) if (distance < (after.get(endpoint) ?? Infinity)) {
      after.set(endpoint, distance); changed.push(endpoint);
    }
    extendDistances(after, changed);
    let value = 0;
    for (const v of sites) {
      const d = after.get(v.id);
      if (d !== undefined && d < (before.get(v.id) ?? Infinity)) value = Math.max(value, v.value / (d + 1));
    }
    // Late-game road building can still contest Longest Road when expansion is exhausted.
    if (!value && difficulty === 'hard' && !areTeammates(g, id, g.longestRoadHolder) && c.p.longestRoad >= 3 && c.p.longestRoad >= Math.max(...g.players.filter(p => p.id !== id).map(p => p.longestRoad)) - 2) value = 2;
    return { action: { type: 'placeRoad', edgeId }, score: value };
  });
}

function pick(options, difficulty, random) {
  if (!options.length) return null;
  const ranked = options.map(o => ({ ...o, rank: o.score + random() * (difficulty === 'easy' ? 12 : difficulty === 'normal' ? 3 : 0.5) })).sort((a, b) => b.rank - a.rank);
  return ranked[0];
}

// Plan a complete exchange-and-build sequence; never trade ingredients away from its goal.
function exchangePlan(hand, cost, bank, ratios, maxSteps) {
  const resources = { ...hand }, supply = Object.fromEntries(RESOURCES.map(r => [r, resourceStock(bank, r)])), steps = [];
  while (!pays(resources, cost) && steps.length < maxSteps) {
    const receive = RESOURCES.find(r => resources[r] < (cost[r] || 0) && supply[r] > 0);
    if (!receive) return null;
    const give = RESOURCES.filter(r => resources[r] - (cost[r] || 0) >= ratios[r])
      .sort((a, b) => (resources[b] - (cost[b] || 0)) / ratios[b] - (resources[a] - (cost[a] || 0)) / ratios[a])[0];
    if (!give) return null;
    resources[give] -= ratios[give]; supply[give] += ratios[give]; resources[receive]++; supply[receive]--;
    steps.push({ type: 'bankTrade', give, receive, amount: 1 });
  }
  return pays(resources, cost) ? steps : null;
}

function achievableGoal(options, g, c, difficulty, memory, random) {
  // Every site of the same building type has the same exchange cost. Evaluate it once.
  const plans = new Map();
  const maxSteps = difficulty === 'hard' ? 5 : difficulty === 'normal' ? 2 : 1;
  const achievable = options.flatMap(option => {
    const type = option.action.type;
    if (!plans.has(type)) plans.set(type, exchangePlan(c.p.resources, COST[type], g.bank, c.ratios, maxSteps));
    const plan = plans.get(type);
    return plan ? [{ ...option, plan, score: option.score / (1 + plan.length * 0.2) }] : [];
  });
  // Once an exchange starts, finish its build before spending those ingredients elsewhere.
  return achievable.find(option => JSON.stringify(option.action) === memory.exchangeGoal) || pick(achievable, difficulty, random);
}

function goals(g, id, c, difficulty) {
  const options = [];
  for (const vertexId of g.legal.settlements) options.push({ action: { type: 'placeSettlement', vertexId }, score: 32 + c.siteValue(c.vertices.get(vertexId)) });
  for (const vertexId of g.legal.cities) options.push({ action: { type: 'upgradeCity', vertexId }, score: 30 + c.yieldAt(c.vertices.get(vertexId)) * 1.5 });
  if (c.p.settlementsLeft || difficulty === 'hard') for (const road of roadChoices(g, id, c, difficulty)) {
    if (road.score > 0) options.push({ ...road, score: 9 + road.score * 0.4 });
  }
  if (g.developmentRemaining !== 0) options.push({ action: { type: 'buyDevelopment' }, score: 17 + (c.p.knights >= 2 && !areTeammates(g, id, g.largestArmyHolder) ? 5 : 0) });
  // Prioritize the point that ends the game.
  const teammate = g.players.find(p => areTeammates(g, id, p.id));
  const nearWin = teammate ? teammate.visibleScore >= TEAM_MIN_POINTS && c.p.score >= TEAM_MIN_POINTS - 1 && c.p.score + teammate.visibleScore >= g.settings.teamVictoryPoints - 1
    : c.p.score >= g.settings.victoryPoints - 1;
  if (nearWin) for (const o of options) if (['placeSettlement', 'upgradeCity'].includes(o.action.type)) o.score += 100;
  return options;
}

function playCard(g, id, c, cost, difficulty) {
  if (g.developmentPlayed) return null;
  for (const card of c.p.development) {
    if (card.turnBought >= g.turn || card.type === 'victoryPoint') continue;
    const a = { type: 'playDevelopment', cardId: card.id };
    if (card.type === 'knight') {
      const blocked = c.hexes.get(g.robberHexId).vertexIds.some(v => {
        const owner = c.vertices.get(v).building?.owner;
        return owner === id || areTeammates(g, id, owner);
      });
      if (blocked || g.phase === 'action' || difficulty === 'easy') return a;
    }
    if (g.phase !== 'action') continue;
    if (card.type === 'roadBuilding' && g.legal.roads.length) return a;
    if (card.type === 'invention') {
      const resources = empty();
      for (let n = 0; n < 2; n++) {
        const r = RESOURCES.filter(r => resourceStock(g.bank, r) > resources[r]).sort((a, b) =>
          ((cost[b] || 0) - c.p.resources[b] - resources[b]) - ((cost[a] || 0) - c.p.resources[a] - resources[a]))[0];
        if (!r) break;
        resources[r]++;
      }
      if (sum(resources) === 2) return { ...a, resources };
    }
    if (card.type === 'monopoly') {
      // Public production is an estimate, not access to opponents' hands.
      const estimate = empty();
      for (const v of c.vertices.values()) if (v.building && v.building.owner !== id) for (const hId of v.hexIds) {
        const h = c.hexes.get(hId); if (h.terrain !== 'desert') estimate[h.terrain] += pips(h) * (v.building.type === 'city' ? 2 : 1) * (areTeammates(g, id, v.building.owner) ? -1 : 1);
      }
      const resource = [...RESOURCES].sort((a, b) => estimate[b] + Math.max(0, (cost[b] || 0) - c.p.resources[b]) * 2 - estimate[a] - Math.max(0, (cost[a] || 0) - c.p.resources[a]) * 2)[0];
      if (g.players.some(p => p.id !== id && !areTeammates(g, id, p.id) && p.resourceCount > 0) && (g.settings.mode !== 'teams' || estimate[resource] > 0)) return { ...a, resource };
    }
  }
  return null;
}

export function chooseBotAction(g, id, difficulty = 'normal', memory = {}, random = Math.random, now = Date.now()) {
  if (!g || g.phase === 'finished') return null;
  const c = context(g, id, difficulty), p = c.p;
  if (!p?.resources) return null;
  if (memory.turn !== g.turn) { for (const key of Object.keys(memory)) delete memory[key]; memory.turn = g.turn; }
  if (g.phase === 'discard' && g.discardRequired[id]) {
    const hand = { ...p.resources }, resources = empty();
    const cost = p.citiesLeft && g.board.vertices.some(v => v.building?.owner === id && v.building.type === 'settlement') ? COST.upgradeCity : COST.placeSettlement;
    for (let n = 0; n < g.discardRequired[id]; n++) {
      const r = RESOURCES.filter(r => hand[r] > 0).sort((a, b) => (hand[b] - (difficulty === 'easy' ? 0 : cost[b] || 0)) - (hand[a] - (difficulty === 'easy' ? 0 : cost[a] || 0)))[0];
      resources[r]++; hand[r]--;
    }
    return { type: 'discard', resources };
  }
  // Off-turn trade decisions use only our hand and public opponent scores.
  const trading = playerTradesAvailable(g);
  const offers = openTradeOffers(g);
  if (trading && g.activePlayerId !== id) {
    const incoming = offers.filter(offer => offer.from !== id);
    if (incoming.length) {
      const value = map => RESOURCES.reduce((n, r) => n + (map[r] || 0) * (1 + 2 / (1 + p.resources[r]) + (c.production[r] === 0 ? 0.7 : 0)), 0);
      const good = incoming.map(offer => {
        const sender = g.players.find(other => other.id === offer.from);
        const partner = areTeammates(g, id, sender.id);
        const rivalTeam = gameTeams(g).find(team => team.id === sender.teamId);
        const nearVictory = rivalTeam ? rivalTeam.players.every(p => p.visibleScore >= TEAM_MIN_POINTS - 1) && rivalTeam.players.reduce((n, p) => n + p.visibleScore, 0) >= g.settings.teamVictoryPoints - 2
          : sender.visibleScore >= g.settings.victoryPoints - 2;
        return { id: offer.id, surplus: pays(p.resources, offer.want) && (partner || difficulty === 'easy' || !nearVictory)
          ? value(offer.give) - value(offer.want) * (partner ? 0.8 : difficulty === 'easy' ? 0.85 : 1.05) : 0 };
      }).sort((a, b) => b.surplus - a.surplus)[0];
      return good.surplus > 0 ? { type: 'acceptTrade', offerId: good.id } : { type: 'declineTrade', offerId: incoming[0].id };
    }
  }
  if (g.activePlayerId !== id) return null;
  if (g.phase === 'setupSettlement') {
    const best = pick(g.legal.settlements.map(vertexId => ({ action: { type: 'placeSettlement', vertexId }, score: c.siteValue(c.vertices.get(vertexId)) })), difficulty, random);
    return best?.action || null;
  }
  if (g.phase === 'setupRoad' || g.roadBuildingRemaining) return pick(roadChoices(g, id, c, difficulty), difficulty, random)?.action || null;
  if (g.phase === 'roll') return playCard(g, id, c, COST.upgradeCity, difficulty) || { type: 'rollDice' };
  if (g.phase === 'robber') return pick(g.legal.robberHexes.map(hexId => {
    const h = c.hexes.get(hexId);
    const score = h.vertexIds.reduce((n, vId) => {
      const b = c.vertices.get(vId).building; if (!b) return n;
      const owner = g.players.find(p => p.id === b.owner);
      return n + (b.owner === id || areTeammates(g, id, b.owner) ? -40 : (1 + (difficulty === 'hard' ? owner.visibleScore : 0)) * (b.type === 'city' ? 2 : 1));
    }, 0) * pips(h);
    return { action: { type: 'moveRobber', hexId }, score };
  }), difficulty, random)?.action || null;
  if (g.phase === 'steal') return pick(g.stealTargets.map(targetId => ({ action: { type: 'steal', targetId }, score: areTeammates(g, id, targetId) ? -100 : g.players.find(p => p.id === targetId).visibleScore * 2 })), difficulty, random)?.action || null;
  if (g.phase !== 'action') return null;
  const own = trading && offers.find(offer => offer.from === id);
  if (own) {
    memory.offerUntil ??= now + 6000;
    return now >= memory.offerUntil ? { type: 'cancelTrade', offerId: own.id } : null;
  }
  const options = goals(g, id, c, difficulty);
  const achievable = achievableGoal(options, g, c, difficulty, memory, random);
  const target = options.find(o => JSON.stringify(o.action) === memory.exchangeGoal) || pick(options.map(o => ({ ...o, score: o.score / (1 + missing(p.resources, COST[o.action.type]) * 0.6) + (memory.goal === JSON.stringify(o.action) ? 2 : 0) })), difficulty, random);
  const cost = target ? COST[target.action.type] : COST.buyDevelopment;
  if (target) memory.goal = JSON.stringify(target.action);
  if (achievable?.score >= 100 && !achievable.plan.length) return achievable.action;
  const card = playCard(g, id, c, cost, difficulty);
  if (card) return card;
  if (achievable) {
    memory.exchangeGoal = achievable.plan.length ? JSON.stringify(achievable.action) : undefined;
    return achievable.plan[0] || achievable.action;
  }
  delete memory.exchangeGoal;
  if (target && !memory.offered && trading) {
    const receive = RESOURCES.find(r => p.resources[r] < (cost[r] || 0));
    const give = RESOURCES.filter(r => r !== receive && p.resources[r] > (cost[r] || 0))
      .sort((a, b) => p.resources[b] - p.resources[a])[0];
    if (receive && give) {
      memory.offered = true; memory.offerUntil = now + 6000;
      return { type: 'offerTrade', give: { ...empty(), [give]: 1 }, want: { ...empty(), [receive]: 1 } };
    }
  }
  return { type: 'endTurn' };
}
