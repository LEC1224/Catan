import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Anchor, Minus, Plus, RotateCcw } from "lucide-react";
import { boardScenery, HOME_CAMERA, moveCamera, productionPips, terrainVariants } from "./board-layout.js";
import { BuildPreview, CityUpgradePreview } from "./build-preview.jsx";
import { RobberHexMark } from "./robber-guide.jsx";
import { robberPlacement, ROBBER_TILE_HINTS } from "./robber-placements.js";

const DIMENSIONS = { x: 400, y: 280, width: 800, height: 560, fullWidth: 800, fullHeight: 560 };
const OCEAN_TILE_WIDTH = 1536, OCEAN_TILE_HEIGHT = 1024;
const OCEAN_BLEED = 8; // World units beyond the viewport for the animated drift.
const ROOFS = {
  settlement: "M145 390 244 262 266 242 272 246 375 206 456 155 485 156 588 349 575 378 367 466 269 294 168 413 145 418Z",
  city: "M849 219 883 194 910 155 928 179 965 207 961 235 895 246Z M839 315 1015 258 1065 256 1098 321 1075 347 950 381Z M1209 200 1249 185 1280 228 1255 255 1221 245Z M1183 323 1242 268 1290 262 1346 304 1312 356 1211 348Z M1115 405 1169 341 1234 357 1270 406 1223 442 1151 441Z M1284 402 1353 365 1383 391 1362 425 1327 431Z M784 425 825 381 932 409 957 437 930 453 875 469Z M986 459 1018 406 1149 405 1165 448 1147 479 1012 475Z M901 528 929 486 998 516 978 551Z M1193 522 1243 472 1303 460 1327 495 1254 540Z",
};

