import { randomInt, randomUUID } from 'node:crypto';

export const RESOURCES = ['wood', 'brick', 'wool', 'wheat', 'ore'];
const COSTS = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, wool: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { wool: 1, wheat: 1, ore: 1 } };
const DEFAULTS = { maxPlayers: 4, extendedBoard: false, victoryPoints: 10, discardThreshold: 7, hardHandLimit: 0, turnSeconds: 120, friendlyRobber: false, balancedNumbers: true, allowPlayerTrading: true, pairedTurns: true, seed: '' };
const emptyResources = () => Object.fromEntries(RESOURCES.map(r => [r, 0]));
const sum = map => RESOURCES.reduce((n, r) => n + (map[r] || 0), 0);
const fail = text => { throw new Error(text); };
const requireThat = (condition, text) => { if (!condition) fail(text); };
const player = (g, id) => g.players.find(p => p.id === id);
const vertex = (g, id) => g.board.vertices.find(v => v.id === id);
const edge = (g, id) => g.board.edges.find(e => e.id === id);
const hex = (g, id) => g.board.hexes.find(h => h.id === id);
const addLog = (g, text) => { g.log.push({ text, at: Date.now() }); if (g.log.length > 120) g.log.shift(); };
const setDeadline = g => { g.deadline = g.settings.turnSeconds ? Date.now() + g.settings.turnSeconds * 1000 : null; };
function phase(g, value) { g.phase = value; setDeadline(g); }
function shuffle(items, random = n => randomInt(n)) { for (let i = items.length - 1; i > 0; i--) { const j = random(i + 1); [items[i], items[j]] = [items[j], items[i]]; } return items; }
function seededRandom(seed) {
  let state = 2166136261;
  for (const c of String(seed)) { state ^= c.charCodeAt(0); state = Math.imul(state, 16777619); }
  return n => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * n); };
}

function buildBoard(settings) {
  const random = settings.seed ? seededRandom(settings.seed) : n => randomInt(n);
  const rows = settings.extendedBoard ? [3, 4, 5, 6, 5, 4, 3] : [3, 4, 5, 4, 3];
  const counts = settings.extendedBoard ? [6, 5, 6, 6, 5, 2] : [4, 3, 4, 4, 3, 1];
  const terrains = shuffle([...RESOURCES, 'desert'].flatMap((r, i) => Array(counts[i]).fill(r)), random);
  const vertices = [], edges = [], hexes = [], vertexMap = new Map(), edgeMap = new Map();
  rows.forEach((length, row) => {
    for (let col = 0; col < length; col++) {
      const x = (col - (length - 1) / 2) * Math.sqrt(3) * 60, y = (row - (rows.length - 1) / 2) * 90;
      const h = { id: `h${hexes.length}`, x, y, terrain: terrains[hexes.length], number: null, vertexIds: [], edgeIds: [] };
      for (let k = 0; k < 6; k++) {
        const angle = (k * 60 - 90) * Math.PI / 180, vx = x + 60 * Math.cos(angle), vy = y + 60 * Math.sin(angle);
        const key = `${Math.round(vx * 1000)},${Math.round(vy * 1000)}`;
        let v = vertexMap.get(key);
        if (!v) { v = { id: `v${vertices.length}`, x: vx, y: vy, hexIds: [], edgeIds: [], neighborIds: [], building: null, port: null }; vertices.push(v); vertexMap.set(key, v); }
        v.hexIds.push(h.id); h.vertexIds.push(v.id);
      }
      for (let k = 0; k < 6; k++) {
        const a = h.vertexIds[k], b = h.vertexIds[(k + 1) % 6], key = [a, b].sort().join(':');
        let e = edgeMap.get(key);
        if (!e) { e = { id: `e${edges.length}`, a, b, owner: null, hexIds: [] }; edges.push(e); edgeMap.set(key, e); vertices.find(v => v.id === a).edgeIds.push(e.id); vertices.find(v => v.id === b).edgeIds.push(e.id); vertices.find(v => v.id === a).neighborIds.push(b); vertices.find(v => v.id === b).neighborIds.push(a); }
        e.hexIds.push(h.id); h.edgeIds.push(e.id);
      }
      hexes.push(h);
    }
  });
  const productive = hexes.filter(h => h.terrain !== 'desert');
  const numbers = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].flatMap(n => Array(settings.extendedBoard ? (n === 2 || n === 12 ? 2 : 3) : (n === 2 || n === 12 ? 1 : 2)).fill(n));
  // Place frequent red numbers on an independent set; remaining numbers are unconstrained.
  if (settings.balancedNumbers) {
    const redCount = settings.extendedBoard ? 6 : 4;
    let selected = null;
    for (let attempt = 0; attempt < 200 && !selected; attempt++) {
      const chosen = [];
      for (const h of shuffle([...productive], random)) {
        if (!chosen.some(other => h.edgeIds.some(id => other.edgeIds.includes(id)))) chosen.push(h);
        if (chosen.length === redCount) { selected = chosen; break; }
      }
    }
    requireThat(selected, 'Could not create a balanced board. Try another seed.');
    const reds = shuffle(numbers.filter(n => n === 6 || n === 8), random), rest = shuffle(numbers.filter(n => n !== 6 && n !== 8), random);
    for (const h of productive) h.number = selected.includes(h) ? reds.pop() : rest.pop();
  } else { shuffle(numbers, random); productive.forEach((h, i) => { h.number = numbers[i]; }); }
  const coastalEdges = edges.filter(e => e.hexIds.length === 1).sort((a, b) => {
    const av = vertices.find(v => v.id === a.a), aw = vertices.find(v => v.id === a.b), bv = vertices.find(v => v.id === b.a), bw = vertices.find(v => v.id === b.b);
    return Math.atan2(av.y + aw.y, av.x + aw.x) - Math.atan2(bv.y + bw.y, bv.x + bw.x);
  });
  const portTypes = shuffle(['any', 'any', 'any', 'any', ...RESOURCES, ...(settings.extendedBoard ? ['any', 'wool'] : [])], random);
  const ports = [];
  portTypes.forEach((type, i) => {
    const e = coastalEdges[Math.floor(i * coastalEdges.length / portTypes.length)];
    vertices.find(v => v.id === e.a).port = type; vertices.find(v => v.id === e.b).port = type;
    ports.push({ id: `port${i}`, type, vertexIds: [e.a, e.b], edgeId: e.id });
  });
  return { hexes, vertices, edges, ports };
}

