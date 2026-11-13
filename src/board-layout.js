export const HOME_CAMERA = { x: 0, y: 0, zoom: 1 };
const ART_TERRAINS = new Set(["wood", "brick", "wool", "wheat", "ore"]);

// Use match data instead of Math.random so all players see the same artwork.
function artRandom(seed) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function terrainVariants(hexes, seed) {
  const variants = {};
  for (const terrain of ART_TERRAINS) {
    const random = artRandom(`${seed}:${terrain}`);
    const tiles = hexes.filter((tile) => tile.terrain === terrain);
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const repeatStart = Math.floor(random() * order.length);
    tiles.forEach((tile, index) => {
      variants[tile.id] = index < order.length ? order[index] : order[(repeatStart + index - order.length) % order.length];
    });
  }
  return variants;
}

export const productionPips = (number) => 6 - Math.abs(7 - number);

function point(x, y) { return `${x.toFixed(2)},${y.toFixed(2)}`; }
function smoothLoop(points) {
  if (!points.length) return "";
  const middle = (a, b) => point((a.x + b.x) / 2, (a.y + b.y) / 2);
  return `M${middle(points.at(-1), points[0])} ${points.map((p, i) =>
    `Q${point(p.x, p.y)} ${middle(p, points[(i + 1) % points.length])}`).join(" ")}Z`;
}

export function boardScenery(board) {
  // Scenery is static for a match. Keep live buildings out of the cached geometry.
  const vertices = Object.fromEntries(board.vertices.map(({ id, x, y }) => [id, { id, x, y }]));
  const hexes = Object.fromEntries(board.hexes.map((h) => [h.id, h]));
  const polygons = Object.fromEntries(board.hexes.map(h => [h.id,
    h.vertexIds.map(id => `${vertices[id].x},${vertices[id].y}`).join(" ")]));
  const coastal = board.edges.filter((e) => e.hexIds.length === 1);
  const edges = Object.fromEntries(coastal.map((e) => [e.id, e]));
  const coastline = new Map();
  for (const e of coastal) {
    for (const id of [e.a, e.b]) {
      if (!coastline.has(id)) coastline.set(id, []);
      coastline.get(id).push(e);
    }
  }
  const shore = [];
  const sweden = board.map === "sweden";
  const coastDetail = sweden ? [1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8] : [1 / 3, 2 / 3];
  // The beach can describe finer headlands and inlets than the playable hex grid.
  const swedishBeach = (x, y, dx, dy) => {
    const southernTip = Math.max(0, (y - 495) / 105) * Math.max(0, dy) * 15;
    const northernRidge = Math.max(0, (-y - 315) / 285) * Math.max(0, -dx) * 9;
    const inlets = (dx > 0 ? 4.5 : 2.5) * Math.sin(y * .09 + x * .025);
    return 19 + southernTip + northernRidge + inlets + 2 * Math.sin(x * .22 + y * .17);
  };
  const outward = (a, b, tile) => {
    const dx = (a.x + b.x) / 2 - tile.x;
    const dy = (a.y + b.y) / 2 - tile.y;
    const length = Math.hypot(dx, dy);
    return [dx / length, dy / length];
  };
  const visited = new Set();
  let vId = coastal[0]?.a;
  while (vId && visited.size < coastal.length) {
    const next = coastline.get(vId)?.find((e) => !visited.has(e.id));
    if (!next) break;
    visited.add(next.id);
    const nextId = next.a === vId ? next.b : next.a;
    const a = vertices[vId], b = vertices[nextId];
    const tile = hexes[next.hexIds[0]];
    const [dx, dy] = outward(a, b, tile);
    const normals = coastline.get(vId).map((e) => outward(vertices[e.a], vertices[e.b], hexes[e.hexIds[0]]));
    const index = visited.size - 1;
    const corner = sweden ? swedishBeach(a.x, a.y, dx, dy) : 14 + Math.sin(index * 2.18) * 4;
    shore.push({ x: a.x + (normals[0][0] + normals[1][0]) * corner / 2, y: a.y + (normals[0][1] + normals[1][1]) * corner / 2 });
    for (const t of coastDetail) {
      const extent = sweden ? swedishBeach(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, dx, dy)
        : 15 + Math.sin(index * 3.35 + t * 8) * 5 + Math.sin(index * .75) * 4;
      shore.push({ x: a.x + (b.x - a.x) * t + dx * extent, y: a.y + (b.y - a.y) * t + dy * extent });
    }
    vId = nextId;
  }

  const ports = (board.ports || []).flatMap((port, index) => {
    const edge = edges[port.edgeId];
    if (!edge) return [];
    const a = vertices[edge.a], b = vertices[edge.b];
    const [dx, dy] = outward(a, b, hexes[edge.hexIds[0]]);
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const side = index % 2 ? 1 : -1;
    return [{
      ...port, x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI,
      shipX: x + dx * 48 - dy * 17 * side, shipY: y + dy * 48 + dx * 17 * side,
      labelX: x + dx * 66 + dy * 10 * side, labelY: y + dy * 66 - dx * 10 * side,
      side,
    }];
  });

  const xs = board.vertices.map((v) => v.x), ys = board.vertices.map((v) => v.y);
  const left = Math.min(...xs) - 76, right = Math.max(...xs) + 76;
  const top = Math.min(...ys) - 76, bottom = Math.max(...ys) + 76;
  return { vertices, polygons, shore: smoothLoop(shore), ports, bounds: { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top } };
}

export function moveCamera(camera, viewport, { x = 0, y = 0, zoom = camera.zoom, anchorX = viewport.x, anchorY = viewport.y }) {
  const nextZoom = Math.max(.75, Math.min(3.5, zoom));
  const ratio = nextZoom / camera.zoom;
  // Keep the board's center reachable while retaining the point under the pointer on zoom.
  const clampPan = (n, max) => Math.abs(n) < .05 ? 0 : Math.max(-max, Math.min(max, n));
  return {
    x: clampPan((camera.x + viewport.x - anchorX) * ratio + anchorX - viewport.x + x, viewport.width * .62),
    y: clampPan((camera.y + viewport.y - anchorY) * ratio + anchorY - viewport.y + y, viewport.height * .72),
    zoom: nextZoom,
  };
}
