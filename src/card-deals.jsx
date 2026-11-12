import React, { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./card-deals.css";

const reducedMotion = "(prefers-reduced-motion: reduce)";
const maxCardsPerMove = 5;
const miniWidth = 13;
const emptyMap = new Map();
const emptyQueue = { flights: [], pending: emptyMap, landings: emptyMap };
export const PendingCardArrivals = createContext(emptyMap);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const belongsTo = (end, id) => end.kind === "player" && end.id === id;
const bankKey = (move) => move.kind === "development" ? "development" : move.type;
const relayKey = (end) => end.kind === "bank" ? "bank" : `player:${end.id}`;
const find = (root, key, value) => root?.querySelector(`[data-deal-${key}="${CSS.escape(value)}"]`);

function CardBack({ kind }) {
  return <span className="deal-card-back" data-kind={kind} aria-hidden="true" />;
}

export function PlayerHandBacks({ playerId, kind, count, discardThreshold }) {
  const atRisk = kind === "resource" && discardThreshold != null && count > discardThreshold;
  const label = `${count} ${kind} ${count === 1 ? "card" : "cards"}${atRisk ? `, above the discard limit of ${discardThreshold}` : ""}`;
  const shown = clamp(count, 1, maxCardsPerMove);
  return (
    <span className="deal-hand-backs" data-discard-risk={atRisk || undefined} role="img" aria-label={label} title={label}>
      <span className="deal-mini-fan" data-deal-player={playerId} data-deal-kind={kind} data-empty={count === 0} aria-hidden="true">
        {Array.from({ length: shown }, (_, index) => {
          const offset = index - (shown - 1) / 2;
          return <span key={index} className="deal-mini-card" style={{ transform: `translate(${offset * 4}px, ${Math.abs(offset)}px) rotate(${offset * 7}deg)` }}><CardBack kind={kind} /></span>;
        })}
      </span>
      <span aria-hidden="true">{count}</span>
    </span>
  );
}

function point(element, clip) {
  const rect = element?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return null;
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight ||
      (clip && (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom))) return null;
  return { x, y };
}

function handPoint(root, move, arrivalId) {
  const hand = find(root, "hand", move.kind);
  if (!hand) return null;
  const viewport = hand.querySelector(".fan-viewport") || hand;
  const bounds = viewport.getBoundingClientRect();
  const pile = move.type && find(hand, "pile", move.type);
  const matching = move.type && [...hand.querySelectorAll(`[data-deal-type="${CSS.escape(move.type)}"]`)].at(-1);
  const card = (arrivalId && find(hand, "card", arrivalId)) || pile || matching;
  const sample = card || hand.querySelector("[data-deal-size], [data-deal-card], [data-deal-pile]");
  const width = sample?.offsetWidth || 72, height = sample?.offsetHeight || 96;
  const destination = point(card, bounds);
  const center = point(viewport);
  if (!center) return null;
  if (!destination) {
    const rect = card?.getBoundingClientRect();
    const inset = Math.min(width / 2, bounds.width / 2);
    return { ...center, x: rect ? clamp(rect.left + rect.width / 2, bounds.left + inset, bounds.right - inset) : center.x, width, height };
  }
  const transform = getComputedStyle(card).transform;
  const matrix = transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
  const scale = Math.hypot(matrix.a, matrix.b);
  return { ...destination, width: width * scale, height: height * scale, angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI };
}

function tablePoint(root, end, move) {
  if (end.kind === "tile") {
    const polygon = find(root, "tile", end.id);
    const rect = polygon?.getBoundingClientRect(), board = polygon?.ownerSVGElement?.getBoundingClientRect();
    if (!rect?.width || !board?.height) return null;
    return { x: clamp(rect.left + rect.width / 2, Math.max(6, board.left), Math.min(window.innerWidth - 6, board.right)),
      y: clamp(rect.top + rect.height / 2, Math.max(6, board.top), Math.min(window.innerHeight - 6, board.bottom)) };
  }
  if (end.kind === "bank") {
    const slot = bankKey(move) && find(root, "bank", bankKey(move));
    return point(slot || root.querySelector(".bank-panel"));
  }
  const fan = root.querySelector(`[data-deal-player="${CSS.escape(end.id)}"][data-deal-kind="${move.kind}"]`);
  const card = fan?.lastElementChild;
  const destination = point(card, card?.closest(".match-player-list")?.getBoundingClientRect());
  return destination && { ...destination, width: miniWidth, angle: Math.max(0, fan.childElementCount - 1) * 3.5 };
}

