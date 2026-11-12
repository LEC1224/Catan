import React, { useId, useState } from "react";
import { Building2, Copy, Flag, House, LogOut, RotateCcw, Route, ScrollText, Shield, Trophy } from "lucide-react";
import "./match-results.css";

const columns = [
  ["settlements", "Settlements", House],
  ["cities", "Cities", Building2],
  ["cards", "VP cards", ScrollText],
  ["route", "Longest Route", Route],
  ["army", "Largest Army", Shield],
];
const momentIcons = { city: Building2, route: Route, army: Shield, lead: Flag, win: Trophy };

export function PlayerMark({ player }) {
  return <span className="result-player-mark" style={{ "--player": player.color }} aria-hidden="true" />;
}

function ScoreBreakdown({ scores, players, winnerId }) {
  const sorted = [...scores].sort((a, b) =>
    Number(b.id === winnerId) - Number(a.id === winnerId) || b.total - a.total);
  return (
    <section className="results-panel score-breakdown" aria-labelledby="score-title">
      <h2 id="score-title">Points by player</h2>
      <div className="results-table-scroll" tabIndex={0} role="region" aria-label="Point breakdown table">
        <table>
          <thead>
            <tr>
              <th scope="col">Player</th>
              {columns.map(([key, label, Icon]) => (
                <th key={key} scope="col"><Icon size={17} aria-hidden="true" /><span>{label}</span></th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((score) => {
              const player = players.find(p => p.id === score.id);
              if (!player) return null;
              return (
                <tr key={player.id} data-winner={player.id === winnerId}>
                  <th scope="row"><div><PlayerMark player={player} /><span>{player.name}</span>{player.id === winnerId && <Trophy size={14} aria-label="Winner" />}</div></th>
                  {columns.map(([key]) => <td key={key} data-zero={!score[key]}>{score[key]}</td>)}
                  <td><strong>{score.total}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const turnLabel = (turn) => turn ? `Turn ${turn}` : "Setup";

function ScoreTimeline({ players, summary, target }) {
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const labelId = useId();
  const { timeline, moments } = summary;
  if (!timeline.length) return null;
  const index = hover ?? selected ?? timeline.length - 1;
  const current = timeline[index];
  const first = timeline[0], last = timeline.at(-1);
  const top = Math.ceil(timeline.reduce((highest, point) => Math.max(highest, ...point.totals), target) / 2) * 2;
  const x = step => 1000 * (step - first.step) / Math.max(1, last.step - first.step);
  const y = score => 200 - (190 * score / top);
  const grid = [...new Set(Array.from({ length: 6 }, (_, i) => Math.round(top * i / 5)))];
  const ticks = [first];
  for (const point of timeline) {
    if (point.turn > ticks.at(-1).turn && point.turn < last.turn &&
        x(point.step) - x(ticks.at(-1).step) >= 160 && x(last.step) - x(point.step) >= 160) ticks.push(point);
  }
  if (last.turn !== first.turn) ticks.push(last);
  const selectPoint = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = 1000 * (event.clientX - rect.left) / rect.width;
    return timeline.reduce((closest, point, i) =>
      Math.abs(x(point.step) - position) < Math.abs(x(timeline[closest].step) - position) ? i : closest, 0);
  };
  const leaders = current.leaders.map(i => players[i].name);
  const lead = leaders.length === players.length ? "All tied" : `${new Intl.ListFormat("en").format(leaders)} ${leaders.length === 1 ? "leads" : "tied for the lead"}`;
  return (
    <section className="results-panel score-timeline" aria-labelledby={labelId}>
      <header className="results-panel-title">
        <h2 id={labelId}>Score timeline</h2>
        <span className="results-numbers">{turnLabel(current.turn)}</span>
      </header>
      <div className="score-chart" aria-hidden="true">
        <div className="score-y">
          {grid.map(value => <span key={value} style={{ top: `${y(value) / 2}%` }}>{value}</span>)}
        </div>
        <div className="score-plot">
          <svg viewBox="0 0 1000 200" preserveAspectRatio="none"
            onPointerMove={event => { if (event.pointerType === "mouse") setHover(selectPoint(event)); }}
            onPointerLeave={() => setHover(null)}
            onClick={event => { setSelected(selectPoint(event)); setHover(null); }}>
            {grid.map(value => <line className="score-gridline" key={value} x1="0" x2="1000" y1={y(value)} y2={y(value)} />)}
            {[...new Set(moments.map(m => m.step))].map(step => (
              <line className="score-moment-line" key={step} x1={x(step)} x2={x(step)} y1="0" y2="200" />
            ))}
            {players.map((player, i) => (
              <path key={player.id} className="score-path" stroke={player.color}
                d={timeline.map((point, j) => j ? `H${x(point.step)}V${y(point.totals[i])}` : `M${x(point.step)},${y(point.totals[i])}`).join("")} />
            ))}
            <line className="score-cursor" x1={x(current.step)} x2={x(current.step)} y1="0" y2="200" />
          </svg>
          {players.map((player, i) => (
            <span key={player.id} className="score-plot-dot" style={{
              "--player": player.color, left: `${x(current.step) / 10}%`, top: `${y(current.totals[i]) / 2}%`,
            }} />
          ))}
        </div>
        <div className="score-x">
          {ticks.map((point, i) => (
            <span key={point.step} style={{ left: `${x(point.step) / 10}%` }} data-edge={i === 0 ? "left" : point === last ? "right" : undefined}>
              {point.turn || "Setup"}
            </span>
          ))}
        </div>
      </div>
      <input type="range" className="results-range score-range" min="0" max={timeline.length - 1} value={selected ?? timeline.length - 1}
        onChange={event => { setHover(null); setSelected(Number(event.target.value)); }} aria-label="Inspect score timeline"
        aria-valuetext={`${turnLabel(timeline[selected ?? timeline.length - 1].turn)}, score snapshot ${(selected ?? timeline.length - 1) + 1} of ${timeline.length}`} />
      <div className="score-readout" aria-live={hover === null ? "polite" : "off"}>
        <span className="score-leader"><Flag size={15} aria-hidden="true" />{lead}</span>
        <ul aria-label={`Scores at ${turnLabel(current.turn).toLowerCase()}`}>
          {players.map((player, i) => (
            <li key={player.id}><PlayerMark player={player} /> {player.name} <strong>{current.totals[i]}</strong></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function KeyMoments({ moments, players }) {
  return (
    <section className="results-panel key-moments" aria-labelledby="moments-title">
      <h2 id="moments-title">Key moments</h2>
      <ol>
        {moments.map(({ step, turn, text, kind, playerId }) => {
          const Icon = momentIcons[kind] ?? Flag;
          const player = players.find(p => p.id === playerId);
          return (
            <li key={`${step}-${kind}`} data-kind={kind}>
              <div className="result-moment" style={{ "--player": player?.color }}>
                <span className="moment-icon"><Icon size={17} aria-hidden="true" /></span>
                <span><small>{turnLabel(turn)}</small><strong>{text}</strong></span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function MatchResults({ lobby, meId, command, busy, onLeave, onCopyInvite, soundControl, fullscreenControl }) {
  const { game, summary } = lobby;
  const winner = game.players.find(p => p.id === game.winnerId);
  const host = lobby.hostId === meId;
  return (
    <main className="match-results" aria-labelledby="result-title">
      <header className="results-toolbar">
        <div className="results-lobby">
          <span title={lobby.name}>{lobby.name}</span>
          {onCopyInvite && <button type="button" className="results-command icon" onClick={onCopyInvite} aria-label="Copy invite link" title="Copy invite link"><Copy size={15} aria-hidden="true" /></button>}
        </div>
        <div className="results-toolbar-actions">
          {fullscreenControl}{soundControl}
          {host && <button type="button" className="results-command" disabled={busy === "returnToLobby"} onClick={() => command("returnToLobby")}><RotateCcw size={16} aria-hidden="true" /> Return to lobby</button>}
          {onLeave && <button type="button" className="results-command icon" disabled={busy === "leaveLobby"} onClick={onLeave} aria-label="Leave lobby" title="Leave lobby"><LogOut size={16} aria-hidden="true" /></button>}
        </div>
      </header>
      <div className="results-content">
        <header className="victory-banner">
          <div className="victory-crest" aria-hidden="true"><Trophy size={42} strokeWidth={1.5} /></div>
          <div className="victory-name">
            <h1 id="result-title">{winner ? `${winner.name} wins` : "Match complete"}</h1>
            {winner && <p><PlayerMark player={winner} /><strong>{winner.score}</strong> victory points</p>}
          </div>
          <dl className="victory-metrics">
            <div><dt>Turns</dt><dd>{summary?.turns ?? game.turn}</dd>{summary?.history === "complete" && summary.pairedTurns > 0 && <small>{summary.pairedTurns} paired</small>}</div>
            <div><dt>Points to win</dt><dd>{game.settings.victoryPoints}</dd></div>
            <div><dt>Players</dt><dd>{game.players.length}</dd></div>
          </dl>
        </header>
        {summary?.scores?.length > 0 && <ScoreBreakdown scores={summary.scores} players={game.players} winnerId={game.winnerId} />}
        {summary?.history === "partial" && <p className="results-note">Recording began during {turnLabel(summary.timeline[0].turn).toLowerCase()}. Earlier moves weren’t recorded.</p>}
        {summary?.history === "unavailable" && <p className="results-note">Move history wasn’t recorded for this match.</p>}
        {summary?.timeline?.length > 0 && (
          <div className="results-analysis">
            <ScoreTimeline players={game.players} summary={summary} target={game.settings.victoryPoints} />
            <KeyMoments moments={summary.moments} players={game.players} />
          </div>
        )}
      </div>
    </main>
  );
}
