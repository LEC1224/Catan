import React, { useEffect, useId, useRef, useState } from "react";
import { Building2, ChartNoAxesCombined, ChevronRight, Copy, Film, Flag, House, LogOut, RotateCcw, Route, ScrollText, Shield, Trophy } from "lucide-react";
import { PlayerMark, ReplayView } from "./match-replay.jsx";
import { turnLabel } from "./replay-timeline.jsx";
import { gameTeams } from "../shared/teams.js";
import { TeamScores } from "./team-scores.jsx";
import "./match-results.css";

const columns = [
  ["settlements", "Settlements", House],
  ["cities", "Cities", Building2],
  ["cards", "VP cards", ScrollText],
  ["route", "Longest Route", Route],
  ["army", "Largest Army", Shield],
];
const momentIcons = { city: Building2, route: Route, army: Shield, lead: Flag, win: Trophy };

function ScoreBreakdown({ scores, players, winnerIds }) {
  const sorted = [...scores].sort((a, b) =>
    Number(winnerIds.includes(b.id)) - Number(winnerIds.includes(a.id)) || b.total - a.total);
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
                <tr key={player.id} data-winner={winnerIds.includes(player.id)}>
                  <th scope="row"><div><PlayerMark player={player} /><span>{player.name}</span>{winnerIds.includes(player.id) && <Trophy size={14} aria-label="Winner" />}</div></th>
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

function ScoreTimeline({ players, summary, target, onSeek }) {
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
        {onSeek && <button type="button" className="results-command score-replay" onClick={() => onSeek(current.step)}>
          <Film size={15} aria-hidden="true" /> Replay this point
        </button>}
      </div>
    </section>
  );
}