function planFlights(deals, before, me, rollDelay) {
  const next = { ...before.resources };
  const spentFrom = { ...before.resources };
  return deals.flatMap(({ id, action, moves }) => {
    const litTiles = new Set();
    return moves.flatMap((move, route) => {
      const { from, to, kind, type, cardId } = move;
      const incoming = belongsTo(to, me.id);
      const outgoing = belongsTo(from, me.id);
      const fromTile = from.kind === "tile";
      const cue = fromTile && !litTiles.has(from.id);
      if (fromTile) litTiles.add(from.id);
      const shown = Math.min(move.count, maxCardsPerMove);
      return Array.from({ length: shown }, (_, index) => {
        const count = index === shown - 1 ? move.count - index : 1;
        const arrivals = [];
        let sourceId;
        if (outgoing && kind === "resource" && type && spentFrom[type] > 0) {
          sourceId = `${type}:${spentFrom[type] - 1}`;
          spentFrom[type] = Math.max(0, spentFrom[type] - count);
        }
        if (incoming && kind === "resource" && type) {
          const start = next[type] || 0;
          const end = Math.min(start + count, me.resources?.[type] || 0);
          for (let i = start; i < end; i++) arrivals.push(`${type}:${i}`);
          next[type] = Math.max(start, end);
        } else if (incoming && cardId && me.development?.some(card => card.id === cardId)) {
          arrivals.push(cardId);
        }
        return { key: `${id}:${route}:${index}`, move, count, arrivals, sourceId, cue: cue && index === 0, pop: action === "rollDice",
          delay: (action === "rollDice" ? rollDelay : 0) + Math.min(180, route * 38) + index * 72 };
      });
    });
  });
}

function flightPath(from, to, width, height, outgoing, incoming, fromTile) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const start = outgoing ? 1 : from.width ? from.width / width : fromTile ? .33 : .26;
  const end = incoming ? 1 : (to.width || 17) / width;
  const bend = Math.min(78, distance * .22);
  const frame = (t, offset, opacity, grow = 1) => {
    const curve = Math.sin(t * Math.PI);
    // Reverse directions arc to opposite sides, so both halves of a trade remain visible.
    const x = from.x + dx * t - dy / Math.max(1, distance) * bend * curve;
    const y = from.y + dy * t + dx / Math.max(1, distance) * bend * curve - curve * 26;
    const scale = start + (end - start) * t + (outgoing || incoming ? 0 : .37 * curve);
    const angle = (from.angle || 0) * (1 - t) + (to.angle || 0) * t + 12 * curve * (dx < 0 ? -1 : 1);
    return { offset, transform: `translate3d(${x - width / 2}px, ${y - height / 2}px, 0) rotate(${angle}deg) scale(${scale * grow})`, opacity };
  };
  if (!fromTile) return {
    frames: [0, .12, .44, .76, 1].map(t => frame(t, t, outgoing || t ? 1 : 0)),
    duration: clamp(475 + distance * .22, 500, 680), easing: "cubic-bezier(.28,.56,.33,1)",
  };
  const hold = 195;
  const travel = clamp(570 + distance * .28, 630, 820);
  const duration = hold + travel;
  // Let the card appear on the hex before it accelerates away from it.
  const frames = [frame(0, 0, 0, .88), frame(0, 85 / duration, 1, 1.13), frame(0, hold / duration, 1)];
  for (const time of [.08, .2, .38, .56, .74, .88, 1]) {
    frames.push(frame(time * time * (3 - 2 * time), (hold + time * travel) / duration, 1));
  }
  return { frames, duration, easing: "linear" };
}

// Used when the hand doesn't provide a shared face component.
function TravelFace({ card, kind }) {
  const Icon = card.icon;
  return <span className="deal-simple-face" style={{ "--deal-ink": card.color }}>
    {kind === "resource" && <span style={{ backgroundPosition: `${(card.tile % 3) * 50}% ${card.tile >= 3 ? 100 : 0}%` }} />}
    <Icon size={18} />
    <strong>{card.name}</strong>
  </span>;
}

// The cards being paid may disappear in this commit. Read their actual screen positions before the DOM changes.
class OutgoingCardPositions extends React.Component {
  getSnapshotBeforeUpdate(previous) {
    const { flights, scope, meId } = this.props;
    const root = scope.current;
    if (!root || flights === previous.flights || !flights.length) return null;
    const seen = new Set(previous.flights);
    const points = [];
    for (const flight of flights) {
      const { move, sourceId } = flight;
      if (seen.has(flight) || move.from.kind !== "player") continue;
      const origin = belongsTo(move.from, meId) ? handPoint(root, move, sourceId) : tablePoint(root, move.from, move);
      if (origin) points.push([flight, origin]);
    }
    return points;
  }

