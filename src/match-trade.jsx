import React, { useId, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Handshake, Undo2, X } from "lucide-react";
import { playerTradesAvailable } from "../shared/trades.js";
import { CardFace } from "./match-hand.jsx";
import { shortcutProps } from "./match-shortcuts.jsx";
import { ResourceCardRow } from "./resource-card-draft.jsx";
import { resourceCopies } from "./resource-copies.js";

function HandGlyph({ size = 23 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 30 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="3" y="5" width="11" height="18" rx="1.7" transform="rotate(-17 8 18)" fill="currentColor" fillOpacity=".17" />
      <rect x="16" y="5" width="11" height="18" rx="1.7" transform="rotate(17 22 18)" fill="currentColor" fillOpacity=".17" />
      <rect x="9.5" y="3" width="11" height="20" rx="1.7" fill="currentColor" fillOpacity=".55" />
      <path d="M12.2 19.2h5.6" strokeLinecap="round" />
    </svg>
  );
}

function TradeHeading({ side, id }) {
  const get = side === "get";
  const Icon = get ? ArrowLeft : ArrowRight;
  return (
    <div className="trade-side-title">
      <h3 id={id} className="visually-hidden">{get ? "You get" : "You give"}</h3>
      <Icon size={19} strokeWidth={2.4} aria-hidden="true" />
    </div>
  );
}

export function TradeOffers({ offers, game, me, busy, onAction, resourceTypes: types, resourceMeta: meta }) {
  const [selected, setSelected] = useState(null);
  const getLabel = useId(), giveLabel = useId(), offerLabel = useId();
  const offer = offers.find((entry) => entry.id === selected) ?? offers[0];
  const own = offer.from === me.id;
  const owner = game.players.find((player) => player.id === offer.from);
  const give = own ? offer.give : offer.want;
  const get = own ? offer.want : offer.give;
  const canAccept = types.every((type) => (me.resources?.[type] || 0) >= (give[type] || 0));
  const canRespond = playerTradesAvailable(game);
  const declined = own && game.players.filter((player) => offer.declinedBy?.includes(player.id)).map((player) => player.name);
  const respond = (type) => onAction(type, { offerId: offer.id });

  return (
    <aside className="match-offer" aria-labelledby={offerLabel}>
      <header className="match-offer-header">
        <span className="trade-sender" style={{ "--offer-player": owner?.color }}><Handshake size={17} aria-hidden="true" /></span>
        <h2 id={offerLabel} title={owner?.name}>{own ? "Your trade offer" : `Offer from ${owner?.name || "player"}`}</h2>
      </header>
      {offers.length > 1 && (
        <div className="trade-offer-tabs" role="group" aria-label="Open trade offers">
          {offers.map((entry, index) => (
            <button type="button" className="match-command" key={entry.id} aria-pressed={entry.id === offer.id}
              aria-label={`Offer ${index + 1} of ${offers.length}`} onClick={() => setSelected(entry.id)}>{index + 1}</button>
          ))}
        </div>
      )}
      <div className="match-offer-exchange">
        <div className="trade-hand-anchor" style={{ "--hand-player": me.color }} aria-hidden="true"><HandGlyph size={28} /></div>
        <div className="match-offer-lanes">
          <div className="trade-side" data-side="get">
            <TradeHeading side="get" id={getLabel} />
            <ResourceCardRow cards={resourceCopies(get, types)} meta={meta} Face={CardFace} size="offer" labelledBy={getLabel} />
          </div>
          <div className="trade-side" data-side="give">
            <TradeHeading side="give" id={giveLabel} />
            <ResourceCardRow cards={resourceCopies(give, types)} meta={meta} Face={CardFace} size="offer" labelledBy={giveLabel} />
          </div>
        </div>
      </div>
      {!canRespond ? <p className="trade-offer-note">Trading paused</p> :
        own && declined.length > 0 ? <p className="trade-offer-note">Declined: {declined.join(", ")}</p> :
        !own && !canAccept ? <p className="trade-offer-note">Not enough cards to accept</p> : null}
      <footer className="match-offer-actions">
        {own ? (
          <button type="button" className="match-command" disabled={busy || !canRespond} onClick={() => respond("cancelTrade")}>
            <Undo2 size={16} aria-hidden="true" /> Withdraw
          </button>
        ) : (
          <>
            <button type="button" className="match-command" data-tone="reject" {...shortcutProps("decline")} disabled={busy} onClick={() => respond("declineTrade")}>
              <X size={16} aria-hidden="true" /> Decline
            </button>
            <button type="button" className="match-command" data-tone="gold" {...shortcutProps("accept")} disabled={busy || !canRespond || !canAccept} onClick={() => respond("acceptTrade")}>
              <Check size={16} aria-hidden="true" /> Accept
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}
