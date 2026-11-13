// Shared by authoritative rules, browser controls and masked bot policy.
export const RESOURCES = Object.freeze(['wood', 'brick', 'wool', 'wheat', 'ore']);

export const COSTS = Object.freeze({
  road: Object.freeze({ wood: 1, brick: 1 }),
  settlement: Object.freeze({ wood: 1, brick: 1, wool: 1, wheat: 1 }),
  city: Object.freeze({ wheat: 2, ore: 3 }),
  development: Object.freeze({ wool: 1, wheat: 1, ore: 1 }),
});

export const ACTION_COSTS = Object.freeze({
  placeRoad: COSTS.road,
  placeSettlement: COSTS.settlement,
  upgradeCity: COSTS.city,
  buyDevelopment: COSTS.development,
});
