import React, { useEffect, useId, useRef, useState } from "react";
import { Archive, ArrowDownToLine, ArrowUpFromLine, Landmark, Minus, Package, Plus, Undo2, Users, X } from "lucide-react";
import { bankTradeRate, MAX_TRADE_OFFERS, playerTradesAvailable } from "../shared/trades.js";
import { useDraftFlights } from "./draft-flights.js";
import { heldCopies, resourceCopies, resourceCounts } from "./resource-copies.js";
import { bankTradeDraft } from "./trade-draft.js";
import "./resource-card-draft.css";

const empty = { key: null, give: [], want: [] };

function ResourceFace({ card, dealId }) {
  const Icon = card.icon;
  return (
    <span className="draft-face" style={{ "--draft-ink": card.color }} aria-hidden="true"
      data-deal-card={dealId} data-deal-type={dealId ? card.type : undefined}>
      <span className="draft-face-art" style={{ backgroundPosition: `${(card.tile % 3) * 50}% ${card.tile >= 3 ? 100 : 0}%` }} />
      <span className="draft-face-icon"><Icon size={13} /></span>
      <strong>{card.name}</strong>
    </span>
  );
}

export function ResourceCardRow({ cards, meta, Face = ResourceFace, zone, label, labelledBy, onCard, actionLabel,
  blocked, busy, marker: Marker, size, emptySlot = false }) {
  return (
    <ul className="draft-card-row" data-draft-zone={zone} data-size={size} aria-label={label} aria-labelledby={labelledBy}
      tabIndex={size === "offer" && cards.length > 4 ? 0 : undefined}>
      {emptySlot && !cards.length && (
        <li className="draft-slot-placeholder" aria-hidden="true"><Minus size={18} /></li>
      )}
      {cards.map(card => {
        const resource = { ...meta[card.type], type: card.type };
        const unavailable = blocked?.(card);
        const face = <Face card={resource} kind="resource" dealId={zone === "hand" ? card.id : undefined} />;
        return (
          <li key={card.id} className="draft-card-shell">
            {onCard ? (
              <button type="button" className="draft-card-button" data-draft-id={card.id} aria-label={actionLabel(resource.name)}
                aria-disabled={unavailable || undefined} disabled={busy}
                onClick={event => { if (!unavailable) onCard(card, event); }}>
                {face}
                {Marker && <span className="draft-card-mark" aria-hidden="true"><Marker size={11} strokeWidth={2.6} /></span>}
              </button>
            ) : <>{face}<span className="draft-sr-only">{resource.name}</span></>}
          </li>
        );
      })}
    </ul>
  );
}

function DraftLane({ side, label, children, picker }) {
  const id = useId();
  const Icon = side === "get" ? ArrowDownToLine : ArrowUpFromLine;
  return (
    <div className="draft-lane" data-side={side} role="group" aria-labelledby={id}>
      <span className="draft-sr-only" id={id}>{label}</span>
      <Icon className="draft-direction" size={20} strokeWidth={2.4} aria-hidden="true" />
      {picker}
      {children}
    </div>
  );
}

export function ResourceOfferCards({ give, get, resourceTypes, resourceMeta }) {
  return (
    <div className="draft-offer-lanes">
      <DraftLane side="get" label="Cards you get">
        <ResourceCardRow cards={resourceCopies(get, resourceTypes)} meta={resourceMeta} size="offer" />
      </DraftLane>
      <DraftLane side="give" label="Cards you give">
        <ResourceCardRow cards={resourceCopies(give, resourceTypes)} meta={resourceMeta} size="offer" />
      </DraftLane>
    </div>
  );
}

function FallbackHand({ cards, meta, selection, count, threshold }) {
  return (
    <section className="draft-fallback-hand" aria-label="Resources" data-deal-hand="resource"
      data-discard-risk={count > threshold || undefined}>
      <div><Package size={16} aria-hidden="true" /> <strong>Resources</strong> <span>{cards.length}</span>
        {count > threshold && <small>Over discard limit</small>}</div>
      {cards.length ? <ResourceCardRow cards={cards} meta={meta} zone="hand" size="hand"
        onCard={selection?.pick} actionLabel={selection?.label} blocked={selection?.blocked} busy={selection?.busy} />
        : <p>No resources</p>}
    </section>
  );
}