function resourceMap(value, { nonzero = false } = {}) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Choose resource quantities.');
  requireThat(Object.keys(value).every(k => RESOURCES.includes(k)), 'Unknown resource.');
  const map = emptyResources();
  for (const r of RESOURCES) { const n = value[r] ?? 0; requireThat(Number.isInteger(n) && n >= 0 && n <= 150, 'Resource quantities must be whole, non-negative numbers.'); map[r] = n; }
  requireThat(!nonzero || sum(map) > 0, 'Choose at least one resource.');
  return map;
}
function canPay(p, cost) { return Object.entries(cost).every(([r, n]) => p.resources[r] >= n); }
function pay(g, p, cost) { requireThat(canPay(p, cost), 'You do not have enough resources.'); for (const [r, n] of Object.entries(cost)) { p.resources[r] -= n; g.bank[r] += n; } }
function grant(g, p, map) { for (const [r, n] of Object.entries(map)) { requireThat(g.bank[r] >= n, `The supply does not have enough ${r}.`); g.bank[r] -= n; p.resources[r] += n; } }
function enforceHandLimits(g) {
  if (!g.settings.hardHandLimit) return;
  for (const p of g.players) {
    let excess = sum(p.resources) - g.settings.hardHandLimit, removed = 0;
    while (excess-- > 0) { const r = [...RESOURCES].sort((a, b) => p.resources[b] - p.resources[a])[0]; p.resources[r]--; g.bank[r]++; removed++; }
    if (removed) addLog(g, `${p.name} returned ${removed} cards above the hard hand limit (largest piles first).`);
  }
}

