export const TEAM_IDS = ['a', 'b'];
export const TEAM_MIN_POINTS = 6;
export const DEFAULT_TEAM_TARGET = 16;
export const teamName = id => `Team ${id.toUpperCase()}`;

export function gameTeams(game) {
  if (game.settings.mode !== 'teams') return [];
  return TEAM_IDS.map(id => ({ id, name: teamName(id), players: game.players.filter(p => p.teamId === id) }));
}

export function areTeammates(game, firstId, secondId) {
  if (game.settings.mode !== 'teams' || firstId === secondId) return false;
  const first = game.players.find(p => p.id === firstId);
  return !!first?.teamId && game.players.some(p => p.id === secondId && p.teamId === first.teamId);
}

export function teamSeating(players) {
  if (players.length !== 4) throw Error('2v2 needs exactly four players.');
  const assigned = players.every(p => p.teamId === undefined)
    ? players.map((p, i) => ({ ...p, teamId: TEAM_IDS[i % 2] })) : players;
  if (assigned.some(p => !TEAM_IDS.includes(p.teamId))) throw Error('Choose a team for every player.');
  const [a, b] = TEAM_IDS.map(id => assigned.filter(p => p.teamId === id));
  if (a.length !== 2 || b.length !== 2) throw Error('Each team needs exactly two players.');
  // Preserve an already alternating order, including its randomly selected first seat.
  if (assigned.every((p, i) => p.teamId !== assigned[(i + 1) % 4].teamId)) return assigned;
  return [a[0], b[0], a[1], b[1]];
}
