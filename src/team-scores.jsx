import React from "react";
import { gameTeams, TEAM_MIN_POINTS } from "../shared/teams.js";
import "./team-scores.css";

export function TeamScores({ game, points, compact = false }) {
  const teams = gameTeams(game);
  if (!teams.length) return null;
  const revealed = !!points || game.phase === "finished";
  const score = p => points ? points[game.players.findIndex(other => other.id === p.id)].total : revealed ? p.score : p.visibleScore;
  return (
    <section className="team-scores" aria-label="Team scores">
      <header><strong>Teams</strong><span>{revealed ? "VP" : "Visible VP"}</span></header>
      {teams.map(team => <div className="team-score" key={team.id} data-winner={game.phase === "finished" && team.id === game.winnerTeamId}>
        <div className="team-score-total"><strong>{team.name}</strong><b>{team.players.reduce((n, p) => n + score(p), 0)}<small> / {game.settings.teamVictoryPoints}</small></b></div>
        {!compact && <ul>{team.players.map(p => <li key={p.id}>
          <span className="team-player-dot" style={{ background: p.color }} aria-hidden="true" /><span>{p.name}</span>
          <b aria-label={`${score(p)} points, minimum ${TEAM_MIN_POINTS}`} data-minimum={score(p) >= TEAM_MIN_POINTS}>{score(p)}<small> / {TEAM_MIN_POINTS}</small></b>
        </li>)}</ul>}
      </div>)}
      <p>{TEAM_MIN_POINTS} points per player required.{!revealed && " Hidden point cards count toward victory."}</p>
    </section>
  );
}
