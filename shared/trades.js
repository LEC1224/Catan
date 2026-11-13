export const MAX_TRADE_OFFERS = 6;
export const MAX_BANK_TRADE_CARDS = 24;

// A null count represents unlimited stock in saved matches and on the wire.
export const resourceStock = (bank, resource) => bank[resource] === null ? Infinity : bank[resource] ?? 0;

// Older saved games had one offer. The next successful action saves it in the new list.
export const openTradeOffers = (game) => game.tradeOffers ?? (game.tradeOffer ? [game.tradeOffer] : []);

export const playerTradesAvailable = (game) => game.phase === 'action' &&
  game.settings.allowPlayerTrading && !game.roadBuildingRemaining && !game.pairedPlayer;

export function bankTradeRate(vertices, playerId, resource) {
  const ports = vertices.filter((v) => v.building?.owner === playerId).map((v) => v.port);
  return resource && ports.includes(resource) ? 2 : ports.includes('any') ? 3 : 4;
}
