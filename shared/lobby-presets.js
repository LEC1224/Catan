export const DEFAULT_PLAYER_COUNT = 4;

export function lobbyPreset(maxPlayers) {
  return {
    maxPlayers,
    extendedBoard: maxPlayers >= 5,
    friendlyRobber: maxPlayers <= 3,
    discardThreshold: maxPlayers === 2 ? 9 : maxPlayers === 3 ? 8 : 7,
    victoryPoints: maxPlayers === 2 ? 15 : maxPlayers === 3 ? 12 : 10,
  };
}