export function ResourceCardDraft({ game, me, offers, tradeOpen, canTrade, discardCount, busy, onOpen, onClose, onAction,
  resourceTypes: types, resourceMeta: meta, Face, renderHand, pending }) {
  const mode = discardCount ? "discard" : tradeOpen && canTrade ? "trade" : null;
  const key = discardCount ? `discard:${game.turn}:${discardCount}` : canTrade ? `trade:${game.turn}` : null;
  const [draft, setDraft] = useState(empty);
  const requestId = useRef(0), workspace = useRef(null), layer = useRef(null);
  const transfer = useDraftFlights(workspace, layer, mode);
  const current = draft.key === key ? draft : empty;
  const give = heldCopies(current.give, me.resources);
  const { want } = current;
  const giveCounts = resourceCounts(give), wantCounts = resourceCounts(want);
  const selected = new Set(mode ? give.map(card => card.id) : []);
  const bank = mode === "trade" ? bankTradeDraft(giveCounts, wantCounts, game.bank,
    type => bankTradeRate(game.board.vertices, me.id, type), type => meta[type].name.toLowerCase()) : {};
  const full = offers.length >= MAX_TRADE_OFFERS;
  const canOffer = mode === "trade" && playerTradesAvailable(game);
  const complete = give.length > 0 && want.length > 0;

  useEffect(() => {
    setDraft(previous => {
      if (!mode || key !== previous.key) return empty;
      const valid = heldCopies(previous.give, me.resources);
      return valid.length === previous.give.length ? previous : { ...previous, give: valid };
    });
  }, [mode, key, me.resources]);

  const store = (nextGive, nextWant) => setDraft({ key, give: nextGive, want: nextWant });
  const blocked = card => mode === "discard" ? give.length >= discardCount : !!wantCounts[card.type];
  const selection = mode === "discard" || canTrade ? {
    selected, mode, blocked, busy,
    label: name => mode === "discard" ? `Select ${name} to discard` : mode === "trade" ? `Give ${name}` : `Trade ${name}`,
    pick: (card, event) => {
      if (busy || blocked(card) || selected.has(card.id)) return;
      if (!mode) onOpen();
      transfer(event, card.id, "give");
      store([...give, { id: card.id, type: card.type }], want);
    },
  } : null;

  function returnCard(card, event) {
    transfer(event, card.id, "hand");
    store(give.filter(item => item.id !== card.id), want);
  }

  function requestCard({ type, id: pickerId }, event) {
    const id = `${type}:request:${++requestId.current}`;
    transfer(event, pickerId, "want", { toId: id, refocus: false });
    store(give, [...want, { id, type }]);
  }

  function removeRequest(card, event) {
    transfer(event, card.id, "picker", { toId: card.type });
    store(give, want.filter(item => item.id !== card.id));
  }

  async function submit(type, payload) {
    if (await onAction(type, payload)) setDraft(empty);
  }

  const giveRow = (
    <ResourceCardRow cards={give} meta={meta} Face={Face} zone="give" onCard={returnCard} busy={busy}
      actionLabel={name => `Return ${name} to hand`} marker={Undo2} emptySlot />
  );
  return (
    <div className="card-draft-workspace" data-mode={mode || undefined} ref={workspace}>
      {mode === "trade" && (
        <section className="draft-panel draft-trade-panel" id="match-trade-tray" aria-label="Trade">
          <DraftLane side="give" label="Cards you give">{giveRow}</DraftLane>
          <DraftLane side="get" label="Cards you get" picker={
            <ResourceCardRow cards={types.map(type => ({ id: type, type }))} meta={meta} Face={Face} zone="picker"
              label="Request resources" size="picker" marker={Plus} onCard={requestCard}
              actionLabel={name => `Request one ${name}`} busy={busy} blocked={card => !!giveCounts[card.type] || (wantCounts[card.type] || 0) >= 150} />
          }>
            <ResourceCardRow cards={want} meta={meta} Face={Face} zone="want" onCard={removeRequest} busy={busy}
              actionLabel={name => `Remove requested ${name}`} marker={Undo2} emptySlot />
          </DraftLane>
          <button type="button" className="draft-command match-command draft-close" aria-label="Close trade" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
          <footer className="draft-actions">
            <small className="draft-status" role="status">{complete && canOffer && full ? `Withdraw an offer to send another (limit ${MAX_TRADE_OFFERS}).` : bank.hint}</small>
            <button type="button" className="draft-command match-command" data-tone="gold" disabled={busy || !bank.payload}
              onClick={() => submit("bankTrade", bank.payload)}>
              <Landmark size={17} aria-hidden="true" /> Trade with bank {bank.rate && <span className="draft-rate">{bank.rate}:1</span>}
            </button>
            <button type="button" className="draft-command match-command" data-tone="gold" disabled={busy || !complete || !canOffer || full}
              onClick={() => submit("offerTrade", { give: giveCounts, want: wantCounts })}>
              <Users size={17} aria-hidden="true" /> Offer to players
            </button>
          </footer>
        </section>
      )}
      {mode === "discard" && (
        <section className="draft-panel draft-discard-panel" aria-label="Discard resources">
          <header className="draft-discard-heading">
            <Archive size={20} aria-hidden="true" />
            <h2>Discard resources</h2>
            <output className="draft-count" aria-label="Selected to discard" data-complete={give.length === discardCount}>
              {give.length} / {discardCount}
            </output>
          </header>
          <DraftLane side="give" label="Cards to discard">{giveRow}</DraftLane>
          <button type="button" className="draft-command match-command" data-tone="gold" data-draft-confirm
            aria-label={`Discard ${discardCount} resources`} disabled={busy || give.length !== discardCount}
            onClick={() => submit("discard", { resources: giveCounts })}>Discard</button>
        </section>
      )}
      {renderHand ? renderHand(selection) : (
        <FallbackHand cards={resourceCopies(me.resources, types).filter(card => !selected.has(card.id) && !pending?.has(card.id))} meta={meta}
          selection={selection} count={me.resourceCount} threshold={game.settings.discardThreshold} />
      )}
      <div className="draft-flight-layer" aria-hidden="true" ref={layer} />
    </div>
  );
}
