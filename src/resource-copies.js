export function resourceCopies(counts, types) {
  return types.flatMap(type => Array.from({ length: counts?.[type] || 0 }, (_, index) => ({
    id: `${type}:${index}`, type,
  })));
}

export function resourceCounts(cards) {
  const counts = {};
  for (const { type } of cards) counts[type] = (counts[type] || 0) + 1;
  return counts;
}

export function heldCopies(cards, resources) {
  return cards.filter(({ id, type }) => Number(id.slice(type.length + 1)) < (resources?.[type] || 0));
}
