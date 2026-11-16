export const ROAD_WIDTH = 9.3;

const unit = (x, y) => {
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
};
const direction = (a, b) => unit(b.x - a.x, b.y - a.y);
const shift = (p, vector, amount) => ({ x: p.x + vector.x * amount, y: p.y + vector.y * amount });

function splitCurve([a, b, c, d], t) {
  const mix = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const ab = mix(a, b), bc = mix(b, c), cd = mix(c, d);
  const abc = mix(ab, bc), bcd = mix(bc, cd), at = mix(abc, bcd);
  return [[a, ab, abc, at], [at, bcd, cd, d]];
}

export function roadCourse(a, b, owner, startHeading, endHeading) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const normal = { x: -dy / length, y: dx / length };
  const phase = Math.sin((a.x + b.x) * .089 + (a.y + b.y) * .069);
  const bend = (phase < 0 ? -1 : 1) * (14 + 5 * Math.abs(phase));
  const point = (t, offset) => shift({ x: a.x + dx * t, y: a.y + dy * t }, normal, offset);
  // A joined end follows the shared heading; a free end keeps the winding course.
  let segment = [a, startHeading ? shift(a, startHeading, length * .28) : point(.26, bend),
    endHeading ? shift(b, endHeading, length * .28) : point(.74, -bend), b];
  const setback = ({ building }) => building && building.owner !== owner
    ? Math.min(.47, (building.type === "city" ? 28 : 24) / length) : 0;
  const start = setback(a), end = 1 - setback(b);
  if (end < 1) [segment] = splitCurve(segment, end);
  if (start > 0) [, segment] = splitCurve(segment, start / end);
  const [p0, p1, p2, p3] = segment.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`);
  return {
    bed: `M${p0}C${p1} ${p2} ${p3}`,
    pointAt: t => splitCurve(segment, t)[0][3],
  };
}

function junction(links) {
  // At a fork, pick the straightest pair as the through route. Sort to break ties
  // consistently even when a saved board lists its edges in a different order.
  links.sort((a, b) => a.edge.id.localeCompare(b.edge.id));
  let pair, best = Infinity;
  for (let i = 0; i < links.length - 1; i++) {
    for (let j = i + 1; j < links.length; j++) {
      const a = links[i], b = links[j];
      const dot = a.heading.x * b.heading.x + a.heading.y * b.heading.y;
      if (dot < best - 1e-6) { best = dot; pair = [a, b]; }
    }
  }
  const [a, b] = pair;
  const heading = unit(a.heading.x - b.heading.x, a.heading.y - b.heading.y);
  a.heading = heading;
  b.heading = { x: -heading.x, y: -heading.y };
  return heading;
}

const notch = (vertex, outward, verge = ROAD_WIDTH / 2) => ({ point: shift(vertex, outward, verge - .55), outward });

function junctionNotches(vertex, id, links, heading, courses) {
  if (links.length === 2) {
    return [notch(vertex, { x: -heading.y, y: heading.x }), notch(vertex, { x: heading.y, y: -heading.x })];
  }
  // Mark each shared inner corner once. Pairs across the individual arms would
  // make the fork look like an extra road segment between them.
  const angles = links.map(({ edge }) => {
    const point = courses.get(edge.id).pointAt(edge.a === id ? .115 : .885);
    return Math.atan2(point.y - vertex.y, point.x - vertex.x);
  }).sort((a, b) => a - b);
  return angles.map((angle, i) => {
    const next = angles[i + 1] ?? angles[0] + 2 * Math.PI;
    const halfGap = (next - angle) / 2;
    const middle = angle + halfGap;
    const verge = ROAD_WIDTH / (2 * Math.sin(Math.min(halfGap, Math.PI / 2)));
    return notch(vertex, { x: Math.cos(middle), y: Math.sin(middle) }, verge);
  });
}

export function roadLayout(edges, vertices) {
  const byOwner = new Map(), routes = new Map(), approaches = new Map(), courses = new Map();
  for (const edge of edges) {
    if (!edge.owner) continue;
    if (!byOwner.has(edge.owner)) byOwner.set(edge.owner, []);
    byOwner.get(edge.owner).push(edge);
  }
  for (const [owner, owned] of byOwner) {
    const incident = new Map();
    const link = (edge, end, other) => {
      if (!incident.has(end)) incident.set(end, []);
      const entry = { edge, heading: direction(vertices[end], vertices[other]) };
      incident.get(end).push(entry);
      return entry;
    };
    const entries = owned.map(edge => [edge, link(edge, edge.a, edge.b), link(edge, edge.b, edge.a)]);
    const joins = [];
    for (const [id, links] of incident) {
      if (links.length < 2 || vertices[id].building) continue;
      const heading = junction(links);
      joins.push({ id, links, heading });
    }
    const route = entries.map(([edge, a, b]) => {
      const smooth = (id, entry) => incident.get(id).length > 1 && !vertices[id].building ? entry.heading : undefined;
      const course = roadCourse(vertices[edge.a], vertices[edge.b], owner, smooth(edge.a, a), smooth(edge.b, b));
      courses.set(edge.id, course);
      return course;
    });
    for (const [id, links] of incident) {
      if (!approaches.has(id)) approaches.set(id, new Map());
      approaches.get(id).set(owner, links.map(({ edge }) => courses.get(edge.id).bed).join(" "));
    }
    const notches = joins.flatMap(({ id, links, heading }) => junctionNotches(vertices[id], id, links, heading, courses));
    routes.set(owner, { courses: route, notches });
  }
  return { routes, approaches, courses };
}
