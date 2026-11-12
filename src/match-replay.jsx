import React, { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Layers, Route, ScrollText, Shield, SkipBack, SkipForward, Trophy, Users } from "lucide-react";
import { replayBoard } from "../shared/match-replay.js";
import { Chat } from "./chat.jsx";
import "./match-replay.css";

const diceIcons = [null, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const noBuild = { road: false, settlement: false, city: false };
const noAction = () => {};
export const turnLabel = turn => turn ? `Turn ${turn}` : "Setup";

export function PlayerMark({ player }) {
  return <span className="result-player-mark" style={{ "--player": player.color }} aria-hidden="true" />;
}

function ReplayPlayers({ players, frame }) {
  return (
    <section className="results-panel replay-players" aria-labelledby="replay-players-title">
      <div className="results-panel-title"><h2 id="replay-players-title">Players</h2><span className="results-numbers">VP</span></div>
      <ul>
        {players.map((player, i) => {
          const [resources, development, road, knights] = frame.counts[i];
          const stats = [[Layers, resources, "Resources"], [ScrollText, development, "Development cards"],
            [Route, road, "Longest route length"], [Shield, knights, "Played knights"]];
          return (
            <li key={player.id} data-active={player.id === frame.active} style={{ "--player": player.color }}>
              <div className="replay-player-name">
                <PlayerMark player={player} />
                <strong>{player.name}</strong>
                {player.id === frame.active && frame.phase !== "finished" && <span className="replay-active-label">Active</span>}
                <b>{frame.points[i].total}</b>
              </div>
              <div className="replay-player-stats">
                {stats.map(([Icon, value, label]) => (
                  <span key={label} title={label} data-award={Icon === Route && frame.route === player.id || Icon === Shield && frame.army === player.id}>
                    <Icon size={14} aria-hidden="true" /><span className="results-sr-only">{label}: </span>{value}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReplayControls({ step, frameCount, onSeek, busy }) {
  const [draft, setDraft] = useState(null);
  const dragging = useRef(false);
  const last = frameCount - 1;
  const value = draft ?? step;
  const seek = next => { if (next !== step) onSeek(next); };
  const finish = (event, commit) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (commit) seek(Number(event.currentTarget.value));
    setDraft(null);
  };
  return (
    <div className="replay-controls" aria-label="Replay controls" role="group" aria-busy={busy}>
      <div className="replay-step-buttons">
        {[
          ["Start of recording", SkipBack, 0, step === 0],
          ["Previous move", ChevronLeft, step - 1, step === 0],
          ["Next move", ChevronRight, step + 1, step === last],
          ["End of match", SkipForward, last, step === last],
        ].map(([label, Icon, next, disabled]) => (
          <button key={label} type="button" className="results-command icon" disabled={disabled} aria-label={label} title={label}
            onClick={() => seek(next)}><Icon size={20} aria-hidden="true" /></button>
        ))}
      </div>
      <input className="results-range replay-range" type="range" min="0" max={last} value={value}
        aria-label="Replay step" aria-valuetext={`Step ${value + 1} of ${frameCount}`}
        onPointerDown={event => {
          if (event.button !== 0) return;
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={event => finish(event, true)}
        onPointerCancel={event => finish(event, false)}
        onLostPointerCapture={event => finish(event, false)}
        onBlur={event => finish(event, false)}
        onChange={event => {
          const next = Number(event.target.value);
          if (dragging.current) setDraft(next);
          else seek(next);
        }} />
      <span className="replay-step" aria-hidden="true"><strong>{value + 1}</strong> / {frameCount}</span>
    </div>
  );
}

export function ReplayView({ lobby, command, busy, Board, resourceMeta, onSeek, moments }) {
  const [panel, setPanel] = useState("chat");
  const { game, summary, replay } = lobby;
  const { frame, step, position, playerId } = replay;
  const board = useMemo(() => replayBoard(game.board, position), [game.board, position]);
  const boardGame = { board, players: game.players, settings: game.settings, robberHexId: frame.robber,
    phase: frame.phase, activePlayerId: frame.active };
  const mover = game.players.find(player => player.id === playerId);
  const actor = game.players.find(player => player.id === frame.move.actorId);
  const text = frame.move.text ?? (actor ? `${actor.name} completed a move.` : "");
  const highlights = summary.moments.filter(moment => moment.step === step);
  const highlight = highlights.find(moment => moment.kind === "win") ??
    highlights.find(moment => moment.kind !== "lead") ?? highlights[0];
  return (
    <div className="replay-layout">
      <section className="replay-table" aria-labelledby="replay-title">
        <header className="replay-state">
          <div className="replay-state-main">
            <h1 id="replay-title" tabIndex={-1}><Users size={17} aria-hidden="true" /> Shared replay</h1>
            <div className="replay-outcome" aria-live="polite">
              <b>{turnLabel(frame.turn)}{frame.paired && " · paired"}</b>
              {frame.phase === "finished" && <Trophy size={15} aria-label="Match finished" />}
              <span>{text}{frame.move.automatic && <small> · automatic</small>}</span>
              {highlight && <span className="replay-highlight">{highlight.text}</span>}
            </div>
          </div>
          <div className="replay-state-side">
            {frame.dice && (
              <div className="replay-dice" aria-label={`Dice: ${frame.dice.join(" and ")}`} role="img">
                {frame.dice.map((value, i) => {
                  const Icon = diceIcons[value];
                  return <Icon key={i} size={25} aria-hidden="true" />;
                })}
              </div>
            )}
            {mover && <small>Moved by {mover.name}</small>}
          </div>
        </header>
        <div className="match-stage replay-board" style={{ "--map-left": "0px", "--map-right": "0px" }}>
          <Board game={boardGame} matchId={lobby.matchId} meId={null} mode={null} canBuild={noBuild}
            busy onAction={noAction} resourceMeta={resourceMeta} />
        </div>
        <ReplayControls step={step} frameCount={summary.frameCount} onSeek={onSeek} busy={busy === "seekReplay"} />
      </section>
      <aside className="replay-rail">
        <ReplayPlayers players={game.players} frame={frame} />
        <section className="results-panel replay-activity" aria-label="Replay discussion">
          <div className="replay-panel-tabs" role="group" aria-label="Replay sidebar">
            <button type="button" className="results-command" aria-pressed={panel === "chat"} onClick={() => setPanel("chat")}>Chat</button>
            <button type="button" className="results-command" aria-pressed={panel === "moments"} onClick={() => setPanel("moments")}>Key moments</button>
          </div>
          <div className="replay-activity-content" hidden={panel !== "chat"}><Chat lobby={lobby} command={command} compact /></div>
          {panel === "moments" && <div className="replay-activity-content">{moments}</div>}
        </section>
      </aside>
    </div>
  );
}
