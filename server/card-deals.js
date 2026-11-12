const HISTORY_LIMIT = 12;

export const bank = { kind: 'bank' };
export const playerHand = id => ({ kind: 'player', id });
export const tile = id => ({ kind: 'tile', id });

export function moveResources(moves, from, to, resources) {
  for (const [type, count] of Object.entries(resources)) {
    if (count > 0) moves.push({ from, to, kind: 'resource', type, count });
  }
}

export function recordDeal(game, action, moves) {
  if (!moves.length) return;
  const history = game.cardDeals ?? [];
  const id = (history.at(-1)?.id ?? 0) + 1;
  game.cardDeals = [...history.slice(1 - HISTORY_LIMIT), { id, action, moves }];
}

export function viewCardDeals(history, playerId) {
  return (history ?? []).map(({ id, action, moves }) => {
    const publicFaces = ['rollDice', 'placeSettlement', 'placeRoad', 'upgradeCity', 'bankTrade'].includes(action);
    const hidden = new Map();
    const visible = [];
    for (const { from, to, kind, count, ...face } of moves) {
      if (publicFaces || (action === 'buyDevelopment' && kind === 'resource') || from.id === playerId || to.id === playerId) {
        visible.push({ from, to, kind, count, ...face });
      } else {
        // A spectator can see the handoff, but not the card type, ID, or mix.
        const key = JSON.stringify([from, to, kind]);
        if (hidden.has(key)) hidden.get(key).count += count;
        else hidden.set(key, { from, to, kind, count });
      }
    }
    return { id, action, moves: [...visible, ...hidden.values()] };
  });
}