function roadLength(g, id) {
  const owned = g.board.edges.filter(e => e.owner === id);
  if (!owned.length) return 0;
  const at = new Map();
  owned.forEach(e => { for (const v of [e.a, e.b]) { if (!at.has(v)) at.set(v, []); at.get(v).push(e); } });
  const blocked = new Set(g.board.vertices.filter(v => v.building && v.building.owner !== id).map(v => v.id));
  let longest = 0;
  function walk(v, used, length) {
    longest = Math.max(longest, length);
    if (length && blocked.has(v)) return;
    for (const e of at.get(v) || []) if (!used.has(e.id)) { used.add(e.id); walk(e.a === v ? e.b : e.a, used, length + 1); used.delete(e.id); }
  }
  for (const v of at.keys()) walk(v, new Set(), 0);
  return longest;
}
function updateScores(g) {
  for (const p of g.players) {
    const buildings = g.board.vertices.filter(v => v.building?.owner === p.id);
    p.settlementsLeft = 5 - buildings.filter(v => v.building.type === 'settlement').length;
    p.citiesLeft = 4 - buildings.filter(v => v.building.type === 'city').length;
    p.roadsLeft = 15 - g.board.edges.filter(e => e.owner === p.id).length;
    p.longestRoad = roadLength(g, p.id);
  }
  const previousRoad = g.longestRoadHolder, maximum = Math.max(...g.players.map(p => p.longestRoad));
  const leaders = g.players.filter(p => p.longestRoad === maximum);
  g.longestRoadHolder = maximum < 5 ? null : leaders.some(p => p.id === previousRoad) ? previousRoad : leaders.length === 1 ? leaders[0].id : null;
  const previousArmy = g.largestArmyHolder, mostKnights = Math.max(...g.players.map(p => p.knights));
  const armyLeaders = g.players.filter(p => p.knights === mostKnights);
  g.largestArmyHolder = mostKnights < 3 ? null : armyLeaders.some(p => p.id === previousArmy) ? previousArmy : armyLeaders.length === 1 ? armyLeaders[0].id : null;
  for (const p of g.players) {
    p.resourceCount = sum(p.resources); p.developmentCount = p.development.length;
    p.visibleScore = 5 - p.settlementsLeft + 2 * (4 - p.citiesLeft) + (g.longestRoadHolder === p.id ? 2 : 0) + (g.largestArmyHolder === p.id ? 2 : 0);
    p.score = p.visibleScore + p.development.filter(c => c.type === 'victoryPoint').length;
  }
  if (previousRoad !== g.longestRoadHolder && g.longestRoadHolder) addLog(g, `${player(g, g.longestRoadHolder).name} claimed Longest Route.`);
  if (previousArmy !== g.largestArmyHolder && g.largestArmyHolder) addLog(g, `${player(g, g.largestArmyHolder).name} claimed Largest Army.`);
}
function checkVictory(g) {
  if (g.phase.startsWith('setup') || g.phase === 'finished') return;
  const p = player(g, g.activePlayerId);
  if (p?.score >= g.settings.victoryPoints) { g.winnerId = p.id; g.phase = 'finished'; g.deadline = null; g.tradeOffer = null; addLog(g, `${p.name} won with ${p.score} victory points!`); }
}
function settlementTargets(g, id, setup = false) {
  const p = player(g, id);
  if (!p || p.settlementsLeft < 1) return [];
  return g.board.vertices.filter(v => !v.building && v.neighborIds.every(n => !vertex(g, n).building) && (setup || v.edgeIds.some(e => edge(g, e).owner === id))).map(v => v.id);
}
function roadTargets(g, id, setup = false) {
  if (!player(g, id)?.roadsLeft) return [];
  return g.board.edges.filter(e => !e.owner && (setup ? [e.a, e.b].includes(g.setupVertexId) : [e.a, e.b].some(vId => { const v = vertex(g, vId); return v.building ? v.building.owner === id : v.edgeIds.some(eId => edge(g, eId).owner === id); }))).map(e => e.id);
}
function robberTargets(g, id) {
  return g.board.hexes.filter(h => h.id !== g.robberHexId && (!g.settings.friendlyRobber || !h.vertexIds.some(vId => { const b = vertex(g, vId).building; return b && b.owner !== id && player(g, b.owner).visibleScore < 3; }))).map(h => h.id);
}
function legal(g, id) {
  const result = { settlements: [], roads: [], cities: [], robberHexes: [] };
  if (id !== g.activePlayerId || g.phase === 'finished') return result;
  if (g.phase === 'setupSettlement') result.settlements = settlementTargets(g, id, true);
  if (g.phase === 'setupRoad') result.roads = roadTargets(g, id, true);
  if (g.phase === 'action') {
    result.roads = roadTargets(g, id);
    if (!g.roadBuildingRemaining) {
      result.settlements = settlementTargets(g, id);
      if (player(g, id).citiesLeft) result.cities = g.board.vertices.filter(v => v.building?.owner === id && v.building.type === 'settlement').map(v => v.id);
    }
  }
  if (g.phase === 'robber') result.robberHexes = robberTargets(g, id);
  return result;
}
function startTurn(g, index, paired = false) {
  g.activePlayerId = g.players[index].id; g.pairedPlayer = paired; g.turn++; g.developmentPlayed = false;
  g.roadBuildingRemaining = 0; g.tradeOffer = null; g.discardRequired = {}; g.stealTargets = []; g.dice = paired ? g.dice : null;
  phase(g, paired ? 'action' : 'roll');
  addLog(g, `${g.players[index].name}'s ${paired ? 'paired action' : 'turn'}.`);
  checkVictory(g);
}
function nextTurn(g) {
  if (g.settings.pairedTurns && g.players.length >= 5 && !g.pairedPlayer) startTurn(g, (g.primaryIndex + 3) % g.players.length, true);
  else { g.primaryIndex = (g.primaryIndex + 1) % g.players.length; startTurn(g, g.primaryIndex); }
}
function activateRobber(g, returnPhase = 'action') {
  g.robberReturnPhase = returnPhase;
  if (!robberTargets(g, g.activePlayerId).length) { addLog(g, 'Friendly robber: no eligible destination, so the robber stays.'); phase(g, returnPhase); }
  else phase(g, 'robber');
}

