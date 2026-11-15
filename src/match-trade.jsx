import React, { useId } from "react";
import { Check, Handshake, Undo2, X } from "lucide-react";
import { playerTradesAvailable } from "../shared/trades.js";
import { shortcutProps } from "./match-shortcuts.jsx";

function TradeSide({ side, cards, types, meta }) {
  const labelId = useId();
  return (
    <div className="trade-side" data-side={side}>
      <span id={labelId}>{side === "get" ? "You get" : "You give"}</span>
      <ul className="trade-resources" aria-labelledby={labelId}>
        {types.filter((type) => cards[type] > 0).map((type) => {
          const { icon: Icon, name, color } = meta[type];
          const label = `${cards[type]} ${name}`;
          return (
            <li key={type} title={label} style={{ "--trade-resource": color }}>
              <Icon size={15} aria-hidden="true" />
              <span aria-hidden="true">{cards[type]}</span>
              <span className="visually-hidden">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TradeOffer({ offer, players, me, busy, canRespond, shortcuts, onAction, types, meta }) {
  const offerLabel = useId();
  const own = offer.from === me.id;
  const owner = players.find((player) => player.id === offer.from);
  const give = own ? offer.give : offer.want;
  const get = own ? offer.want : offer.give;
  const canAccept = types.every((type) => (me.resources?.[type] ?? 0) >= (give[type] ?? 0));
  const accepted = own ? players.filter((player) => offer.acceptedBy?.includes(player.id)) : [];
  const declined = own ? players.filter((player) => offer.declinedBy?.includes(player.id)).map((player) => player.name) : [];
  const respond = (type, payload) => onAction(type, { offerId: offer.id, ...payload });
  const title = own ? "Your trade offer" : `Offer from ${owner?.name ?? "player"}`;

  return (
    <article className="match-offer" aria-labelledby={offerLabel}>
      <header className="match-offer-header">
        <span className="trade-sender" style={{ "--offer-player": owner?.color }}><Handshake size={15} aria-hidden="true" /></span>
        <h2 id={offerLabel} title={title}>{title}</h2>
        {own && (
          <button type="button" className="match-command" disabled={busy || !canRespond} onClick={() => respond("cancelTrade")}>
            <Undo2 size={14} aria-hidden="true" /> Withdraw
          </button>
        )}
      </header>
      <div className="match-offer-exchange">
        <TradeSide side="get" cards={get} types={types} meta={meta} />
        <TradeSide side="give" cards={give} types={types} meta={meta} />
      </div>
      {!canRespond && <p className="trade-offer-note">Trading paused</p>}
      {own ? (
        <>
          {accepted.length > 0 && (
            <div className="trade-confirmations">
              <p className="trade-offer-note">Accepted by</p>
              <ul aria-label="Players who accepted">
                {accepted.map((player) => (
                  <li key={player.id}>
                    <span className="trade-recipient" title={player.name} style={{ "--trade-recipient": player.color }}>{player.name}</span>
                    <button type="button" className="match-command" data-tone="gold" aria-label={`Confirm trade with ${player.name}`}
                      disabled={busy || !canRespond} onClick={() => respond("confirmTrade", { recipientId: player.id })}>
                      <Check size={15} aria-hidden="true" /> Confirm
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {declined.length > 0 && <p className="trade-offer-note">Declined: {declined.join(", ")}</p>}
        </>
      ) : (
        <footer className="match-offer-footer">
          <p className="trade-offer-note" data-accepted={offer.accepted || undefined} role="status">
            {offer.accepted ? `Waiting for ${owner?.name ?? "the sender"} to confirm` : canRespond && !canAccept ? "Not enough cards to accept" : null}
          </p>
          <div className="match-offer-actions">
            <button type="button" className="match-command" data-tone="reject" {...(shortcuts && !offer.accepted ? shortcutProps("decline") : {})}
              disabled={busy} onClick={() => respond("declineTrade")}>
              <X size={15} aria-hidden="true" /> {offer.accepted ? "Withdraw acceptance" : "Decline"}
            </button>
            {!offer.accepted && (
              <button type="button" className="match-command" data-tone="gold" {...(shortcuts ? shortcutProps("accept") : {})}
                disabled={busy || !canRespond || !canAccept} onClick={() => respond("acceptTrade")}>
                <Check size={15} aria-hidden="true" /> Accept
              </button>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}

export function TradeOffers({ offers, game, me, busy, onAction, resourceTypes: types, resourceMeta: meta }) {
  const canRespond = playerTradesAvailable(game);
  return (
    <section className="match-offer-stack" aria-label="Open trade offers">
      {offers.map((offer) => (
        <TradeOffer key={offer.id} offer={offer} players={game.players} shortcuts={offers.length === 1}
          {...{ me, busy, canRespond, onAction, types, meta }} />
      ))}
    </section>
  );
}
