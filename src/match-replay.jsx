import React, { useMemo, useState } from "react";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Layers, Route, ScrollText, Shield, Trophy, Users } from "lucide-react";
import { replayBoard } from "../shared/match-replay.js";
import { Chat } from "./chat.jsx";
import { moveLabel, ReplayControls, turnLabel } from "./replay-timeline.jsx";
import "./match-replay.css";

const diceIcons = [null, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const noBuild = { road: false, settlement: false, city: false };
const noAction = () => {};

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

export function ReplayView({ lobby, command, busy, Board, resourceMeta, recording, onRetry, onSeek, renderMoments }) {
  const [panel, setPanel] = useState("chat");
  const [preview, setPreview] = useState(null);
  const { game, summary, replay } = lobby;
  const { players, settings } = game;
  const step = preview?.step ?? replay.step;
  const localFrame = recording?.frames[step];
  const frame = localFrame ?? replay.frame;
  const position = localFrame ? recording.positions[localFrame.position] : replay.position;
  const boardStep = localFrame ? step : replay.step;
  const { robber, phase, active } = frame;
  const board = useMemo(() => replayBoard(game.board, position), [game.board, position]);
  const boardView = useMemo(() => (
    <Board game={{ board, players, settings, robberHexId: robber, phase, activePlayerId: active }}
      matchId={lobby.matchId} meId={null} mode={null} canBuild={noBuild} busy onAction={noAction} resourceMeta={resourceMeta} />
  ), [Board, board, players, settings, robber, phase, active, lobby.matchId, resourceMeta]);
  const mover = players.find(player => player.id === replay.playerId);
  const highlights = summary.moments.filter(moment => moment.step === boardStep);
  const highlight = highlights.find(moment => moment.kind === "win") ??
    highlights.find(moment => moment.kind !== "lead") ?? highlights[0];
  const seek = async next => {
    if (!preview && next === replay.step) return;
    const selection = { step: next };
    setPreview(selection);
    try {
      await onSeek(next);
    } finally {
      // An older acknowledgement must not clear a newer selection or drag.
      setPreview(current => current === selection ? null : current);
    }
  };
  return (
    <div className="replay-layout">
      <section className="replay-table" aria-labelledby="replay-title">
        <header className="replay-state">
          <div className="replay-state-main">
            <h1 id="replay-title" tabIndex={-1}><Users size={17} aria-hidden="true" /> Shared replay</h1>
            <div className="replay-outcome" aria-live={preview?.dragging ? "off" : "polite"}>
              <b>{turnLabel(frame.turn)}{frame.paired && " · paired"}</b>
              {frame.phase === "finished" && <Trophy size={15} aria-label="Match finished" />}
              <span>{moveLabel(frame, players)}{frame.move.automatic && <small> · automatic</small>}</span>
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
            {mover && <small style={{ visibility: preview ? "hidden" : undefined }}>Moved by {mover.name}</small>}
          </div>
        </header>
        <div className="match-stage replay-board" style={{ "--map-left": "0px", "--map-right": "0px" }}>
          {boardView}
        </div>
        <ReplayControls step={step} frameCount={summary.frameCount} frames={recording?.frames} moments={summary.moments} players={players}
          onPreview={next => setPreview(next === null ? null : { step: next, dragging: true })} onSeek={seek} busy={busy === "seekReplay"}
          loadState={recording === undefined ? "loading" : recording === null ? "failed" : "ready"} onRetry={onRetry} />
      </section>
      <aside className="replay-rail">
        <ReplayPlayers players={players} frame={frame} />
        <section className="results-panel replay-activity" aria-label="Replay discussion">
          <div className="replay-panel-tabs" role="group" aria-label="Replay sidebar">
            <button type="button" className="results-command" aria-pressed={panel === "chat"} onClick={() => setPanel("chat")}>Chat</button>
            <button type="button" className="results-command" aria-pressed={panel === "moments"} onClick={() => setPanel("moments")}>Key moments</button>
          </div>
          <div className="replay-activity-content" hidden={panel !== "chat"}><Chat lobby={lobby} command={command} compact /></div>
          {panel === "moments" && <div className="replay-activity-content">{renderMoments(boardStep, seek)}</div>}
        </section>
      </aside>
    </div>
  );
}
