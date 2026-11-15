import React from "react";

const APRON_FILL = "#c1a176";
const ROAD_WIDTH = 10.2;
const ROAD_EDGE_WIDTH = 12.6;

export function RoadGravel({ id }) {
  return (
    <pattern id={id} width="13" height="11" patternUnits="userSpaceOnUse">
      <path d="M1 2l1.8-.6.9 1.2-2 .8ZM7 7l1.3-.9 1.2.8-1.7.9ZM4 10l1.1-.7.8.6-1 .6Z" fill="#6b5036" opacity=".7" />
      <path d="M9.4 1.9l1.9.5-.5 1-1.6-.6ZM4.2 5.5l1.8-.6.5.9-1.7.6ZM11 9.8l1.4-.4v1.1l-1.6.3Z" fill="#f0d5a5" opacity=".8" />
    </pattern>
  );
}

function splitCurve([a, b, c, d], t) {
  const mix = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const ab = mix(a, b), bc = mix(b, c), cd = mix(c, d);
  const abc = mix(ab, bc), bcd = mix(bc, cd), at = mix(abc, bcd);
  return [[a, ab, abc, at], [at, bcd, cd, d]];
}

export function roadCourse(a, b, owner) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const nx = -dy / length, ny = dx / length;
  // Opposing bends give each stretch a slight S while keeping both corners fixed.
  const phase = Math.sin((a.x + b.x) * .089 + (a.y + b.y) * .069);
  const bend = (phase < 0 ? -1 : 1) * (14 + 5 * Math.abs(phase));
  const point = (t, offset) => ({ x: a.x + dx * t + nx * offset, y: a.y + dy * t + ny * offset });
  let segment = [a, point(.26, bend), point(.74, -bend), b];
  // Stop at another player's piece so its own road can reach the corner unobstructed.
  const setback = ({ building }) => building && building.owner !== owner
    ? Math.min(.47, (building.type === "city" ? 28 : 24) / length) : 0;
  const start = setback(a), end = 1 - setback(b);
  if (end < 1) [segment] = splitCurve(segment, end);
  if (start > 0) [, segment] = splitCurve(segment, start / end);
  const curve = (offset = 0) => {
    const [p0, p1, p2, p3] = segment.map(({ x, y }) => `${(x + nx * offset).toFixed(2)},${(y + ny * offset).toFixed(2)}`);
    return `M${p0}C${p1} ${p2} ${p3}`;
  };
  return {
    bed: curve(),
    ruts: [-1.9, 1.9].map(curve).join(" "),
    pointAt: t => splitCurve(segment, t)[0][3],
  };
}

function RoadSurface({ courses, color, gravel }) {
  const bed = courses.map(course => course.bed).join(" ");
  const ruts = courses.map(course => course.ruts).join(" ");
  return (
    <g className="board-road" fill="none" strokeLinecap="round" pointerEvents="none" aria-hidden="true">
      <path d={bed} stroke="#211b14" strokeWidth={ROAD_EDGE_WIDTH} opacity=".82" transform="translate(0 1.25)" />
      <path d={bed} stroke="#514332" strokeWidth={ROAD_EDGE_WIDTH} />
      <path d={bed} stroke={color || "#bb8b59"} strokeWidth={ROAD_WIDTH} />
      <path d={ruts} stroke="#312518" strokeWidth=".85" opacity=".33" />
      <path d={bed} stroke={`url(#${gravel})`} strokeWidth={ROAD_WIDTH} opacity=".5" />
    </g>
  );
}

export function roadLayout(edges, vertices) {
  const routes = new Map();
  const approaches = new Map();
  for (const { owner, a, b } of edges) {
    if (!owner) continue;
    const course = roadCourse(vertices[a], vertices[b], owner);
    if (!routes.has(owner)) routes.set(owner, []);
    routes.get(owner).push(course);
    for (const end of [a, b]) {
      if (!approaches.has(end)) approaches.set(end, new Map());
      const byOwner = approaches.get(end);
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push(course.bed);
    }
  }
  return { routes, approaches };
}

export function RoadNetwork({ routes, colors, gravel }) {
  // Paint each material pass across the route so adjoining edges share a roadbed.
  return [...routes].map(([owner, courses]) =>
    <RoadSurface key={owner} courses={courses} color={colors[owner]?.color} gravel={gravel} />);
}

export function RoadPreview({ course, color, gravel }) {
  return <RoadSurface courses={[course]} color={color} gravel={gravel} />;
}

export function RoadOpening({ id, approach, x, y }) {
  // The apron and sprite rim share the same cutout. The sprite itself stays whole.
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="-36" y="-52" width="72" height="73">
      <rect x="-36" y="-52" width="72" height="73" fill="white" />
      <path d={approach} transform={`translate(${-x} ${-y})`} fill="none" stroke="black"
        strokeWidth={ROAD_EDGE_WIDTH} strokeLinecap="round" />
    </mask>
  );
}

export function BuildingApron({ gravel, city }) {
  const ground = city
    ? "M-19 0Q-18 -6 -9 -7L10 -6Q19 -6 21 0Q22 7 14 9L-8 11Q-18 10 -21 5Z"
    : "M-13 -2Q-10 -6 -3 -6L10 -5Q15 -3 15 3Q13 8 6 9L-8 8Q-17 7 -16 3Z";
  return (
    <>
      <path d={ground} fill="#242015" opacity=".62" transform="translate(0 2)" />
      <path d={ground} fill={APRON_FILL} stroke="#856949" strokeWidth="1.3" />
      <path d={ground} fill={`url(#${gravel})`} />
    </>
  );
}