function activateOnKey(event, action) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function roofMatrix(color) {
  const rgb = (color?.match(/^#[0-9a-f]{6}$/i) ? color : "#b77d56").slice(1).match(/../g);
  return rgb.map((channel) => `.19 .60 .07 0 ${((parseInt(channel, 16) / 255 - .5) * .78 + .055).toFixed(3)}`).join(" ") +
    " 4.4 -4.2 0 0 -.25";
}

function Building({ type, color, filter, clip, x, y }) {
  const city = type === "city", size = city ? 51 : 41;
  return (
    <g pointerEvents="none" transform={`translate(${x},${y})`}>
      <ellipse cy="6" rx={city ? 17 : 13} ry="6" fill="#101e16" opacity=".55" />
      <ellipse cy="5" rx={city ? 15 : 11.5} ry="4.6" fill="#2c342b" stroke={color} strokeWidth="2" />
      <svg x={-size / 2} y={-size + 10} width={size} height={size} viewBox={`${city ? 724 : 0} 0 724 724`}>
        <image href="/assets/pieces-atlas.png" width="2172" height="724" />
        <g clipPath={`url(#${clip})`}>
          <image href="/assets/pieces-atlas.png" width="2172" height="724" filter={`url(#${filter})`} />
        </g>
      </svg>
    </g>
  );
}

function Road({ a, b, color }) {
  return (
    <g pointerEvents="none" strokeLinecap="round">
      <line x1={a.x} y1={a.y + 2} x2={b.x} y2={b.y + 2} stroke="#172c22" strokeWidth="9" opacity=".58" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#eadbb3" strokeWidth="8.5" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="5.5" />
    </g>
  );
}

function Coast({ shore, ids }) {
  return (
    <g className="island-coast" aria-hidden="true" pointerEvents="none">
      <path d={shore} fill="#17342e" stroke="#5b9c91" strokeWidth="63" strokeOpacity=".22" filter={`url(#${ids}-shoals)`} />
      <path d={shore} fill="#4e8b7d" stroke="#5eaa99" strokeWidth="30" strokeOpacity=".36" filter={`url(#${ids}-shore-warp)`} />
      <path className="shore-breakers" d={shore} fill="none" stroke="#c0d4b7" strokeWidth="16" strokeOpacity=".36" strokeDasharray="31 8 11 21 53 5" filter={`url(#${ids}-shore-warp)`} />
      <path d={shore} fill="#b99261" stroke="#ead1a0" strokeWidth="4" filter={`url(#${ids}-shore-warp)`} />
      <path d={shore} fill={`url(#${ids}-sand)`} opacity=".55" />
      <path d={shore} fill="none" stroke="#f1e5c1" strokeWidth="1.6" strokeOpacity=".71" strokeDasharray="7 5 16 8 24 13" filter={`url(#${ids}-shore-warp)`} />
    </g>
  );
}

function Harbor({ port, resourceMeta }) {
  const any = port.type === "any";
  const Icon = any ? Anchor : resourceMeta[port.type].icon;
  const description = any ? "Any resource port, 3:1" : `${resourceMeta[port.type].name} port, 2:1`;
  return (
    <g className="map-harbor" role="img" aria-label={description}>
      <title>{description}</title>
      <g transform={`translate(${port.x},${port.y}) rotate(${port.angle})`} aria-hidden="true">
        <path d="M0-25Q8-13 17 0M0 25Q8 13 17 0" fill="none" stroke="#775d42" strokeWidth="5" strokeLinecap="round" />
        <path d="M0-25Q8-13 17 0M0 25Q8 13 17 0" fill="none" stroke="#c6ab79" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M10 2H47M45-14V15" fill="none" stroke="#13332d" strokeWidth="13" strokeLinecap="round" opacity=".65" />
        <path d="M10 0H45M44-14V14" fill="none" stroke="#68452e" strokeWidth="11" strokeLinecap="round" />
        <path d="M10 0H44M44-14V14" fill="none" stroke="#c6a572" strokeWidth="8" strokeLinecap="round" />
        <path d="M10 0H44M44-14V14" fill="none" stroke="#775438" strokeWidth="7" strokeDasharray=".8 2.8" />
        <circle cx="45" cy="-15" r="2" fill="#e1c08a" />
        <circle cx="45" cy="15" r="2" fill="#e1c08a" />
      </g>
      <g transform={`translate(${port.shipX},${port.shipY}) rotate(${port.side * 13})`} aria-hidden="true">
        <ellipse cx="-3" cy="12" rx="24" ry="10" fill="#163e3a" opacity=".38" />
        <path d="M-24 12q12 9 25 5m-19-1q9 6 18 5" fill="none" stroke="#a4cec0" strokeWidth="1" opacity=".5" />
        <image href="/assets/port-sloop.webp" x="-26" y="-33" width="52" height="52" />
      </g>
      <g className="port-sign" transform={`translate(${port.labelX},${port.labelY})`} aria-hidden="true">
        <rect x="-24" y="-10" width="48" height="20" rx="4" fill="#173c39" stroke="#c5af7f" strokeWidth=".95" />
        <g transform="translate(-19,-6.5)" color="#efdba3"><Icon size={13} strokeWidth={2.1} /></g>
        <text x="9" y="4.2" textAnchor="middle" fill="#fff0cb" fontSize="12" fontWeight="700">{any ? "3:1" : "2:1"}</text>
      </g>
    </g>
  );
}

function NumberToken({ hex, blocked }) {
  const pips = productionPips(hex.number);
  const radius = 10.8 + pips * 1.85;
  const red = pips === 5;
  return (
    <g transform={`translate(${hex.x},${hex.y + 1})`} opacity={blocked ? .8 : 1} pointerEvents="none">
      <circle r={radius + 1} cy="2.4" fill="#202719" opacity=".46" />
      <circle r={radius} fill={red ? "#faebca" : "#eee2c1"} stroke={red ? "#ae6849" : "#a58b59"} strokeWidth="1.4" />
      <circle r={radius - 2.5} fill="none" stroke="#ba9d66" strokeWidth=".65" opacity=".7" />
      <text textAnchor="middle" y={radius * .21} fontFamily="Georgia,serif" fontSize={13 + pips * 1.9} fontWeight="bold" fill={red ? "#ab402a" : "#33372d"}>{hex.number}</text>
      {Array.from({ length: pips }, (_, i) => <circle key={i} cx={(i - (pips - 1) / 2) * 3.1} cy={radius * .58} r={pips === 5 ? 1.15 : 1} fill={red ? "#ac4a31" : "#75694d"} />)}
    </g>
  );
}

function TerrainImage({ h, terrain, variant }) {
  const alternate = variant > 0;
  const index = alternate ? variant - 1 : terrain.tile;
  const cols = alternate ? 2 : 3;
  return (
    <svg x={h.x - 60} y={h.y - 60} width="120" height="120" viewBox={`${(index % cols) * 512} ${Math.floor(index / cols) * 512} 512 512`}>
      <image href={alternate ? `/assets/terrain-${h.terrain}-variants.webp` : "/assets/terrain-atlas.png"} width={cols * 512} height="1024" />
    </svg>
  );
}

function BoardScene({ game, meId, mode, canBuild, busy, onAction, resourceMeta, scenery, variants }) {
  const ids = useId();
  const { vertices, shore, ports } = scenery;
  const { hexes, edges } = game.board;
  const colors = Object.fromEntries(game.players.map((p, i) => [p.id, { color: p.color, filter: `${ids}-roof-${i}` }]));
  const isActive = game.activePlayerId === meId, legal = game.legal || {};
  const previewBuilds = !mode && !busy;
  const previewRoads = previewBuilds && canBuild.road;
  const previewSettlements = previewBuilds && canBuild.settlement;
  const previewCities = previewBuilds && canBuild.city;
  const settlements = new Set(isActive && (game.phase === "setupSettlement" || mode === "settlement" || previewSettlements) ? legal.settlements : []);
  const roads = new Set(isActive && (game.phase === "setupRoad" || game.roadBuildingRemaining || mode === "road" || previewRoads) ? legal.roads : []);
  const cities = new Set(isActive && (mode === "city" || previewCities) ? legal.cities : []);
  const robber = robberPlacement(game, meId);
  const points = (h) => h.vertexIds.map((id) => `${vertices[id].x},${vertices[id].y}`).join(" ");
  return (
    <>
      <defs>
        <filter id={`${ids}-shoals`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id={`${ids}-shore-warp`} x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".058 .081" numOctaves="2" seed="13" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <pattern id={`${ids}-sand`} patternUnits="userSpaceOnUse" width="84" height="84">
          <svg width="84" height="84" viewBox="1092 582 340 340"><image href="/assets/terrain-atlas.png" width="1536" height="1024" /></svg>
        </pattern>
        {hexes.map((h) => <clipPath key={h.id} id={`${ids}-${h.id}`}><polygon points={points(h)} /></clipPath>)}
        {Object.entries(ROOFS).map(([type, d]) => <clipPath key={type} id={`${ids}-shape-${type}`}><path d={d} /></clipPath>)}
        {Object.values(colors).map(({ filter, color }) => (
          <filter key={filter} id={filter} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={roofMatrix(color)} result="tinted" />
            <feComposite in="tinted" in2="SourceAlpha" operator="in" />
          </filter>
        ))}
      </defs>
      <Coast shore={shore} ids={ids} />
      {hexes.map((h) => {
        const terrain = resourceMeta[h.terrain];
        const state = robber?.state(h.id), selectable = state === "destination", blocked = game.robberHexId === h.id;
        const hint = ROBBER_TILE_HINTS[state];
        const choose = () => onAction("moveRobber", { hexId: h.id });
        const polygon = points(h);
        return (
          <g key={h.id} className={selectable ? "hex-selectable" : undefined} role={selectable ? "button" : state ? "img" : undefined}
            data-robber-state={state} tabIndex={selectable ? 0 : undefined}
            aria-label={`${terrain.name}${h.number ? ` ${h.number}` : ""}${hint ? `, ${hint}` : ""}`}
            onClick={selectable ? choose : undefined} onKeyDown={selectable ? (event) => activateOnKey(event, choose) : undefined}>
            {hint && !selectable && <title>{hint}</title>}
            <polygon points={polygon} fill={terrain.color} />
            <g clipPath={`url(#${ids}-${h.id})`}><TerrainImage h={h} terrain={terrain} variant={variants[h.id] || 0} /></g>
            <polygon points={polygon} fill="none" stroke="#e0cda1" strokeOpacity=".7" strokeWidth="1.65" pointerEvents="none" />
            <polygon points={polygon} className="deal-tile-cue" data-deal-tile={h.id} aria-hidden="true" />
            <RobberHexMark state={state} points={polygon} x={h.x} y={h.y} />
            {h.number && <NumberToken hex={h} blocked={blocked} />}
            {blocked && (
              <g transform={`translate(${h.x + (h.number ? 24 : 0)},${h.y - (h.number ? 17 : 3)})`} pointerEvents="none">
                <ellipse cy="16" rx="13" ry="5" fill="#092522" opacity=".5" />
                <svg x="-23" y="-28" width="46" height="46" viewBox="1448 0 724 724"><image href="/assets/pieces-atlas.png" width="2172" height="724" /></svg>
              </g>
            )}
          </g>
        );
      })}
      {ports.map((port) => <Harbor key={port.id} port={port} resourceMeta={resourceMeta} />)}
      {edges.filter((e) => e.owner).map((e) => <Road key={e.id} a={vertices[e.a]} b={vertices[e.b]} color={colors[e.owner]?.color} />)}
      {edges.filter((e) => roads.has(e.id)).map((e) => {
        const a = vertices[e.a], b = vertices[e.b], choose = () => onAction("placeRoad", { edgeId: e.id });
        if (previewRoads) {
          // Leave room at either end for settlement targets and neighboring roads.
          const dx = (b.x - a.x) / 6, dy = (b.y - a.y) / 6;
          return (
            <BuildPreview key={e.id} onBuild={choose} hit={
              <line x1={a.x + dx} y1={a.y + dy} x2={b.x - dx} y2={b.y - dy} stroke="transparent" strokeWidth="24" />
            }>
              <Road a={a} b={b} color={colors[meId].color} />
            </BuildPreview>
          );
        }
        return (
          <g key={e.id} className="road-target" role="button" tabIndex="0" aria-label={`Build road ${e.id}`} onClick={choose} onKeyDown={(event) => activateOnKey(event, choose)}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffe2a0" strokeWidth="5" strokeDasharray="5 5" strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="22" />
            <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="11" fill="transparent" />
          </g>
        );
      })}
      {game.board.vertices.filter((v) => v.building).map((v) => {
        const { type, owner } = v.building, selectable = cities.has(v.id);
        const choose = () => onAction("upgradeCity", { vertexId: v.id });
        const { color, filter } = colors[owner] || {};
        const renderPiece = (kind) => (
          <Building type={kind} color={color} filter={filter} clip={`${ids}-shape-${kind}`} x={v.x} y={v.y} />
        );
        if (selectable && previewCities) {
          return <CityUpgradePreview key={v.id} x={v.x} y={v.y} onBuild={choose} renderPiece={renderPiece} />;
        }
        return (
          <g key={v.id} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} className={selectable ? "city-target" : ""}
            aria-label={selectable ? `Upgrade settlement ${v.id}` : undefined} onClick={selectable ? choose : undefined} onKeyDown={selectable ? (event) => activateOnKey(event, choose) : undefined}>
            {selectable && <circle cx={v.x} cy={v.y} r="21" fill="#f5d58b" fillOpacity=".3" stroke="#ffe3a5" strokeDasharray="4 3" />}
            {renderPiece(type)}
          </g>
        );
      })}
      {game.board.vertices.filter((v) => settlements.has(v.id)).map((v) => {
        const choose = () => onAction("placeSettlement", { vertexId: v.id });
        if (previewSettlements) {
          const { color, filter } = colors[meId];
          return (
            <BuildPreview key={v.id} onBuild={choose} hit={<circle cx={v.x} cy={v.y} r="15" fill="transparent" />}>
              <Building type="settlement" color={color} filter={filter} clip={`${ids}-shape-settlement`} x={v.x} y={v.y} />
            </BuildPreview>
          );
        }
        return (
          <g key={v.id} className="settlement-target" role="button" tabIndex="0" aria-label={`Build settlement ${v.id}`} onClick={choose} onKeyDown={(event) => activateOnKey(event, choose)}>
            <circle cx={v.x} cy={v.y} r="9.5" fill="#fff0bd" stroke="#8b6c35" strokeWidth="1.8" />
            <path d={`M${v.x - 3.5},${v.y}h7 M${v.x},${v.y - 3.5}v7`} stroke="#596645" strokeWidth="1.5" />
          </g>
        );
      })}
    </>
  );
}

function BoardOcean({ viewport, viewBox, worldTransform, x, y, scale }) {
  const tileId = useId();
  const left = -x / scale - OCEAN_BLEED, right = (viewport.fullWidth - x) / scale + OCEAN_BLEED;
  const top = -y / scale - OCEAN_BLEED, bottom = (viewport.fullHeight - y) / scale + OCEAN_BLEED;
  const tiles = [];
  // Mirror neighboring copies so the painted edges meet at every zoom level.
  for (let row = Math.floor(top / OCEAN_TILE_HEIGHT + .5); row <= Math.floor(bottom / OCEAN_TILE_HEIGHT + .5); row++) {
    for (let col = Math.floor(left / OCEAN_TILE_WIDTH + .5); col <= Math.floor(right / OCEAN_TILE_WIDTH + .5); col++) {
      tiles.push(<use key={`${col},${row}`} href={`#${tileId}`}
        transform={`translate(${col * OCEAN_TILE_WIDTH},${row * OCEAN_TILE_HEIGHT}) scale(${col % 2 ? -1 : 1},${row % 2 ? -1 : 1})`} />);
    }
  }
  return (
    <svg className="map-ocean" viewBox={viewBox} aria-hidden="true" focusable="false">
      <defs>
        <image id={tileId} href="/assets/ocean-surface.webp" x={-OCEAN_TILE_WIDTH / 2} y={-OCEAN_TILE_HEIGHT / 2}
          width={OCEAN_TILE_WIDTH} height={OCEAN_TILE_HEIGHT} />
      </defs>
      <g transform={worldTransform}><g className="ocean-surface">{tiles}</g></g>
    </svg>
  );
}

function BoardCamera({ bounds, seed, children }) {
  const svg = useRef(null), fit = useRef(null), plus = useRef(null);
  const [viewport, setViewport] = useState(DIMENSIONS);
  const [camera, setCamera] = useState(HOME_CAMERA);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map()), dragged = useRef(false);
  const altered = camera.x !== 0 || camera.y !== 0 || camera.zoom !== 1;

  useLayoutEffect(() => {
    const surface = svg.current, target = fit.current;
    const measure = () => {
      const { width, height, left, top } = surface.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      if (!width || !height) return;
      const next = { fullWidth: width, fullHeight: height, width: r.width, height: r.height,
        x: r.left - left + r.width / 2, y: r.top - top + r.height / 2 };
      setViewport((prev) => Object.keys(next).every((key) => next[key] === prev[key]) ? prev : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const surface = svg.current;
    const wheel = (event) => {
      event.preventDefault();
      const r = surface.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 120 : 1);
      const factor = Math.exp(-Math.max(-150, Math.min(150, delta)) * .0022);
      setCamera((prev) => moveCamera(prev, viewport, { zoom: prev.zoom * factor, anchorX: event.clientX - r.left, anchorY: event.clientY - r.top }));
    };
    surface.addEventListener("wheel", wheel, { passive: false });
    return () => surface.removeEventListener("wheel", wheel);
  }, [viewport]);

  const zoom = (factor) => setCamera((prev) => moveCamera(prev, viewport, { zoom: prev.zoom * factor }));
  function pointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!pointers.current.size) dragged.current = false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1) {
      dragged.current = true;
      setDragging(true);
      for (const id of pointers.current.keys()) event.currentTarget.setPointerCapture(id);
    }
  }
  function pointerMove(event) {
    const p = pointers.current.get(event.pointerId);
    if (!p) return;
    const x = event.clientX, y = event.clientY;
    if (!dragged.current && Math.hypot(x - p.x, y - p.y) < 5) return;
    if (!dragged.current) {
      dragged.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    pointers.current.set(event.pointerId, { x, y });
    if (!other) {
      setCamera((prev) => moveCamera(prev, viewport, { x: x - p.x, y: y - p.y }));
      return;
    }
    const r = event.currentTarget.getBoundingClientRect();
    const factor = Math.hypot(x - other.x, y - other.y) / Math.max(1, Math.hypot(p.x - other.x, p.y - other.y));
    setCamera((prev) => moveCamera(prev, viewport, {
      x: (x - p.x) / 2, y: (y - p.y) / 2, zoom: prev.zoom * factor,
      anchorX: (p.x + other.x) / 2 - r.left, anchorY: (p.y + other.y) / 2 - r.top,
    }));
  }
  function pointerEnd(event) {
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) setDragging(false);
  }
  function boardKeys(event) {
    if (event.target !== event.currentTarget) return;
    const nudge = { ArrowLeft: [32, 0], ArrowRight: [-32, 0], ArrowUp: [0, 32], ArrowDown: [0, -32] }[event.key];
    if (nudge) {
      event.preventDefault();
      setCamera((prev) => moveCamera(prev, viewport, { x: nudge[0], y: nudge[1] }));
    } else if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") setCamera(HOME_CAMERA);
      else zoom(event.key === "-" ? 1 / 1.2 : 1.2);
    }
  }
  const scale = Math.max(.05, Math.min(viewport.width / bounds.width, viewport.height / bounds.height) * camera.zoom);
  const x = viewport.x + camera.x - bounds.x * scale, y = viewport.y + camera.y - bounds.y * scale;
  const viewBox = `0 0 ${viewport.fullWidth} ${viewport.fullHeight}`;
  const worldTransform = `translate(${x},${y}) scale(${scale})`;
  return (
    <div className="board-frame">
      <div className="map-fit" ref={fit} aria-hidden="true" />
      <BoardOcean viewport={viewport} viewBox={viewBox} worldTransform={worldTransform} x={x} y={y} scale={scale} />
      <svg ref={svg} className={`game-board${dragging ? " dragging" : ""}`} viewBox={viewBox}
        tabIndex="0" aria-label="Interactive Catan board" aria-description="Drag or use arrow keys to pan. Scroll, pinch, or use plus and minus to zoom."
        onKeyDown={boardKeys} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
        onLostPointerCapture={(event) => { if (event.target === event.currentTarget) pointerEnd(event); }}
        onPointerLeave={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) pointerEnd(event); }}
        onClickCapture={(event) => { if (dragged.current && event.detail) { event.preventDefault(); event.stopPropagation(); dragged.current = false; } }}>
        <g className="map-world" transform={worldTransform}>
          {children}
        </g>
      </svg>
      <div className="map-controls" role="group" aria-label="Board view">
        <button type="button" className="match-command" ref={plus} aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)} disabled={camera.zoom >= 3.5}><Plus size={17} /></button>
        <button type="button" className="match-command" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / 1.25)} disabled={camera.zoom <= .75}><Minus size={17} /></button>
        {altered && <button type="button" className="match-command reset-view" title="Reset view" onClick={() => { setCamera(HOME_CAMERA); plus.current?.focus(); }}><RotateCcw size={15} /> <span>Reset view</span></button>}
      </div>
      {seed && <span className="board-caption">Seed: {seed}</span>}
    </div>
  );
}

export function Board({ game, matchId, meId, mode, canBuild, busy, onAction, resourceMeta }) {
  const scenery = useMemo(() => boardScenery(game.board), [game.board]);
  const artSeed = game.settings.seed || matchId || game.board.hexes.map((h) => `${h.terrain}:${h.number}`).join("/");
  const variants = useMemo(() => terrainVariants(game.board.hexes, artSeed), [game.board.hexes, artSeed]);
  return (
    <BoardCamera bounds={scenery.bounds} seed={game.settings.seed}>
      <BoardScene game={game} meId={meId} mode={mode} canBuild={canBuild} busy={busy}
        onAction={onAction} resourceMeta={resourceMeta} scenery={scenery} variants={variants} />
    </BoardCamera>
  );
}