export function createGame(players, settings = {}) {
  requireThat(players.length >= 2 && players.length <= 6, 'A game needs two to six players.');
  requireThat(new Set(players.map(p => p.id)).size === players.length, 'Player IDs must be unique.');
  const merged = { ...DEFAULTS, ...settings }, board = buildBoard(merged);
  const expandedSupply = players.length >= 5 || merged.extendedBoard;
  const deckTypes = [['knight', expandedSupply ? 20 : 14], ['victoryPoint', 5], ['roadBuilding', expandedSupply ? 3 : 2], ['invention', expandedSupply ? 3 : 2], ['monopoly', expandedSupply ? 3 : 2]];
  const g = {
    settings: merged, board, players: players.map(p => ({ id: p.id, name: p.name, color: p.color, resources: emptyResources(), development: [], resourceCount: 0, developmentCount: 0, knights: 0, roadsLeft: 15, settlementsLeft: 5, citiesLeft: 4, score: 0, visibleScore: 0, longestRoad: 0 })),
    bank: Object.fromEntries(RESOURCES.map(r => [r, expandedSupply ? 24 : 19])),
    developmentDeck: shuffle(deckTypes.flatMap(([type, n]) => Array.from({ length: n }, () => ({ id: randomUUID(), type })))), playedDevelopment: [],
    phase: 'setupSettlement', activePlayerId: players[0].id, turn: 0, deadline: null, winnerId: null, dice: null,
    robberHexId: board.hexes.find(h => h.terrain === 'desert').id, longestRoadHolder: null, largestArmyHolder: null,
    log: [], pairedPlayer: false, primaryIndex: 0, setupOrder: [...players.map(p => p.id), ...players.map(p => p.id).reverse()], setupIndex: 0, setupVertexId: null,
    discardRequired: {}, stealTargets: [], tradeOffer: null, roadBuildingRemaining: 0, developmentPlayed: false,
  };
  setDeadline(g); addLog(g, 'Place your first settlement and road.');
  if (players.length === 2) addLog(g, 'Two-player casual variant: standard core rules without neutral players.');
  return g;
}

