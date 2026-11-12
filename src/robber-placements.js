export function robberPlacement(game, meId) {
  if (game.phase !== "robber" || game.activePlayerId !== meId || !Array.isArray(game.legal?.robberHexes)) return null;
  const destinations = new Set(game.legal.robberHexes);
  const friendly = !!game.settings.friendlyRobber;
  return {
    friendly,
    state(hexId) {
      if (hexId === game.robberHexId) return "occupied";
      if (destinations.has(hexId)) return "destination";
      return friendly ? "protected" : "unavailable";
    },
  };
}

export const ROBBER_TILE_HINTS = {
  destination: "Move the robber here",
  occupied: "The robber is already here",
  protected: "Friendly Robber protects an opponent on this tile",
  unavailable: "The robber cannot move here",
};
