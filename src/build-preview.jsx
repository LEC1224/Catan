import React from "react";
import "./build-preview.css";

export function BuildPreview({ hit, onBuild, original, children }) {
  return (
    <g className="build-preview-target" data-pointer-action="" aria-hidden="true" onClick={({ nativeEvent }) => {
      if (nativeEvent.pointerType !== "touch" && !nativeEvent.sourceCapabilities?.firesTouchEvents) onBuild();
    }}>
      {hit}
      {original && <g className="build-preview-original" pointerEvents="none">{original}</g>}
      <g className="build-preview" pointerEvents="none">{children}</g>
    </g>
  );
}

export function CityUpgradePreview({ x, y, onBuild, renderPiece }) {
  return (
    <BuildPreview onBuild={onBuild} original={renderPiece("settlement")}
      hit={<rect x={x - 16} y={y - 26} width="32" height="40" rx="8" fill="transparent" />}>
      {renderPiece("city")}
    </BuildPreview>
  );
}
