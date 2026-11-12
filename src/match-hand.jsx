import React, { useContext, useMemo } from "react";
import { LockKeyhole, Package, ScrollText } from "lucide-react";
import { CardFan } from "./card-fan.jsx";
import { PendingCardArrivals } from "./card-deals.jsx";
import { resourceCopies } from "./resource-copies.js";
import { developmentRestriction } from "./match-prompts.jsx";

export function CardIllustration({ kind, tile, className = "", theme }) {
  return (
    <span
      className={`card-illustration ${kind}-illustration ${className}`}
      data-development={theme}
      style={{ backgroundPosition: `${(tile % 3) * 50}% ${tile >= 3 ? 100 : 0}%` }}
      aria-hidden="true"
    />
  );
}

export function CardFace({ card, kind, fan = false, dealId }) {
  const Icon = card.icon;
  return (
    <span className={`card-face${fan ? " fan-face" : ""}`} data-development={card.theme}
      data-deal-card={dealId} data-deal-type={dealId ? card.type || card.theme : undefined}
      style={{ "--card-accent": card.color }} aria-hidden="true">
      <CardIllustration kind={kind} tile={card.tile} />
      <span className="fan-emblem"><Icon size={15} strokeWidth={2.1} /></span>
      {card.restriction && <span className="fan-lock"><LockKeyhole size={12} /></span>}
      <span className="fan-name">
        <strong>{card.name}</strong>
        {card.isVictory && <small>+1 VP</small>}
      </span>
    </span>
  );
}

export function MatchHands({ me, game, resourceTypes, resourceMeta, developmentMeta, onInspect, inspected, inspectionId, selection }) {
  const pending = useContext(PendingCardArrivals);
  const resources = useMemo(
    () => resourceCopies(me.resources, resourceTypes).map(card => ({ ...resourceMeta[card.type], ...card })),
    [me.resources, resourceTypes, resourceMeta],
  );
  const development = (me.development || []).map((card) => ({
    ...(developmentMeta[card.type] || developmentMeta.knight),
    id: card.id,
    type: card.type,
    theme: card.type,
    isVictory: card.type === "victoryPoint",
    restriction: developmentRestriction(card, game, me.id),
  }));
  return (
    <div className="match-hands">
      <CardFan kind="resource" title="Resources" icon={Package} cards={resources} empty="No resources" discardThreshold={game.settings.discardThreshold} selection={selection} pending={pending} Face={CardFace} />
      <CardFan kind="development" title="Development" icon={ScrollText} cards={development} empty="No development cards"
        onInspect={onInspect} inspected={inspected} inspectionId={inspectionId} pending={pending} Face={CardFace} />
    </div>
  );
}
