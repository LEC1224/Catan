import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { Bot, Check, CircleAlert, LockKeyhole, Plus, Undo2, WifiOff, X } from "lucide-react";
import { resourceStock } from "../shared/trades.js";
import { PlayerHandBacks } from "./card-deals.jsx";
import { ResourceCardRow } from "./resource-card-draft.jsx";
import { resourceCounts } from "./resource-copies.js";
import "./match-prompts.css";

function useTrayFocus() {
  const title = useRef(null);
  useLayoutEffect(() => {
    const heading = title.current;
    const tray = heading.closest("[data-table-tray]");
    heading.focus({ preventScroll: true });
    const { top, right, bottom, left } = tray.getBoundingClientRect();
    if (top < 0 || right > window.innerWidth || bottom > window.innerHeight || left < 0) {
      tray.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, []);
  return title;
}

export function TableDialog({ title, icon: Icon, description, wide, dismissLabel, onClose, feedback, children }) {
  const dialog = useRef(null), heading = useId(), details = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog ref={dialog} className="table-dialog" data-wide={wide || undefined}
      aria-labelledby={heading} aria-describedby={description ? details : undefined}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="table-dialog-sheet">
        <header className="table-dialog-heading">
          <Icon size={23} aria-hidden="true" />
          <h2 id={heading}>{title}</h2>
          {dismissLabel && <button type="button" className="draft-command match-tool table-close"
            onClick={onClose} aria-label={dismissLabel}><X size={18} aria-hidden="true" /></button>}
        </header>
        <div className="table-dialog-content" tabIndex={wide ? 0 : undefined}>
          {feedback}
          {description && <p className="table-dialog-description" id={details}>{description}</p>}
          {children}
        </div>
      </div>
    </dialog>
  );
}

export function TableFeedback({ disconnected, botsPaused, error, notice, onDismiss }) {
  const connection = disconnected ? "Connection lost. Reconnecting…"
    : botsPaused && !error && !notice ? "Bots are paused until the host reconnects or control transfers after one minute." : null;
  const message = connection || error || notice;
  if (!message) return null;
  const Icon = disconnected ? WifiOff : connection ? Bot : error ? CircleAlert : Check;
  return (
    <div className="table-feedback" data-warning={!!(connection || error)}>
      <Icon size={17} aria-hidden="true" />
      <span role={!connection && error ? "alert" : "status"}>{message}</span>
      {!connection && <button type="button" className="draft-command match-tool table-close" aria-label="Dismiss notification"
        onClick={onDismiss}><X size={15} aria-hidden="true" /></button>}
    </div>
  );
}

export function developmentRestriction(card, game, meId) {
  if (card.type === "victoryPoint") return "";
  if (card.turnBought >= game.turn) return "Playable next turn.";
  if (game.activePlayerId !== meId) return "You can play this on your turn.";
  if (game.developmentPlayed) return "You already played a development card this turn.";
  if (!["roll", "action"].includes(game.phase) || game.roadBuildingRemaining) {
    return "Finish the current action before playing this card.";
  }
  if (card.type === "invention" && Object.keys(game.bank).reduce((sum, type) => sum + resourceStock(game.bank, type), 0) < 2) {
    return "The bank has fewer than two resources.";
  }
  return "";
}

export function DevelopmentTray({ id, card, game, meta, restriction, busy, onClose, onPlay, resourceTypes, resourceMeta, Face }) {
  const [picks, setPicks] = useState([]);
  const title = useTrayFocus(), pool = useRef(null), serial = useRef(0);
  const heading = useId(), description = useId();

  const invention = card.type === "invention", monopoly = card.type === "monopoly";
  const playable = !restriction && card.type !== "victoryPoint";
  const picking = playable && (invention || monopoly);
  const limit = invention ? 2 : 1;
  const counts = resourceCounts(picks);
  const bankChanged = invention && Object.entries(counts).some(([type, count]) => count > resourceStock(game.bank, type));
  const canPlay = !busy && (!picking || (picks.length === limit && !bankChanged));
  const Icon = meta.icon;
  return (
    <section className="draft-panel table-tray development-tray" id={id} data-table-tray="" data-picking={picking || undefined}
      aria-labelledby={heading} aria-describedby={description}>
      <div className="table-card-preview" aria-hidden="true">
        {Face ? <Face kind="development" card={{ ...meta, theme: card.type, isVictory: card.type === "victoryPoint" }} />
          : <span className="table-card-emblem" style={{ "--card-accent": meta.color }}><Icon size={31} strokeWidth={1.45} /></span>}
      </div>
      <div className="table-card-copy">
        <h2 id={heading} ref={title} tabIndex={-1} aria-describedby={description}>{meta.name}</h2>
        <p id={description}>{meta.description}</p>
        {restriction && <p className="table-card-restriction"><LockKeyhole size={14} aria-hidden="true" />{restriction}</p>}
      </div>
      {picking && <div className="table-card-choices" style={{ "--pick-limit": limit }}>
        <div className="table-choice-pool" ref={pool}>
          <h3>{invention ? "Bank" : "Resource to claim"}</h3>
          <ResourceCardRow cards={resourceTypes.map(type => ({ id: type, type }))} meta={resourceMeta} Face={Face}
            label={invention ? "Bank resources" : "Resources to claim"} size="picker" marker={Plus} busy={busy}
            actionLabel={name => invention ? `Take one ${name}` : `Choose ${name}`}
            blocked={({ type }) => invention ? picks.length >= limit || (counts[type] || 0) >= resourceStock(game.bank, type) : picks[0]?.type === type}
            onCard={({ type }) => {
              const pick = { id: `pick:${++serial.current}`, type };
              setPicks(previous => invention ? [...previous, pick] : [pick]);
            }} />
        </div>
        <div className="table-choice-picks">
          <h3>Selected <output aria-label="Resources selected">{picks.length} / {limit}</output></h3>
          <ResourceCardRow cards={picks} meta={resourceMeta} Face={Face} label="Selected resources" size="picker"
            marker={Undo2} busy={busy} actionLabel={name => `Remove ${name}`} slots={limit}
            onCard={({ id: pickId, type }, event) => {
              if (event.detail === 0) pool.current.querySelector(`[data-draft-id="${type}"]`)?.focus();
              setPicks(previous => previous.filter(pick => pick.id !== pickId));
            }} />
        </div>
        {bankChanged && <p className="table-bank-warning" role="status">A selected card is no longer in the bank.</p>}
      </div>}
      {playable && <button type="button" className="draft-command match-command table-play" data-tone="gold" disabled={!canPlay}
        onClick={() => onPlay({ cardId: card.id, ...(monopoly ? { resource: picks[0].type } : invention ? { resources: counts } : {}) })}>
        Play {meta.name.toLowerCase()}
      </button>}
      <button type="button" className="draft-command match-tool table-close" data-match-shortcut="closeDevelopment"
        onClick={onClose} aria-label="Close card"><X size={17} aria-hidden="true" /></button>
    </section>
  );
}

export function RobberTray({ players, targetIds, busy, onAction }) {
  const title = useTrayFocus(), heading = useId(), description = useId();
  return (
    <section className="draft-panel table-tray robber-tray" data-table-tray="" aria-labelledby={heading} aria-describedby={description}>
      <header>
        <h2 id={heading} ref={title} tabIndex={-1} aria-describedby={description}>Steal a resource</h2>
        <p id={description}>Take one random resource from the player you choose.</p>
      </header>
      <div className="robber-targets">
        {players.filter(player => targetIds.includes(player.id)).map(player => (
          <button type="button" className="draft-command match-command robber-target" key={player.id} disabled={busy}
            aria-label={`Steal from ${player.name}, ${player.resourceCount} resource ${player.resourceCount === 1 ? "card" : "cards"}`}
            style={{ "--target-player": player.color }} onClick={() => onAction("steal", { targetId: player.id })}>
            <span className="robber-target-token" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span>
            <strong>{player.name}</strong>
            <PlayerHandBacks playerId={player.id} kind="resource" count={player.resourceCount} />
          </button>
        ))}
      </div>
    </section>
  );
}
