import { useEffect, useLayoutEffect, useRef } from "react";

const motionQuery = "(prefers-reduced-motion: reduce)";
const faceOf = element => element?.querySelector(".card-face, .draft-face");

function pose(element) {
  const rect = element?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return null;
  const transform = getComputedStyle(element).transform;
  const matrix = transform !== "none" ? new DOMMatrixReadOnly(transform) : null;
  return {
    x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
    w: element.offsetWidth * (matrix ? Math.hypot(matrix.a, matrix.b) : 1),
    h: element.offsetHeight * (matrix ? Math.hypot(matrix.c, matrix.d) : 1),
    angle: matrix ? Math.atan2(matrix.b, matrix.a) * 180 / Math.PI : 0,
  };
}

function reveal(element) {
  const scroller = element.closest(".fan-viewport, .draft-card-row");
  if (!scroller) return;
  const card = (faceOf(element) || element).getBoundingClientRect();
  const bounds = scroller.getBoundingClientRect();
  if (card.right > bounds.right) scroller.scrollLeft += card.right - bounds.right + 3;
  else if (card.left < bounds.left) scroller.scrollLeft += card.left - bounds.left - 3;
}

export function useDraftFlights(workspace, layer, mode) {
  const pending = useRef([]);
  const active = useRef(new Map());
  const cancelAll = () => {
    for (const move of active.current.values()) move.finish();
  };

  useEffect(() => {
    const motion = matchMedia(motionQuery);
    const onHide = () => { if (document.hidden) cancelAll(); };
    motion.addEventListener("change", cancelAll);
    window.addEventListener("resize", cancelAll);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAll();
      motion.removeEventListener("change", cancelAll);
      window.removeEventListener("resize", cancelAll);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!mode) cancelAll();
    const plans = pending.current.splice(0);
    for (const { from, id, to, toId, keyboard, refocus } of plans) {
      const root = workspace.current;
      const target = root?.querySelector(`[data-draft-zone="${to}"] [data-draft-id="${CSS.escape(toId)}"]`);
      const face = faceOf(target);
      if (!face || !layer.current) continue;
      if (to !== "picker") reveal(target);
      if (to === "hand") face.dataset.draftReturned = "";
      if (keyboard && refocus) {
        const hand = root.querySelector('[data-draft-zone="hand"] button[data-draft-id]:not([aria-disabled="true"]):not(:disabled)');
        const confirm = root.querySelector("[data-draft-confirm]:not(:disabled)");
        const next = to === "give" ? hand || confirm || target : target;
        next.focus({ preventScroll: true });
      }
      if (!from || !face.animate || matchMedia(motionQuery).matches || document.hidden) continue;
      const end = pose(face);
      if (!end) continue;
      const w = face.offsetWidth, h = face.offsetHeight;
      const node = document.createElement("span");
      node.className = "draft-flight draft-card-shell";
      if (to === "hand") node.dataset.handSize = "";
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
      const copy = face.cloneNode(true);
      copy.classList.remove("fan-face");
      for (const attr of [...copy.attributes]) if (attr.name.startsWith("data-")) copy.removeAttribute(attr.name);
      node.append(copy);
      layer.current.append(node);
      if (to !== "picker") face.dataset.draftInFlight = "";
      const dx = end.x - from.x, dy = end.y - from.y;
      const distance = Math.hypot(dx, dy), bend = Math.min(36, distance * .18);
      const frames = [0, .35, .72, 1].map(t => {
        const arc = Math.sin(Math.PI * t);
        const x = from.x + dx * t - Math.sign(dy) * bend * arc;
        const y = from.y + dy * t - 14 * arc;
        const angle = from.angle + (end.angle - from.angle) * t + (dy < 0 ? 8 : -8) * arc;
        const sx = (from.w + (end.w - from.w) * t) / w;
        const sy = (from.h + (end.h - from.h) * t) / h;
        return { offset: t, transform: `translate3d(${x - w / 2}px, ${y - h / 2}px, 0) rotate(${angle}deg) scale(${sx}, ${sy})` };
      });
      const flight = node.animate(frames, { duration: Math.min(420, 275 + distance * .38), easing: "cubic-bezier(.18,.58,.26,1)", fill: "both" });
      const finish = () => {
        if (active.current.get(id)?.node !== node) return;
        active.current.delete(id);
        flight.cancel();
        node.remove();
        delete face.dataset.draftInFlight;
      };
      active.current.set(id, { node, finish });
      flight.finished.then(finish, finish);
    }
  });

  return (event, id, to, { toId = id, refocus = true } = {}) => {
    const existing = active.current.get(id);
    const from = pose(existing?.node || faceOf(event.currentTarget));
    existing?.finish();
    pending.current.push({ from, id, to, toId, keyboard: event.detail === 0, refocus });
  };
}
