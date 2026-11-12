const VERSION = 1;
const OFFER_ACTIONS = new Set(['offerTrade', 'declineTrade', 'cancelTrade']);
const BUILD_ACTIONS = new Set(['placeSettlement', 'placeRoad', 'upgradeCity']);

function points(game) {
  return game.players.map(player => ({
    settlements: 5 - player.settlementsLeft,
    cities: 2 * (4 - player.citiesLeft),
    cards: player.development.filter(card => card.type === 'victoryPoint').length,
    route: game.longestRoadHolder === player.id ? 2 : 0,
    army: game.largestArmyHolder === player.id ? 2 : 0,
    total: player.score,
  }));
}

export function lastLogSequence(game) {
  return game.log.at(-1)?.seq ?? 0;
}

export function captureMove(game, actorId, type, previousLog, automatic = false) {
  if (OFFER_ACTIONS.has(type)) return null;
  // Keep public outcomes, not action payloads or anyone's hand.
  const log = game.log.filter(entry => entry.seq > previousLog);
  const text = type === 'moveRobber' ? log.slice(0, log[1]?.text.includes('stole one resource') ? 2 : 1).map(entry => entry.text).join(' ')
    : log[0]?.text;
  return capture(game, { actorId, type, text, automatic }, BUILD_ACTIONS.has(type));
}

function capture(game, move, savePosition) {
  return {
    frame: {
      turn: game.turn, paired: game.pairedPlayer, active: game.activePlayerId, phase: game.phase,
      dice: game.dice && [...game.dice], robber: game.robberHexId,
      route: game.longestRoadHolder, army: game.largestArmyHolder, points: points(game), move,
      counts: game.players.map(p => [p.resourceCount, p.developmentCount, p.longestRoad, p.knights]),
    },
    position: savePosition ? {
      buildings: game.board.vertices.flatMap(v => v.building ? [[v.id, v.building.owner, v.building.type]] : []),
      roads: game.board.edges.flatMap(e => e.owner ? [[e.id, e.owner]] : []),
    } : null,
  };
}

export function beginRecording(game, partial = false) {
  const recording = { version: VERSION, partial, positions: [], frames: [] };
  appendFrame(recording, capture(game, { type: 'start', text: partial ? 'Recording began' : 'Before setup' }, true));
  return recording;
}

export function hasRecording(recording) {
  return recording?.version === VERSION && !!recording.frames?.length && !!recording.positions?.length;
}

export function appendFrame(recording, captured) {
  if (!captured) return;
  const { frame, position } = captured;
  if (position) recording.positions.push(position);
  recording.frames.push({ ...frame, position: recording.positions.length - 1 });
}

function scoreLeaders(totals) {
  const highest = Math.max(...totals);
  return totals.flatMap((total, index) => total === highest ? [index] : []);
}

const finishedSummaries = new WeakMap();

export function matchSummary(game, recording) {
  if (game.phase !== 'finished') return null;
  if (finishedSummaries.has(game)) return finishedSummaries.get(game);
  const frames = hasRecording(recording) ? recording.frames : [];
  const names = new Map(game.players.map(p => [p.id, p.name]));
  const timeline = [], moments = [];
  let pairedTurns = 0, previous, lastLeaders, firstCity = false;
  function moment(step, frame, kind, text, playerId) {
    moments.push({ step, turn: frame.turn, kind, text, playerId });
  }
  for (const [step, frame] of frames.entries()) {
    const totals = frame.points.map(p => p.total);
    const leaders = scoreLeaders(totals);
    const newTurn = frame.turn !== previous?.turn;
    if (newTurn && frame.paired) pairedTurns++;
    const scoresChanged = !previous || totals.some((total, i) => total !== previous.points[i].total);
    if (newTurn || scoresChanged || step === frames.length - 1) timeline.push({ step, turn: frame.turn, totals, leaders });

    if (previous) {
      if (!firstCity && frame.move.type === 'upgradeCity') {
        firstCity = true;
        const id = frame.move.actorId;
        moment(step, frame, 'city', recording.partial ? `${names.get(id)} built a city` : `${names.get(id)} built the first city`, id);
      }
      for (const [key, award] of [['route', 'Longest Route'], ['army', 'Largest Army']]) {
        if (previous[key] === frame[key]) continue;
        const id = frame[key];
        const text = id ? `${names.get(id)} ${previous[key] ? 'took over' : 'claimed'} ${award}`
          : `${names.get(previous[key])} lost ${award}`;
        moment(step, frame, key, text, id ?? previous[key]);
      }
    }
    if (frame.turn > 0) {
      if (lastLeaders && String(lastLeaders) !== String(leaders) && frame.phase !== 'finished') {
        const ids = leaders.map(index => game.players[index].id);
        const text = ids.length === 1 ? `${names.get(ids[0])} took the lead`
          : `${new Intl.ListFormat('en').format(ids.map(id => names.get(id)))} tied for the lead`;
        moment(step, frame, 'lead', text, ids.length === 1 ? ids[0] : undefined);
      }
      lastLeaders = leaders;
    }
    if (frame.phase === 'finished') moment(step, frame, 'win', `${names.get(game.winnerId)} won with ${totals[game.players.findIndex(p => p.id === game.winnerId)]} points`, game.winnerId);
    previous = frame;
  }
  const summary = {
    turns: game.turn, pairedTurns, frameCount: frames.length,
    history: frames.length ? (recording.partial ? 'partial' : 'complete') : 'unavailable',
    scores: points(game).map((score, i) => ({ ...score, id: game.players[i].id })),
    timeline, moments,
  };
  finishedSummaries.set(game, summary);
  return summary;
}
