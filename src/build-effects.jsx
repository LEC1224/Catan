import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import "./build-effects.css";

export const SETTLEMENT_LANDING_MS = 500;
export const SETTLEMENT_CONTACT_MS = 380;
const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

export function settlementContactDelay() {
  return !matchMedia(REDUCE_MOTION).matches && Element.prototype.animate ? SETTLEMENT_CONTACT_MS : 0;
}

// [x, y, radius, horizontal drift, vertical drift, delay, lifetime] in board units and ms.
const CLOUDS = [
  [-7, 4, 8, -16, -6, 0, 550],
  [6, 3, 7.5, 17, -8, 15, 620],
  [-4, 1, 8, -8, -18, 40, 660],
  [3, 2, 7, 7, -24, 85, 720],
  [0, 5, 9, 2, -11, 0, 620],
];

function newPlacements(before, board, courses) {
  const oldRoads = new Set(before.edges.filter(edge => edge.owner).map(edge => edge.id));
  const oldBuildings = new Map(before.vertices.map(vertex => [vertex.id, vertex.building?.type]));
  const placements = [];
  for (const edge of board.edges) {
    if (!edge.owner || oldRoads.has(edge.id)) continue;
    const { pointAt } = courses.get(edge.id);
    placements.push({
      key: `road:${edge.id}`, kind: "road", delay: 0, size: .62,
      points: [.29, .71].map(pointAt),
    });
  }
  for (const { id, x, y, building } of board.vertices) {
    if (!building || oldBuildings.get(id) === building.type) continue;
    placements.push({
      key: `${building.type}:${id}`, kind: building.type, owner: building.owner, delay: 0,
      size: building.type === "city" ? 1.34 : 1, points: [{ x, y: y + 5 }],
    });
  }
  return placements;
}

function BuildPuff({ impact, pigment, done }) {
  const { key, kind, delay, size, points } = impact;
  useEffect(() => {
    const timeout = setTimeout(() => done(key), delay + 920);
    return () => clearTimeout(timeout);
  }, [key, delay, done]);
  return (
    <g data-build-impact={kind}>
      {points.map(({ x, y }, index) => (
        <g key={index} transform={`translate(${x} ${y}) scale(${size})`}>
          {CLOUDS.map(([ox, oy, r, dx, dy, wait, lifetime], cloud) => (
            <g key={cloud} transform={`translate(${ox} ${oy})`}>
              <circle className="build-dust-cloud" r={r} fill={`url(#${pigment})`} style={{
                "--dust-x": `${dx}px`, "--dust-y": `${dy}px`,
                "--dust-delay": `${delay + wait + index * 75}ms`, "--dust-time": `${lifetime}ms`,
              }} />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

export function BuildDust({ board, courses, stream, meId }) {
  const previous = useRef(null);
  const pigment = useId();
  const [impacts, setImpacts] = useState([]);
  const done = useCallback(key => setImpacts(current => current.filter(impact => impact.key !== key)), []);

  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { board, stream };
    // Loading a board, reconnecting, and seeking a replay never kick up old dust.
    if (stream == null || last?.stream !== stream) {
      setImpacts(current => current.length ? [] : current);
      return;
    }
    if (last.board === board || document.hidden || matchMedia(REDUCE_MOTION).matches) return;
    const next = newPlacements(last.board, board, courses);
    for (const impact of next) {
      if (impact.kind === "settlement" && impact.owner === meId) impact.delay = settlementContactDelay();
    }
    if (next.length) setImpacts(current => [...current, ...next]);
  }, [board, courses, stream, meId]);

  if (!impacts.length) return null;
  return (
    <g className="build-dust-layer" pointerEvents="none" aria-hidden="true">
      <defs>
        <radialGradient id={pigment}>
          <stop stopColor="#f7e6c7" stopOpacity=".91" />
          <stop offset=".43" stopColor="#d7bfa0" stopOpacity=".68" />
          <stop offset=".79" stopColor="#b49d7e" stopOpacity=".29" />
          <stop offset="1" stopColor="#b49d7e" stopOpacity="0" />
        </radialGradient>
      </defs>
      {impacts.map(impact => <BuildPuff key={impact.key} impact={impact} pigment={pigment} done={done} />)}
    </g>
  );
}
