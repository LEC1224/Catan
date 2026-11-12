import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import "./card-fan.css";

const phone = "(max-width: 670px)";

function visiblePiles(cards, clustered) {
  if (!clustered) return cards.map(card => ({ key: card.id, card, count: 1 }));
  const groups = new Map();
  for (const card of cards) {
    const group = groups.get(card.type);
    if (group) group.push(card);
    else groups.set(card.type, [card]);
  }
  return [...groups].map(([key, group]) => ({
    key, count: group.length, card: group.find(card => !card.restriction) || group[0],
  }));
}

function fanLayout(count, viewportWidth, preferred, clustered) {
  const width = viewportWidth || preferred;
  const intervals = Math.max(0, count - 1);
  const pad = Math.min(clustered ? 4 : 24, width * .1);
  const inner = width - 2 * pad;
  const gap = clustered ? Math.min(5, inner / Math.max(1, count * 4)) : 0;
  const face = Math.min(preferred, clustered ? (inner - gap * intervals) / Math.max(1, count) : inner);
  const step = clustered ? face + gap : Math.min(face * .71, (inner - face) / Math.max(1, intervals));
  return { face, step, start: (width - face - intervals * step) / 2 };
}

export function CardFan({ kind, title, icon: Icon, cards: owned, empty, discardThreshold, onInspect, selection,
  pending, Face }) {
  const [clustered, setClustered] = useState(() => matchMedia(phone).matches);
  const cards = owned.filter(card => !pending?.has(card.id) && !selection?.selected.has(card.id));
  const piles = visiblePiles(cards, clustered);
  const available = owned.length - (selection?.selected.size ?? 0);
  const titleId = useId();
  const [dimensions, setDimensions] = useState({ width: 0, cardWidth: 76 });
  const [hovered, setHovered] = useState(null), [pinned, setPinned] = useState(null), [focused, setFocused] = useState(null);
  const viewport = useRef(null), probe = useRef(null), targets = useRef(new Map());

  useLayoutEffect(() => {
    const measure = () => {
      const width = viewport.current.clientWidth, cardWidth = probe.current.offsetWidth;
      setDimensions(old => old.width === width && old.cardWidth === cardWidth ? old : { width, cardWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    observer.observe(probe.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = matchMedia(phone);
    const change = () => { setClustered(media.matches); setPinned(null); setHovered(null); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  const highlight = hovered || pinned;
  const tabStop = piles.some(pile => pile.key === focused) ? focused : piles[0]?.key;
  const { face, step, start } = fanLayout(piles.length, dimensions.width, dimensions.cardWidth, clustered);
  const middle = (piles.length - 1) / 2;
  const angle = Math.min(12, 2 + piles.length * 1.6);
  const curve = Math.min(9, 3 + piles.length * 1.05);
  const overThreshold = discardThreshold != null && owned.length > discardThreshold;

  function handleKeys(event, index) {
    const next = { ArrowLeft: Math.max(0, index - 1), ArrowRight: Math.min(piles.length - 1, index + 1), Home: 0, End: piles.length - 1 }[event.key];
    if (next != null) {
      event.preventDefault();
      targets.current.get(piles[next].key)?.focus({ preventScroll: true });
    }
    if (event.key === "Escape") { setPinned(null); setHovered(null); }
  }

  return (
    <section className={`card-hand ${kind}-hand`} data-deal-hand={kind} data-discard-risk={overThreshold || undefined}
      data-draft-zone={kind === "resource" ? "hand" : undefined} aria-labelledby={titleId}>
      <div className="card-hand-heading">
        <Icon size={15} aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        <span className="hand-total" aria-label={`${available} cards`}>{available}</span>
        {overThreshold && <span className="hand-warning" title={`Above the discard threshold of ${discardThreshold} cards`}>
          <TriangleAlert size={14} aria-hidden="true" /><span>Over discard limit</span>
        </span>}
      </div>
      <div className="fan-viewport" ref={viewport} data-clustered={clustered || undefined}>
        <span className="fan-size-probe" data-deal-size="" ref={probe} aria-hidden="true" />
        {piles.length ? (
          <ul className="fan-track" style={{ "--fan-face-width": `${face}px` }}>
            {piles.map(({ key, card, count }, index) => {
              const offset = clustered ? 0 : (index - middle) / Math.max(1, middle);
              const laneWidth = clustered || index === piles.length - 1 ? face : step;
              const label = selection ? selection.label(card.name) : `${card.name}${card.isVictory ? ", one hidden victory point" : ""}${card.restriction ? `, ${card.restriction}` : ""}`;
              return (
                <li className="fan-slot" key={key} data-highlighted={highlight === key}
                  style={{ "--card-x": `${start + index * step}px`, "--lane-width": `${laneWidth}px`,
                    "--card-tilt": `${offset * angle}deg`, "--card-dip": `${offset * offset * curve}px`,
                    "--deal-delay": `${Math.min(index, 8) * 22}ms`, "--layer": index + 1 }}>
                  <button type="button" className="fan-target" data-draft-id={selection ? card.id : undefined}
                    data-draft-stack={clustered ? card.type : undefined} data-stacked={count > 1 || undefined}
                    ref={element => { if (element) targets.current.set(key, element); else targets.current.delete(key); }}
                    tabIndex={tabStop === key ? 0 : -1} aria-label={count > 1 ? `${label}, ${count} in hand` : label}
                    aria-disabled={selection?.blocked(card) || undefined} disabled={selection?.busy}
                    aria-pressed={selection || onInspect ? undefined : pinned === key} aria-haspopup={onInspect ? "dialog" : undefined}
                    onFocus={() => setFocused(key)} onKeyDown={event => handleKeys(event, index)}
                    onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(key); }}
                    onPointerLeave={() => setHovered(current => current === key ? null : current)}
                    onClick={event => {
                      if (selection) selection.pick(card, event);
                      else if (onInspect) onInspect(card.id);
                      else setPinned(current => current === key ? null : key);
                    }}>
                    <Face card={card} kind={kind} fan dealId={card.id} />
                    {count > 1 && <span className="fan-stack-count" aria-hidden="true">{count}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="fan-empty"><Icon size={26} strokeWidth={1.15} aria-hidden="true" /><span>{empty}</span></div>
        )}
      </div>
    </section>
  );
}