function applyAction(g, id, type, payload) {
  const p = player(g, id);
  requireThat(p, 'You are not a player in this game.');
  requireThat(g.phase !== 'finished', 'This game has ended.');
  if (type === 'discard') {
    requireThat(g.phase === 'discard' && g.discardRequired[id] > 0, 'You do not need to discard.');
    const resources = resourceMap(payload.resources);
    requireThat(sum(resources) === g.discardRequired[id], `Discard exactly ${g.discardRequired[id]} resources.`);
    pay(g, p, resources); delete g.discardRequired[id]; addLog(g, `${p.name} discarded ${sum(resources)} resources.`);
    if (!Object.keys(g.discardRequired).length) activateRobber(g);
    return;
  }
  if (type === 'acceptTrade') {
    requireThat(g.phase === 'action' && !g.roadBuildingRemaining && g.tradeOffer && g.tradeOffer.from !== id && !g.pairedPlayer, 'There is no trade you can accept.');
    const offer = g.tradeOffer, other = player(g, offer.from);
    requireThat(canPay(other, offer.give) && canPay(p, offer.want), 'One player no longer has the offered resources.');
    for (const r of RESOURCES) { p.resources[r] += offer.give[r] - offer.want[r]; other.resources[r] += offer.want[r] - offer.give[r]; }
    addLog(g, `${p.name} traded with ${other.name}.`); g.tradeOffer = null; return;
  }
  requireThat(g.activePlayerId === id, 'Wait for your turn.');
  if (g.roadBuildingRemaining) requireThat(type === 'placeRoad', 'Finish placing your free roads first.');
  switch (type) {
    case 'placeSettlement': {
      const setup = g.phase === 'setupSettlement';
      requireThat(setup || g.phase === 'action', 'You cannot build a settlement now.');
      requireThat(settlementTargets(g, id, setup).includes(payload.vertexId), 'That settlement position is not legal.');
      if (!setup) pay(g, p, COSTS.settlement);
      const v = vertex(g, payload.vertexId); v.building = { owner: id, type: 'settlement' }; addLog(g, `${p.name} built a settlement.`);
      if (setup) {
        g.setupVertexId = v.id;
        if (g.setupIndex >= g.players.length) { for (const hId of v.hexIds) { const h = hex(g, hId); if (h.terrain !== 'desert') grant(g, p, { [h.terrain]: 1 }); } }
        phase(g, 'setupRoad');
      }
      break;
    }
    case 'placeRoad': {
      const setup = g.phase === 'setupRoad';
      requireThat(setup || g.phase === 'action', 'You cannot build a road now.');
      requireThat(roadTargets(g, id, setup).includes(payload.edgeId), 'That road position is not legal.');
      if (!setup && !g.roadBuildingRemaining) pay(g, p, COSTS.road);
      edge(g, payload.edgeId).owner = id; addLog(g, `${p.name} built a road.`);
      if (setup) {
        g.setupIndex++;
        if (g.setupIndex === g.setupOrder.length) { updateScores(g); startTurn(g, 0); }
        else { g.activePlayerId = g.setupOrder[g.setupIndex]; phase(g, 'setupSettlement'); }
      } else if (g.roadBuildingRemaining) {
        g.roadBuildingRemaining--; updateScores(g);
        if (!roadTargets(g, id).length) g.roadBuildingRemaining = 0;
        if (!g.roadBuildingRemaining) phase(g, g.roadBuildingReturnPhase || 'action');
      }
      break;
    }
    case 'upgradeCity': {
      requireThat(g.phase === 'action', 'You can upgrade only in your action phase.');
      const v = vertex(g, payload.vertexId);
      requireThat(v?.building?.owner === id && v.building.type === 'settlement' && p.citiesLeft > 0, 'Choose one of your settlements and an available city.');
      pay(g, p, COSTS.city); v.building.type = 'city'; addLog(g, `${p.name} upgraded a settlement to a city.`); break;
    }
    case 'rollDice': {
      requireThat(g.phase === 'roll', 'You have already rolled this turn.');
      g.dice = [randomInt(1, 7), randomInt(1, 7)]; const total = g.dice[0] + g.dice[1]; addLog(g, `${p.name} rolled ${total}.`);
      if (total === 7) {
        g.discardRequired = Object.fromEntries(g.players.filter(other => sum(other.resources) > g.settings.discardThreshold).map(other => [other.id, Math.floor(sum(other.resources) / 2)]));
        if (Object.keys(g.discardRequired).length) phase(g, 'discard'); else activateRobber(g);
      } else {
        const due = Object.fromEntries(g.players.map(other => [other.id, emptyResources()]));
        for (const h of g.board.hexes) if (h.number === total && h.id !== g.robberHexId) {
          for (const vId of h.vertexIds) { const b = vertex(g, vId).building; if (b) due[b.owner][h.terrain] += b.type === 'city' ? 2 : 1; }
        }
        for (const r of RESOURCES) {
          const recipients = g.players.filter(other => due[other.id][r] > 0), demand = recipients.reduce((n, other) => n + due[other.id][r], 0);
          if (demand > g.bank[r] && recipients.length > 1) addLog(g, `The ${r} supply cannot cover production; nobody receives ${r}.`);
          else for (const other of recipients) grant(g, other, { [r]: Math.min(due[other.id][r], g.bank[r]) });
        }
        phase(g, 'action');
      }
      break;
    }
    case 'moveRobber': {
      requireThat(g.phase === 'robber', 'You cannot move the robber now.');
      requireThat(robberTargets(g, id).includes(payload.hexId), 'Choose a different eligible hex for the robber.');
      g.robberHexId = payload.hexId;
      g.stealTargets = [...new Set(hex(g, payload.hexId).vertexIds.map(vId => vertex(g, vId).building?.owner).filter(owner => owner && owner !== id && sum(player(g, owner).resources) > 0))];
      addLog(g, `${p.name} moved the robber.`);
      if (!g.stealTargets.length) phase(g, g.robberReturnPhase || 'action');
      else if (g.stealTargets.length === 1) { phase(g, 'steal'); applyAction(g, id, 'steal', { targetId: g.stealTargets[0] }); }
      else phase(g, 'steal');
      break;
    }
    case 'steal': {
      requireThat(g.phase === 'steal' && g.stealTargets.includes(payload.targetId), 'Choose an eligible opponent.');
      const target = player(g, payload.targetId), cards = RESOURCES.flatMap(r => Array(target.resources[r]).fill(r));
      if (cards.length) { const r = cards[randomInt(cards.length)]; target.resources[r]--; p.resources[r]++; addLog(g, `${p.name} stole one resource from ${target.name}.`); }
      g.stealTargets = []; phase(g, g.robberReturnPhase || 'action'); break;
    }
    case 'endTurn': requireThat(g.phase === 'action', 'Finish the current decision before ending your turn.'); nextTurn(g); break;
    case 'bankTrade': {
      requireThat(g.phase === 'action', 'Trade during your action phase.');
      const { give, receive } = payload, amount = payload.amount ?? 1;
      requireThat(RESOURCES.includes(give) && RESOURCES.includes(receive) && give !== receive, 'Choose two different resources.');
      requireThat(Number.isInteger(amount) && amount >= 1 && amount <= 24, 'Choose a valid trade quantity.');
      const ports = g.board.vertices.filter(v => v.building?.owner === id).map(v => v.port), ratio = ports.includes(give) ? 2 : ports.includes('any') ? 3 : 4;
      requireThat(g.bank[receive] >= amount, `The supply does not have enough ${receive}.`);
      pay(g, p, { [give]: ratio * amount }); grant(g, p, { [receive]: amount }); addLog(g, `${p.name} exchanged ${ratio * amount} ${give} for ${amount} ${receive}.`); break;
    }
    case 'offerTrade': {
      requireThat(g.phase === 'action' && g.settings.allowPlayerTrading && !g.pairedPlayer, 'Player trading is not available now.');
      const give = resourceMap(payload.give, { nonzero: true }), want = resourceMap(payload.want, { nonzero: true });
      requireThat(!RESOURCES.some(r => give[r] && want[r]), 'The same resource cannot appear on both sides of a trade.');
      requireThat(canPay(p, give), 'You do not have the offered resources.');
      g.tradeOffer = { id: randomUUID(), from: id, give, want }; break;
    }
    case 'cancelTrade': requireThat(g.phase === 'action', 'There is no trade to cancel now.'); g.tradeOffer = null; break;
    case 'buyDevelopment': {
      requireThat(g.phase === 'action', 'Buy development cards during your action phase.');
      requireThat(g.developmentDeck.length > 0, 'The development deck is empty.');
      pay(g, p, COSTS.development); p.development.push({ ...g.developmentDeck.pop(), turnBought: g.turn }); addLog(g, `${p.name} bought a development card.`); break;
    }
    case 'playDevelopment': {
      requireThat(g.phase === 'roll' || g.phase === 'action', 'Play development cards before rolling or during your action phase.');
      const card = p.development.find(c => c.id === payload.cardId);
      requireThat(card, 'That development card is not in your hand.');
      requireThat(card.type !== 'victoryPoint', 'Victory Point cards count automatically and are revealed when you win.');
      requireThat(!g.developmentPlayed, 'You may play only one development card per turn.');
      requireThat(card.turnBought < g.turn, 'You cannot play a development card on the turn you bought it.');
      const returnPhase = g.phase;
      if (card.type === 'invention') {
        const map = resourceMap(payload.resources); requireThat(sum(map) === 2, 'Choose exactly two resources.'); grant(g, p, map);
      } else if (card.type === 'monopoly') {
        requireThat(RESOURCES.includes(payload.resource), 'Choose a resource to monopolize.');
        let count = 0; for (const other of g.players) if (other.id !== id) { count += other.resources[payload.resource]; other.resources[payload.resource] = 0; }
        p.resources[payload.resource] += count; addLog(g, `${p.name} collected ${count} ${payload.resource} with Monopoly.`);
      } else if (card.type === 'roadBuilding') {
        requireThat(roadTargets(g, id).length > 0, 'You have no legal road to build.');
        g.roadBuildingRemaining = Math.min(2, p.roadsLeft); g.roadBuildingReturnPhase = returnPhase; phase(g, 'action');
      } else if (card.type === 'knight') { p.knights++; activateRobber(g, returnPhase); }
      else fail('Unknown development card.');
      p.development = p.development.filter(c => c.id !== card.id); g.playedDevelopment.push(card); g.developmentPlayed = true;
      addLog(g, `${p.name} played ${card.type === 'roadBuilding' ? 'Road Building' : card.type === 'invention' ? 'Invention' : card.type === 'knight' ? 'a Knight' : 'Monopoly'}.`); break;
    }
    default: fail('Unknown game action.');
  }
}