function DiceRollChart({ counts, rollCount }) {
  const bins = counts.map((observed, i) => {
    const total = i + 2;
    return { total, observed, expected: rollCount * (6 - Math.abs(7 - total)) / 36, x: 10 * i + 5 };
  });
  const peak = Math.max(rollCount / 6, ...counts);
  const minStep = Math.max(1, peak / 4);
  const magnitude = 10 ** Math.floor(Math.log10(minStep));
  const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= minStep);
  const ticks = Array.from({ length: Math.ceil(peak / step) + 1 }, (_, i) => i * step);
  const y = value => 100 * (1 - value / ticks.at(-1));
  return (
    <>
      <ul className="dice-chart-legend" aria-label="Chart legend">
        <li><span className="dice-chart-match-key" aria-hidden="true" /> Match rolls</li>
        <li><span className="dice-chart-fair-key" aria-hidden="true" /> Fair dice</li>
      </ul>
      <div className="dice-chart" aria-hidden="true">
        <span className="dice-chart-unit">Rolls</span>
        <div className="dice-chart-scale">
          {ticks.toReversed().map(value => <span key={value}>{value}</span>)}
        </div>
        <svg className="dice-chart-plot" viewBox="0 0 110 100" preserveAspectRatio="none">
          {ticks.map(value => <line key={value} x1="0" x2="110" y1={y(value)} y2={y(value)} />)}
          {bins.map(({ total, observed, x }) => <rect key={total} x={x - 3} y={y(observed)} width="6" height={100 - y(observed)} />)}
          <polyline points={bins.map(({ x, expected }) => `${x},${y(expected)}`).join(" ")} />
        </svg>
        <div className="dice-chart-totals">
          {bins.map(({ total }) => <span key={total}>{total}</span>)}
        </div>
        <span className="dice-chart-label">Dice total</span>
      </div>
      <details className="dice-chart-data">
        <summary>Roll counts by total</summary>
        <table>
          <thead><tr><th scope="col">Dice total</th><th scope="col">Match rolls</th><th scope="col">Fair dice (expected)</th></tr></thead>
          <tbody>
            {bins.map(({ total, observed, expected }) => (
              <tr key={total}><th scope="row">{total}</th><td>{observed}</td><td>{expected.toLocaleString("en", { maximumFractionDigits: 2 })}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function DiceDistribution({ counts, partial }) {
  const labelId = useId();
  const rollCount = counts.reduce((sum, count) => sum + count, 0);
  return (
    <section className="results-panel dice-distribution" aria-labelledby={labelId}>
      <header className="results-panel-title">
        <h2 id={labelId}>Dice distribution</h2>
        {rollCount > 0 && <span className="results-numbers">{rollCount} {partial ? "recorded " : ""}{rollCount === 1 ? "roll" : "rolls"}</span>}
      </header>
      {rollCount > 0 ? <DiceRollChart counts={counts} rollCount={rollCount} />
        : <p className="dice-chart-empty">{partial ? "No dice rolls were recorded." : "No dice were rolled."}</p>}
    </section>
  );
}

function KeyMoments({ moments, players, onSeek, activeStep, embedded = false }) {
  const id = useId();
  const byStep = new Map();
  for (const moment of moments) {
    if (!byStep.has(moment.step)) byStep.set(moment.step, []);
    byStep.get(moment.step).push(moment);
  }
  return (
    <section className={`key-moments${embedded ? "" : " results-panel"}`} aria-labelledby={embedded ? undefined : id} aria-label={embedded ? "Key moments" : undefined}>
      {!embedded && <h2 id={id}>Key moments</h2>}
      <ol>
        {[...byStep.values()].map(group => {
          const mainMoments = group.filter(m => m.kind !== "lead");
          const [first, ...rest] = mainMoments.length ? mainMoments : group;
          const { step, turn, text, kind, playerId } = first;
          const Icon = momentIcons[kind] ?? Flag;
          const player = players.find(p => p.id === playerId);
          const content = <>
            <span className="moment-icon"><Icon size={17} aria-hidden="true" /></span>
            <span><small>{turnLabel(turn)}</small><strong>{text}</strong>{rest.map(m => <strong key={m.kind}>{m.text}</strong>)}</span>
          </>;
          return <li key={step} data-kind={group.some(m => m.kind === "win") ? "win" : kind}>
            {onSeek ? (
              <button type="button" className="result-moment" style={{ "--player": player?.color }}
                aria-current={activeStep === step ? "step" : undefined} onClick={() => onSeek(step)}>
                {content}<ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : <div className="result-moment" style={{ "--player": player?.color }}>{content}</div>}
          </li>;
        })}
      </ol>
    </section>
  );
}

export function MatchResults({ lobby, meId, command, busy, onLeave, onCopyInvite, soundControl, fullscreenControl, Board, resourceMeta }) {
  const [stayOnResults, setStayOnResults] = useState(false);
  const [recording, setRecording] = useState();
  const commandRef = useRef(command);
  const page = useRef(null);
  const { game, summary, replay, matchId } = lobby;
  const winner = game.players.find(p => p.id === game.winnerId);
  const teams = gameTeams(game);
  const winningTeam = teams.find(team => team.id === game.winnerTeamId);
  const winnerIds = winningTeam ? winningTeam.players.map(p => p.id) : [game.winnerId];
  const target = teams.length ? game.settings.teamVictoryPoints : game.settings.victoryPoints;
  const chartPlayers = teams.length ? teams.map(team => ({ id: team.id, name: team.name, color: team.players[0].color })) : game.players;
  const chartSummary = teams.length && summary ? { ...summary, timeline: summary.timeline.map(point => ({ ...point, totals: point.teamTotals })) } : summary;
  const host = lobby.hostId === meId;
  const inReplay = !!replay && !stayOnResults;
  const canReplay = summary?.frameCount > 1;
  const seek = (step) => command("seekReplay", { matchId, step });
  const openReplay = async step => {
    if ((step === undefined && replay) || await seek(step ?? 0)) setStayOnResults(false);
  };
  // A command changes the app's busy state; only entering replay or retrying should start a load.
  useEffect(() => { commandRef.current = command; }, [command]);
  useEffect(() => {
    if (!inReplay || recording !== undefined) return;
    let active = true;
    commandRef.current("getReplayRecording", { matchId }).then(result => {
      if (active) setRecording(result?.recording ?? null);
    });
    return () => { active = false; };
  }, [inReplay, recording, matchId]);
  useEffect(() => {
    if (!page.current) return;
    page.current.scrollTop = 0;
    page.current.querySelector("h1")?.focus({ preventScroll: true });
  }, [inReplay]);
  return (
    <main className={`match-results${inReplay ? " match-replay" : ""}`} ref={page} aria-labelledby={inReplay ? "replay-title" : "result-title"}>
      <header className="results-toolbar">
        <div className="results-lobby">
          <span title={lobby.name}>{lobby.name}</span>
          {onCopyInvite && <button type="button" className="results-command icon" onClick={onCopyInvite} aria-label="Copy invite link" title="Copy invite link"><Copy size={15} aria-hidden="true" /></button>}
        </div>
        <div className="results-toolbar-actions">
          {inReplay ? <button type="button" className="results-command" onClick={() => setStayOnResults(true)}><ChartNoAxesCombined size={16} aria-hidden="true" /> Results</button>
            : canReplay && <button type="button" className="results-command" data-tone="gold" disabled={busy === "seekReplay"} onClick={() => openReplay()}>
              <Film size={17} aria-hidden="true" /> {replay ? "Join replay" : "Replay"}
            </button>}
          {fullscreenControl}{soundControl}
          {host && <button type="button" className="results-command" disabled={busy === "returnToLobby"} onClick={() => command("returnToLobby")}><RotateCcw size={16} aria-hidden="true" /> Return to lobby</button>}
          {onLeave && <button type="button" className="results-command icon" disabled={busy === "leaveLobby"} onClick={onLeave} aria-label="Leave lobby" title="Leave lobby"><LogOut size={16} aria-hidden="true" /></button>}
        </div>
      </header>
      {inReplay ? (
        <ReplayView lobby={lobby} command={command} busy={busy} Board={Board} resourceMeta={resourceMeta} onSeek={seek}
          recording={recording} onRetry={() => setRecording(undefined)}
          renderMoments={(step, seekMoment) => <KeyMoments moments={summary.moments} players={game.players} onSeek={seekMoment} activeStep={step} embedded />} />
      ) : <div className="results-content">
        <header className="victory-banner">
          <div className="victory-crest" aria-hidden="true"><Trophy size={42} strokeWidth={1.5} /></div>
          <div className="victory-name">
            <h1 id="result-title" tabIndex={-1}>{winningTeam ? `${winningTeam.name} wins` : winner ? `${winner.name} wins` : "Match complete"}</h1>
            {winningTeam ? <p>{winningTeam.players.map(p => p.name).join(" & ")} · <strong>{winningTeam.players.reduce((n, p) => n + p.score, 0)}</strong> victory points</p>
              : winner && <p><PlayerMark player={winner} /><strong>{winner.score}</strong> victory points</p>}
          </div>
          <dl className="victory-metrics">
            <div><dt>Turns</dt><dd>{summary?.turns ?? game.turn}</dd>{summary?.history === "complete" && summary.pairedTurns > 0 && <small>{summary.pairedTurns} paired</small>}</div>
            <div><dt>{teams.length ? "Team target" : "Points to win"}</dt><dd>{target}</dd></div>
            <div><dt>Players</dt><dd>{game.players.length}</dd></div>
          </dl>
        </header>
        {summary?.history === "partial" && <p className="results-note">Recording began during {turnLabel(summary.timeline[0].turn).toLowerCase()}. Earlier moves weren’t recorded.</p>}
        {summary?.history === "unavailable" && <p className="results-note">Move history wasn’t recorded for this match.</p>}
        <div className={`results-dashboard${summary?.timeline?.length ? " has-history" : ""}`}>
          <div className="results-column">
            <TeamScores game={game} />
            {summary?.scores?.length > 0 && <ScoreBreakdown scores={summary.scores} players={game.players} winnerIds={winnerIds} />}
            {summary?.diceCounts && <DiceDistribution counts={summary.diceCounts} partial={summary.history === "partial"} />}
          </div>
          {summary?.timeline?.length > 0 && <div className="results-column">
            <ScoreTimeline players={chartPlayers} summary={chartSummary} target={target} onSeek={canReplay ? openReplay : undefined} />
            <KeyMoments moments={summary.moments} players={game.players} onSeek={canReplay ? openReplay : undefined} />
          </div>}
        </div>
      </div>}
    </main>
  );
}
