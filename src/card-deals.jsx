import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./card-deals.css";

const reducedMotion = "(prefers-reduced-motion: reduce)";
const maxCardsPerMove = 5;
const miniWidth = 13;
const emptyQueue = { flights: [], relays: new Map() };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const belongsTo = (end, id) => end.kind === "player" && end.id === id;
const bankKey = (move) => move.kind === "development" ? "development" : move.type;
const relayKey = (end) => end.kind === "bank" ? "bank" : `player:${end.id}`;
const find = (root, key, value) => root?.querySelector(`[data-deal-${key}="${CSS.escape(value)}"]`);

function CardBack({ kind }) {
  return <span className="deal-card-back" data-kind={kind} aria-hidden="true" />;
}

export function PlayerHandBacks({ playerId, kind, count }) {
  const label = `${count} ${kind} ${count === 1 ? "card" : "cards"}`;
  const shown = clamp(count, 1, maxCardsPerMove);
  return (
    <span className="deal-hand-backs" role="img" aria-label={label} title={label}>
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
  const matching = move.type && find(hand, "type", move.type);
  const card = (arrivalId && find(hand, "card", arrivalId)) || pile || matching;
  const sample = card || hand.querySelector("[data-deal-card], [data-deal-pile]");
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

function planFlights(deals, before, me, root, rollDelay) {
  const next = { ...before.resources };
  return deals.flatMap(({ id, action, moves }) => moves.flatMap((move, route) => {
    const { from, to, kind, type, cardId } = move;
    const incoming = belongsTo(to, me.id);
    const relays = [from, to].filter(end => end.kind !== "tile" && !belongsTo(end, me.id) && !tablePoint(root, end, move));
    const shown = Math.min(move.count, maxCardsPerMove);
    return Array.from({ length: shown }, (_, index) => {
      const count = index === shown - 1 ? move.count - index : 1;
      const arrivals = [];
      if (incoming && kind === "resource" && type) {
        const start = next[type] || 0;
        const end = Math.min(start + count, me.resources?.[type] || 0);
        for (let i = start; i < end; i++) arrivals.push(`${type}:${i}`);
        next[type] = Math.max(start, end);
      } else if (incoming && cardId && me.development?.some(card => card.id === cardId)) {
        arrivals.push(cardId);
      }
      return { key: `${id}:${route}:${index}`, move, count, arrivals, relays,
        delay: (action === "rollDice" ? rollDelay : 0) + Math.min(132, route * 24) + index * 64 };
    });
  }));
}

function flightPath(from, to, width, height, outgoing, incoming) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const start = outgoing ? 1 : from.width ? from.width / width : .26;
  const end = incoming ? 1 : (to.width || 17) / width;
  const bend = Math.min(78, distance * .22);
  const frames = [0, .12, .44, .76, 1].map(t => {
    const curve = Math.sin(t * Math.PI);
    // Reverse directions arc to opposite sides, so both halves of a trade remain visible.
    const x = from.x + dx * t - dy / Math.max(1, distance) * bend * curve;
    const y = from.y + dy * t + dx / Math.max(1, distance) * bend * curve - curve * 26;
    const scale = start + (end - start) * t + (outgoing || incoming ? 0 : .37 * curve);
    const angle = (from.angle || 0) * (1 - t) + (to.angle || 0) * t + 12 * curve * (dx < 0 ? -1 : 1);
    return { offset: t, transform: `translate3d(${x - width / 2}px, ${y - height / 2}px, 0) rotate(${angle}deg) scale(${scale})`, opacity: t ? 1 : 0 };
  });
  return { frames, duration: clamp(475 + distance * .22, 500, 680) };
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

function FlyingCard({ flight, scope, meId, face, Face, done }) {
  const element = useRef(null), turner = useRef(null);
  const { key, move, delay, arrivals, count } = flight;
  const outgoing = belongsTo(move.from, meId), incoming = belongsTo(move.to, meId);
  const reveal = face && incoming && (move.from.kind === "player" || move.kind === "development");
  const cover = face && move.to.kind === "player" && !incoming;

  useLayoutEffect(() => {
    const root = scope.current, node = element.current;
    const reserved = arrivals.map(id => find(root, "card", id)).filter(Boolean);
    for (const card of reserved) {
      card.dataset.dealPending = key;
      card.dataset.dealAnimated = "";
    }
    const showHand = () => {
      for (const card of reserved) if (card.dataset.dealPending === key) delete card.dataset.dealPending;
    };
    let motion, turn, cancelled = false;
    const finish = () => {
      if (cancelled) return;
      motion?.cancel();
      turn?.cancel();
      showHand();
      done(key);
    };
    const timer = setTimeout(() => {
      const endpoint = (end, local, targetId) => local ? handPoint(root, move, targetId)
        : tablePoint(root, end, move) || point(find(root, "relay", relayKey(end)))
          || point(root.querySelector(".match-drawer-button"));
      const from = endpoint(move.from, outgoing), to = endpoint(move.to, incoming, arrivals[0] || move.cardId);
      if (!from || !to || !node?.animate) return finish();
      const width = (incoming ? to.width : outgoing ? from.width : null) || 72;
      const height = (incoming ? to.height : outgoing ? from.height : null) || width * 1.34;
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      const { frames, duration } = flightPath(from, to, width, height, outgoing, incoming);
      motion = node.animate(frames, { duration, fill: "both", easing: "cubic-bezier(.28,.56,.33,1)" });
      if (reveal || cover) {
        const front = "rotateY(0deg)", back = "rotateY(180deg)";
        turn = turner.current.animate(reveal
          ? [{ transform: back }, { transform: back, offset: .16 }, { transform: front, offset: .47 }, { transform: front }]
          : [{ transform: front }, { transform: front, offset: .58 }, { transform: back, offset: .93 }, { transform: back }],
        { duration, fill: "both", easing: "ease-in-out" });
      }
      motion.finished.then(finish, () => {});
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); motion?.cancel(); turn?.cancel(); showHand(); };
  }, [scope, key, move, delay, arrivals, incoming, outgoing, reveal, cover, done]);

  return <span className="deal-flying-card" ref={element}>
    {face ? <span className="deal-card-turner" ref={turner}>
      <span className="deal-card-plane"><Face card={face} kind={move.kind} /></span>
      <span className="deal-card-plane deal-reverse"><CardBack kind={move.kind} /></span>
    </span> : <CardBack kind={move.kind} />}
    {count > 1 && <span className="deal-bundle-count">×{count}</span>}
  </span>;
}

export function CardDealLayer({ scope, matchId, stream, game, me, resourceMeta, developmentMeta, Face = TravelFace, rollDelay = 0 }) {
  const cursor = useRef(null);
  const relayRack = useRef(null);
  const [{ flights, relays }, setQueue] = useState(emptyQueue);
  const done = useCallback(key => setQueue(current => {
    const flights = current.flights.filter(flight => flight.key !== key);
    return flights.length ? { ...current, flights } : emptyQueue;
  }), []);

  useLayoutEffect(() => {
    const previous = cursor.current;
    const history = game.cardDeals ?? [];
    const id = history.at(-1)?.id ?? 0;
    cursor.current = { id, matchId, stream, me };
    if (!previous || previous.matchId !== matchId || previous.stream !== stream || previous.id > id) {
      setQueue(emptyQueue);
      return;
    }
    if (id === previous.id || document.hidden || matchMedia(reducedMotion).matches) return;
    const next = planFlights(history.filter(deal => deal.id > previous.id), previous.me, me, scope.current, rollDelay);
    if (next.length) setQueue(current => {
      // Keep fallback anchors in place until the whole queue has landed.
      const relays = new Map(current.relays);
      for (const flight of next) for (const end of flight.relays) relays.set(relayKey(end), { end, kind: flight.move.kind });
      return { flights: [...current.flights, ...next], relays };
    });
  }, [scope, game.cardDeals, matchId, stream, me, rollDelay]);

  useLayoutEffect(() => {
    if (!relayRack.current) return;
    const boardTop = scope.current.querySelector(".game-board")?.getBoundingClientRect().top;
    relayRack.current.style.top = `${Math.max(8, (boardTop || 0) + 8)}px`;
  }, [flights, scope]);

  useEffect(() => {
    const cancel = () => setQueue(emptyQueue);
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

  if (!flights.length) return null;
  return <div className="deal-layer" aria-hidden="true">
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
      return <FlyingCard key={flight.key} flight={flight} scope={scope} meId={me.id} face={face} Face={Face} done={done} />;
    })}
  </div>;
}
