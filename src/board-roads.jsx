import React from "react";

const ROADBED = "#c1a176";

export function RoadGravel({ id }) {
  return (
    <pattern id={id} width="13" height="11" patternUnits="userSpaceOnUse">
      <path d="M1 2l1.8-.6.9 1.2-2 .8ZM7 7l1.3-.9 1.2.8-1.7.9ZM4 10l1.1-.7.8.6-1 .6Z" fill="#6b5036" opacity=".7" />
      <path d="M9.4 1.9l1.9.5-.5 1-1.6-.6ZM4.2 5.5l1.8-.6.5.9-1.7.6ZM11 9.8l1.4-.4v1.1l-1.6.3Z" fill="#f0d5a5" opacity=".8" />
    </pattern>
  );
}

function roadCourse(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const nx = -dy / length, ny = dx / length;
  // A little variation in the track, with its ends fixed to the board corners.
  const bend = Math.sin((a.x + b.x) * .089 + (a.y + b.y) * .069) * 6;
  const point = (t, offset = 0) => `${(a.x + dx * t + nx * offset).toFixed(2)},${(a.y + dy * t + ny * offset).toFixed(2)}`;
  return {
    bed: `M${point(0)}Q${point(.5, bend)} ${point(1)}`,
    ruts: [-1.75, 1.75].map(offset =>
      `M${point(.09, offset + bend * .164)}Q${point(.5, offset + bend * .836)} ${point(.91, offset + bend * .164)}`).join(" "),
  };
}

function RoadSurface({ courses, color, gravel }) {
  const bed = courses.map(course => course.bed).join(" ");
  const ruts = courses.map(course => course.ruts).join(" ");
  return (
    <g className="board-road" fill="none" strokeLinecap="round" pointerEvents="none" aria-hidden="true">
      <path d={bed} stroke="#26221a" strokeWidth="13" opacity=".79" transform="translate(0 1.25)" />
      <path d={bed} stroke="#806447" strokeWidth="12" />
      <path d={bed} stroke={color || "#bb8b59"} strokeWidth="10.4" />
      <path d={bed} stroke={ROADBED} strokeWidth="6.6" />
      <path d={ruts} stroke="#7d5d41" strokeWidth="1.15" opacity=".67" />
      <path d={bed} stroke={`url(#${gravel})`} strokeWidth="6.6" />
    </g>
  );
}

export function RoadNetwork({ edges, vertices, colors, gravel }) {
  const routes = new Map();
  for (const { owner, a, b } of edges) {
    if (!owner) continue;
    if (!routes.has(owner)) routes.set(owner, []);
    routes.get(owner).push(roadCourse(vertices[a], vertices[b]));
  }
  // Paint each material pass across the route so adjoining edges share a roadbed.
  return [...routes].map(([owner, courses]) =>
    <RoadSurface key={owner} courses={courses} color={colors[owner]?.color} gravel={gravel} />);
}

export function RoadPreview({ a, b, color, gravel }) {
  return <RoadSurface courses={[roadCourse(a, b)]} color={color} gravel={gravel} />;
}

export function BuildingApron({ gravel, city }) {
  const ground = city
    ? "M-19 0Q-18 -6 -9 -7L10 -6Q19 -6 21 0Q22 7 14 9L-8 11Q-18 10 -21 5Z"
    : "M-13 -2Q-10 -6 -3 -6L10 -5Q15 -3 15 3Q13 8 6 9L-8 8Q-17 7 -16 3Z";
  return (
    <>
      <path d={ground} fill="#242015" opacity=".62" transform="translate(0 2)" />
      <path d={ground} fill={ROADBED} stroke="#856949" strokeWidth="1.3" />
      <path d={ground} fill={`url(#${gravel})`} />
    </>
  );
}
