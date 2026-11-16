import React from "react";

const APRON_FILL = "#c1a176";
const ROAD_WIDTH = 9.3;
const ROAD_EDGE_WIDTH = 11.7;

export function RoadGravel({ id }) {
  return (
    <pattern id={id} width="17" height="13" patternUnits="userSpaceOnUse">
      <path d="M1 2.5l1.2-.4.5.7-1.3.4ZM5.7 7.4l1-.5.7.5-.7.6ZM12 10.5l.7-.6 1 .3-.4.8ZM14.8 3l1.1-.5.3.6-.8.6Z" fill="#776b55" opacity=".76" />
      <path d="M4.6 1.6l1.1-.3.4.6-.9.4ZM2.3 8.8l1-.4.5.6-1.3.4ZM10 5.3l.6-.5 1 .4-.4.6ZM15.4 8.4l.9.1-.3.7-.8-.2ZM8.5 11.7l.5-.5.9.3-.6.5Z" fill="#d9c9a6" opacity=".9" />
      <path d="M8.4 2.8l1.2-.6.7.6-.4.8-1.4-.3ZM3.9 11.5l.8-.4.7.5-.8.7ZM12.6 7l.7-.4.7.3-.5.5ZM1 5.9l.8-.4.3.7-.8.3Z" fill="#a4967e" opacity=".86" />
    </pattern>
  );
}

function RoadSurface({ courses, markers = [], color, gravel }) {
  const bed = courses.map(course => course.bed).join(" ");
  const stones = markers.map(({ point: { x, y }, heading }) => {
    const at = offset => `${(x - heading.y * offset).toFixed(2)},${(y + heading.x * offset).toFixed(2)}`;
    const shoulder = ROAD_WIDTH / 2;
    return `M${at(shoulder - 1)}L${at(shoulder + 1.15)} M${at(1 - shoulder)}L${at(-shoulder - 1.15)}`;
  }).join(" ");
  return (
    <g className="board-road" fill="none" strokeLinecap="round" pointerEvents="none" aria-hidden="true">
      <path d={bed} stroke="#211b14" strokeWidth={ROAD_EDGE_WIDTH} opacity=".82" transform="translate(0 1.25)" />
      <path d={bed} stroke="#514332" strokeWidth={ROAD_EDGE_WIDTH} />
      <path d={bed} stroke={color || "#bb8b59"} strokeWidth={ROAD_WIDTH} />
      <path d={bed} stroke="#392b1b" strokeWidth="4.5" opacity=".12" />
      <path d={bed} stroke={`url(#${gravel})`} strokeWidth={ROAD_WIDTH} opacity=".8" />
      {stones && <path d={stones} stroke="#e7d8b7" strokeWidth="1.65" />}
    </g>
  );
}

export function RoadNetwork({ routes, colors, gravel }) {
  // Paint each material pass across the route so adjoining edges share a roadbed.
  return [...routes].map(([owner, { courses, markers }]) =>
    <RoadSurface key={owner} courses={courses} markers={markers} color={colors[owner]?.color} gravel={gravel} />);
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