  componentDidUpdate(_props, _state, points) {
    if (points) for (const [flight, origin] of points) this.props.positions.current.set(flight, origin);
  }

  render() { return null; }
}

function FlyingCard({ flight, scope, meId, face, Face, done, positions }) {
  const element = useRef(null), turner = useRef(null);
  const { move, delay, arrivals, count, cue } = flight;
  const outgoing = belongsTo(move.from, meId), incoming = belongsTo(move.to, meId);
  const reveal = face && incoming && (move.from.kind === "player" || move.kind === "development");
  const cover = face && move.to.kind === "player" && !incoming;

  useLayoutEffect(() => {
    const root = scope.current, node = element.current;
    let motion, turn, outline, cancelled = false;
    const finish = (touchdown) => {
      // The overlay holds its last frame until React puts the card into the hand.
      if (!cancelled) done(flight, touchdown);
    };
    const timer = setTimeout(() => {
      const endpoint = (end, local, targetId) => local ? handPoint(root, move, targetId)
        : tablePoint(root, end, move) || point(find(root, "relay", relayKey(end)))
          || point(root.querySelector(".match-drawer-button"));
      const from = positions.current.get(flight) || endpoint(move.from, outgoing);
      const to = endpoint(move.to, incoming, arrivals[0] || move.cardId);
      if (!from || !to || !node?.animate) return finish();
      const width = (incoming ? to.width : outgoing ? from.width : null) || 72;
      const height = (incoming ? to.height : outgoing ? from.height : null) || width * 1.34;
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      const { frames, duration, easing } = flightPath(from, to, width, height, outgoing, incoming, move.from.kind === "tile");
      motion = node.animate(frames, { duration, fill: "both", easing });
      if (cue) outline = find(root, "tile", move.from.id)?.animate([
        { opacity: 0 }, { opacity: .95, offset: .2 }, { opacity: .95, offset: .58 }, { opacity: 0 },
      ], { duration: 390 });
      if (reveal || cover) {
        const front = "rotateY(0deg)", back = "rotateY(180deg)";
        turn = turner.current.animate(reveal
          ? [{ transform: back }, { transform: back, offset: .16 }, { transform: front, offset: .47 }, { transform: front }]
          : [{ transform: front }, { transform: front, offset: .58 }, { transform: back, offset: .93 }, { transform: back }],
        { duration, fill: "both", easing: "ease-in-out" });
      }
      motion.finished.then(() => finish(incoming ? to : undefined), () => {});
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); motion?.cancel(); turn?.cancel(); outline?.cancel(); };
  }, [scope, flight, move, delay, arrivals, cue, incoming, outgoing, reveal, cover, done, positions]);

  return <span className="deal-flying-card" ref={element}>
    {face ? <span className="deal-card-turner" ref={turner}>
      <span className="deal-card-plane"><Face card={face} kind={move.kind} /></span>
      <span className="deal-card-plane deal-reverse"><CardBack kind={move.kind} /></span>
    </span> : <CardBack kind={move.kind} />}
    {count > 1 && <span className="deal-bundle-count">×{count}</span>}
  </span>;
}

function heldCard(me, id) {
  const [type, index] = id.split(":");
  return index === undefined ? me.development?.some(card => card.id === id) : Number(index) < (me.resources?.[type] || 0);
}

export function useCardDeals({ matchId, stream, game, me, rollDelay = 0 }) {
  const history = game.cardDeals ?? [];
  const id = history.at(-1)?.id ?? 0;
  const [state, setState] = useState(() => ({ id, matchId, stream, me, ...emptyQueue }));
  let queue = state;
  if (state.me !== me || state.id !== id || state.matchId !== matchId || state.stream !== stream) {
    // Reconcile the new snapshot before rendering the hand, so its slots never reserve space in advance.
    const sameMatch = me && state.me?.id === me.id && state.matchId === matchId && state.stream === stream && id >= state.id;
    const previous = sameMatch ? state : emptyQueue;
    const next = sameMatch && id > state.id && !document.hidden && !matchMedia(reducedMotion).matches
      ? planFlights(history.filter(deal => deal.id > state.id), state.me, me, rollDelay) : [];
    const pending = new Map([...previous.pending].filter(([card]) => heldCard(me, card)));
    const landings = new Map([...previous.landings].filter(([card]) => heldCard(me, card)));
    for (const flight of next) for (const card of flight.arrivals) pending.set(card, flight.key);
    queue = { id, matchId, stream, me, flights: [...previous.flights, ...next], pending, landings };
    setState(queue);
  }

  const done = useCallback((flight, touchdown) => setState(current => {
    if (!current.flights.includes(flight)) return current;
    const pending = new Map(current.pending), landings = new Map(current.landings);
    for (const card of flight.arrivals) if (pending.get(card) === flight.key) {
      pending.delete(card);
      if (touchdown) landings.set(card, { ...touchdown, pop: flight.pop });
    }
    return { ...current, flights: current.flights.filter(item => item !== flight), pending, landings };
  }), []);
  useEffect(() => {
    const cancel = () => setState(current => current.flights.length ? { ...current, ...emptyQueue } : current);
    const media = matchMedia(reducedMotion);
    const hide = () => { if (document.hidden) cancel(); };
    media.addEventListener("change", cancel);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("resize", cancel);
    return () => {
      media.removeEventListener("change", cancel);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("resize", cancel);
    };
  }, []);
  return { flights: queue.flights, pending: queue.pending, landings: queue.landings, done };
}

