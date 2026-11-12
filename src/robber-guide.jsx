import React, { useId } from "react";
import { Shield } from "lucide-react";
import "./robber-guide.css";

export function FriendlyRobberHint() {
  return (
    <span className="robber-friendly-note">
      <Shield size={14} aria-hidden="true" />
      <span><strong>Friendly Robber:</strong> opponents below 3 visible points are protected.</span>
    </span>
  );
}

export function RobberHexMark({ state, points, x, y }) {
  const patternId = useId();
  if (!state) return null;
  return (
    <g className={`robber-mark robber-mark-${state}`} aria-hidden="true" pointerEvents="none">
      {state === "destination" ? (
        <>
          <polygon className="robber-tile-outline" points={points} vectorEffect="non-scaling-stroke" />
          <polygon className="robber-tile-highlight" points={points} vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <>
          <polygon className="robber-tile-muted" points={points} vectorEffect="non-scaling-stroke" />
          {state === "protected" && (
            <>
              <defs>
                <pattern id={patternId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                  <line x1="0" x2="0" y1="0" y2="9" stroke="#ffe4b2" strokeOpacity=".25" strokeWidth="3" />
                </pattern>
              </defs>
              <polygon points={points} fill={`url(#${patternId})`} />
              <g transform={`translate(${x + 28},${y - 23})`}>
                <circle r="12.5" fill="#352e25" stroke="#e6c487" strokeWidth="1.5" />
                <g transform="translate(-8,-8)" color="#ffe0a5"><Shield size={16} strokeWidth={2.4} /></g>
              </g>
            </>
          )}
        </>
      )}
    </g>
  );
}
