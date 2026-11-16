import React from "react";
import { ROAD_WIDTH } from "./road-geometry.js";

const APRON_FILL = "#c1a176";
const ROAD_EDGE_WIDTH = 11.7;

export function RoadGravel({ id }) {
  return (
    <pattern id={id} width="17" height="13" patternUnits="userSpaceOnUse">
      <path d="M1 2.5l1.2-.4.5.7-1.3.4ZM5.7 7.4l1-.5.7.5-.7.6ZM12 10.5l.7-.6 1 .3-.4.8ZM14.8 3l1.1-.5.3.6-.8.6ZM9.4 8l.6-.4.4.5-.6.3ZM6.9 4.7l.5.3-.1.5-.6-.2Z" fill="#73695b" opacity=".86" />
      <path d="M4.6 1.6l1.1-.3.4.6-.9.4ZM2.3 8.8l1-.4.5.6-1.3.4ZM10 5.3l.6-.5 1 .4-.4.6ZM15.4 8.4l.9.1-.3.7-.8-.2ZM8.5 11.7l.5-.5.9.3-.6.5ZM1.8 4.8l.6-.3.4.5-.7.2ZM13 1l.8-.2.2.5-.7.2Z" fill="#d9c9a6" opacity=".92" />
      <path d="M8.4 2.8l1.3-.7.9.5-.2.8-1.5.2ZM3.9 11.5l1-.5.8.5-.9.8ZM12.6 7l1-.5.8.3-.6.8ZM1 5.9l.8-.4.3.7-.8.3ZM5 5l1-.5.4.4-.6.6ZM15.5 11.2l.8-.4.4.6-.7.4Z" fill="#aa9a82" opacity=".9" />
      <path d="M3.7 3.6l.6-.3.7.4-.5.4ZM11.4 3l.7-.6.5.5-.4.6ZM7.1 9.4l.8-.6.5.5-.6.6ZM12.3 12.3l.5-.3.6.2-.4.5Z" fill="#b6b2a3" opacity=".88" />
    </pattern>
  );
}

export function PavementGravel({ id, base }) {
  return (
    <pattern id={id} width="17" height="13" patternUnits="userSpaceOnUse">
      <rect width="17" height="13" fill={`url(#${base})`} />
      <path d="M5.8 3.4l.9-.7.6.5-.2.7-.9.2ZM12 8.7l.9-.4.5.4-.2.6-1 .2ZM9 1.2l.6-.4.7.2-.2.6-1.1.1ZM2 10.8l.6-.5.8.2-.2.6-.9.1ZM15.1 5.3l.8-.5.4.7-.9.4Z" fill="#ab9173" opacity=".94" />
      <path d="M3.4 6.3l.7-.5.8.2.1.5-.8.3-.7-.2ZM10.4 10.7l.8-.4.7.3-.4.6-.9.1ZM13.1 4.7l.7-.3.5.5-.5.5-.7-.2ZM5.7 11.4l.8-.3.4.5-.7.4ZM.8 8.8l.6-.2.4.5-.8.2Z" fill="#a8a294" opacity=".9" />
      <path d="M2.8 1.2h.25M5 2.5h.18M6.1 .6h.18M8.1 4.9h.24M9.3 6.7h.17M10.8 1.8h.19M13.2 2.7h.14M14.6 1.4h.15M16.1 2.3h.23M2.8 5.1h.19M6.4 6h.13M7.8 7.8h.21M11.5 6.8h.16M13.9 7.2h.19M16.2 6.6h.14M.7 7.5h.18M4.1 8.4h.19M3.5 10.15h.15M6.4 10h.14M8.8 9.4h.17M10.7 8.3h.16M13.7 10.1h.2M14.5 11.5h.22M16.1 9.9h.19M6.8 12.1h.2M10.2 12.25h.19M2.1 12.3h.16Z"
        fill="none" stroke="#d3b88c" strokeWidth=".49" strokeLinecap="round" opacity=".77" />
      <path d="M2.3 3.3h.22M4.5 4.4h.2M7.1 1.6h.18M9.3 4.3h.14M11.8 1.4h.23M12.2 6h.17M14.7 4.3h.17M16.4 4.1h.18M5.4 8.8h.13M8.4 6.2h.22M9.4 10h.14M11.3 9.6h.17M14.1 8.8h.15M6.5 8.8h.2M7.2 11.05h.15M15.1 12.4h.22M3.4 12.5h.21M.6 11.1h.22"
        fill="none" stroke="#6b5c48" strokeWidth=".54" strokeLinecap="round" opacity=".72" />
    </pattern>
  );
}

function RoadSurface({ courses, notches = [], color, gravel }) {
  const bed = courses.map(course => course.bed).join(" ");
  const seams = notches.map(({ point: { x, y }, outward }) =>
    `M${x.toFixed(2)},${y.toFixed(2)}l${(-1.9 * outward.x).toFixed(2)},${(-1.9 * outward.y).toFixed(2)}`).join(" ");
  return (
    <g className="board-road" fill="none" strokeLinecap="round" pointerEvents="none" aria-hidden="true">
      <path d={bed} stroke="#211b14" strokeWidth={ROAD_EDGE_WIDTH} opacity=".82" transform="translate(0 1.25)" />
      <path d={bed} stroke="#514332" strokeWidth={ROAD_EDGE_WIDTH} />
      <path d={bed} stroke={color || "#bb8b59"} strokeWidth={ROAD_WIDTH} />
      <path d={bed} stroke="#392b1b" strokeWidth="4.5" opacity=".12" />
      <path d={bed} stroke={`url(#${gravel})`} strokeWidth={ROAD_WIDTH} opacity=".94" />
      {seams && <path d={seams} stroke="#342922" strokeWidth="1.35" opacity=".9" />}
    </g>
  );
}

export function RoadNetwork({ routes, colors, gravel }) {
  // Paint each material pass across the route so adjoining edges share a roadbed.
  return [...routes].map(([owner, { courses, notches }]) =>
    <RoadSurface key={owner} courses={courses} notches={notches} color={colors[owner]?.color} gravel={gravel} />);
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