export function CardDealLayer({ scope, game, me, deals, resourceMeta, developmentMeta, Face = TravelFace }) {
  const { flights, landings, done } = deals;
  const relayRack = useRef(null);
  const settled = useRef(new WeakSet());
  const positions = useRef(new WeakMap());
  const [relays, setRelays] = useState(emptyMap);

  useLayoutEffect(() => {
    if (!flights.length) { setRelays(emptyMap); return; }
    const root = scope.current;
    const needed = new Map();
    for (const { move } of flights) for (const end of [move.from, move.to]) {
      if (end.kind !== "tile" && !belongsTo(end, me.id) && !tablePoint(root, end, move)) {
        needed.set(relayKey(end), { end, kind: move.kind });
      }
    }
    if (needed.size) setRelays(current => {
      // Keep fallback anchors in place until the whole queue has landed.
      const newEntries = [...needed].filter(([key]) => !current.has(key));
      return newEntries.length ? new Map([...current, ...newEntries]) : current;
    });
  }, [flights, scope, me.id]);

  useLayoutEffect(() => {
    if (!relayRack.current) return;
    const boardTop = scope.current.querySelector(".game-board")?.getBoundingClientRect().top;
    relayRack.current.style.top = `${Math.max(8, (boardTop || 0) + 8)}px`;
  }, [relays, scope]);

  useLayoutEffect(() => {
    if (matchMedia(reducedMotion).matches) return;
    for (const [id, touchdown] of landings) {
      const card = find(scope.current, "card", id);
      if (!card?.animate || settled.current.has(card)) continue;
      settled.current.add(card);
      card.dataset.dealAnimated = "";
      const rect = card.getBoundingClientRect();
      const x = touchdown.x - rect.left - rect.width / 2, y = touchdown.y - rect.top - rect.height / 2;
      const slot = card.closest(".fan-slot");
      if (slot) slot.dataset.dealLanding = "";
      const motion = card.animate([
        { translate: `${x}px ${y}px`, scale: 1 },
        { translate: `${x * .3}px ${y * .3}px`, scale: touchdown.pop ? 1.055 : 1, offset: .55 },
        { translate: "0px 0px", scale: 1 },
      ], { duration: 220, easing: "cubic-bezier(.2,.65,.22,1)" });
      const settle = () => { if (slot) delete slot.dataset.dealLanding; };
      motion.finished.then(settle, settle);
    }
  }, [landings, scope]);

  return <>
    <OutgoingCardPositions flights={flights} scope={scope} meId={me.id} positions={positions} />
    {flights.length > 0 && <div className="deal-layer" aria-hidden="true">
      {relays.size > 0 && <div className="deal-relays" ref={relayRack}>
        {[...relays].map(([key, { end, kind }]) => {
          const player = game.players.find(p => p.id === end.id);
          return <span key={key} className="deal-relay">
            <span className="deal-relay-icon" data-deal-relay={key} style={{ "--deal-player": player?.color }}><CardBack kind={kind} /></span>
            {player?.name || "Bank"}
          </span>;
        })}
      </div>}
      {flights.map(flight => {
        const { type, kind } = flight.move;
        const card = (kind === "resource" ? resourceMeta : developmentMeta)[type];
        const face = kind === "development" && card ? { ...card, theme: type, isVictory: type === "victoryPoint" } : card;
        return <FlyingCard key={flight.key} flight={flight} scope={scope} meId={me.id} face={face} Face={Face} done={done} positions={positions} />;
      })}
    </div>}
  </>;
}