export function action(game, playerId, type, payload = {}) {
  // Commit only successful commands: invalid card selections/trades never partially mutate a game.
  const draft = structuredClone(game);
  applyAction(draft, playerId, type, payload);
  enforceHandLimits(draft); updateScores(draft); checkVictory(draft);
  for (const key of Object.keys(game)) delete game[key];
  Object.assign(game, draft);
  return game;
}

export function viewGame(g, playerId) {
  const { developmentDeck, playedDevelopment, setupOrder, setupIndex, setupVertexId, robberReturnPhase, roadBuildingReturnPhase, primaryIndex, ...visible } = structuredClone(g);
  visible.developmentRemaining = developmentDeck.length;
  visible.players = visible.players.map(p => p.id === playerId || g.phase === 'finished' ? p : { ...p, resources: null, development: null, score: p.visibleScore });
  visible.legal = legal(g, playerId);
  return visible;
}

export function tick(game, now = Date.now(), excludedPlayers = []) {
  if (!game.deadline || now < game.deadline || game.phase === 'finished') return false;
  // Browser-controlled bots never receive server-selected timeout moves.
  if (game.phase === 'discard' ? !Object.keys(game.discardRequired).some(id => !excludedPlayers.includes(id)) : excludedPlayers.includes(game.activePlayerId)) return false;
  const id = game.activePlayerId;
  addLog(game, 'Thinking time expired; an automatic move keeps the game going.');
  if (game.phase === 'setupSettlement') {
    const targets = legal(game, id).settlements;
    const ranked = targets.map(vId => ({ id: vId, value: vertex(game, vId).hexIds.reduce((total, hId) => { const h = hex(game, hId); return total + (h.number ? 6 - Math.abs(7 - h.number) : 0); }, 0) })).sort((a, b) => b.value - a.value);
    if (ranked.length) action(game, id, 'placeSettlement', { vertexId: ranked[0].id });
  } else if (game.phase === 'setupRoad') action(game, id, 'placeRoad', { edgeId: legal(game, id).roads[0] });
  else if (game.phase === 'roll') { action(game, id, 'rollDice'); if (game.phase === 'action') action(game, id, 'endTurn'); }
  else if (game.phase === 'discard') {
    for (const [discardId, count] of Object.entries(game.discardRequired)) {
      if (excludedPlayers.includes(discardId)) continue;
      const map = emptyResources(), holdings = { ...player(game, discardId).resources };
      for (let n = 0; n < count; n++) { const r = [...RESOURCES].sort((a, b) => holdings[b] - holdings[a])[0]; map[r]++; holdings[r]--; }
      action(game, discardId, 'discard', { resources: map });
    }
  } else if (game.phase === 'robber') action(game, id, 'moveRobber', { hexId: legal(game, id).robberHexes[0] });
  else if (game.phase === 'steal') action(game, id, 'steal', { targetId: game.stealTargets[0] });
  else if (game.phase === 'action') {
    while (game.roadBuildingRemaining && game.phase === 'action') action(game, id, 'placeRoad', { edgeId: legal(game, id).roads[0] });
    if (game.phase === 'action') action(game, id, 'endTurn');
    else if (game.phase === 'roll') { action(game, id, 'rollDice'); if (game.phase === 'action') action(game, id, 'endTurn'); }
  }
  return true;
}
