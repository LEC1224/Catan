import React, { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";

export const turnLabel = turn => turn ? `Turn ${turn}` : "Setup";
const percent = (step, last) => 100 * step / Math.max(1, last);

export function moveLabel(frame, players) {
  const actor = players.find(player => player.id === frame.move.actorId);
  return frame.move.text || (actor ? `${actor.name} completed a move.` : "");
}

function frameTurnLabel(frame) {
  return `${turnLabel(frame.turn)}${frame.paired ? " · paired" : ""}`;
}

function timelineMarkers(frames, moments, players) {
  const turns = [], ticks = [], keyMoments = new Map();
  for (const [step, frame] of (frames ?? []).entries()) {
    if (frame.move.type !== "start") ticks.push(`M${step} 0v6`);
    if (step === 0 || frame.turn !== frames[step - 1].turn) {
      const player = frame.turn ? players.find(player => player.id === frame.active) : null;
      turns.push({ step, label: frameTurnLabel(frame), detail: player?.name, color: player?.color, number: frame.turn || "Setup" });
    }
  }
  for (const { step, turn, kind, text } of moments) {
    const marker = keyMoments.get(step);
    if (marker) {
      marker.detail += ` · ${text}`;
      marker.win ||= kind === "win";
    } else {
      keyMoments.set(step, { step, label: turnLabel(turn), detail: text, win: kind === "win" });
    }
  }
  return { turns, ticks: ticks.join(""), keyMoments: [...keyMoments.values()] };
}

function MarkerLane({ kind, markers, step, last, onSeek, onInspect }) {
  const [focused, setFocused] = useState(null);
  const isTurn = kind === "turn";
  const previous = markers.findLastIndex(marker => marker.step <= step);
  const tabbable = focused ?? Math.max(0, previous);
  return (
    <div className={`replay-marker-lane replay-${kind}-lane`} role="group" aria-label={isTurn ? "Turns" : "Key moments"}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(null);
          onInspect(null);
        }
      }}
      onKeyDown={event => {
        const index = Number(event.target.dataset.index);
        const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: markers.length - 1 }[event.key];
        if (next === undefined || !Number.isInteger(index)) return;
        event.preventDefault();
        event.currentTarget.children[Math.max(0, Math.min(markers.length - 1, next))]?.focus();
      }}>
      {markers.map((marker, i) => {
        const next = markers[i + 1]?.step;
        const span = isTurn ? (next ?? last) - marker.step : Math.min(last,
          (next ?? Infinity) - marker.step, marker.step - (markers[i - 1]?.step ?? -Infinity));
        const current = isTurn ? i === previous : marker.step === step;
        return (
          <button key={marker.step} type="button" className={`replay-${kind}-marker`}
            data-index={i} data-win={marker.win} data-setup={isTurn && !marker.color} tabIndex={i === tabbable ? 0 : -1}
            aria-label={[marker.label, marker.detail].filter(Boolean).join(" · ")} aria-current={current ? "step" : undefined}
            style={{ "--at": `${percent(marker.step, last)}%`, "--span": `${percent(span, last)}%`, "--player": marker.color }}
            onClick={() => { onInspect(null); onSeek(marker.step); }}
            onFocus={() => { setFocused(i); onInspect(marker); }}
            onPointerEnter={event => { if (event.pointerType !== "touch") onInspect(marker); }}
            onPointerLeave={() => onInspect(null)}>
            {isTurn && <span aria-hidden="true">{marker.number}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ReplayControls({ step, frameCount, frames, moments, players, onPreview, onSeek, busy, loadState, onRetry }) {
  const [inspection, setInspection] = useState(null);
  const pointer = useRef(null), progress = useRef(null);
  const last = frameCount - 1;
  const { turns, ticks, keyMoments } = useMemo(() => timelineMarkers(frames, moments, players), [frames, moments, players]);
  const selected = frames?.[step];
  const finish = (event, commit) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (commit) onSeek(event.currentTarget.valueAsNumber);
    else onPreview(null);
  };
  return (
    <div className="replay-controls" aria-label="Replay controls" role="group" aria-busy={busy}>
      <div className="replay-step-buttons">
        {[
          ["Start of recording", SkipBack, 0, step === 0],
          ["Previous move", ChevronLeft, step - 1, step === 0],
          ["Next move", ChevronRight, step + 1, step === last],
          ["End of match", SkipForward, last, step === last],
        ].map(([label, Icon, next, disabled]) => (
          <button key={label} type="button" className="results-command icon" disabled={disabled} aria-label={label} title={label}
            onClick={() => onSeek(next)}><Icon size={20} aria-hidden="true" /></button>
        ))}
      </div>
      <div className="replay-timeline">
        {turns.length > 0 && <>
          <span className="replay-lane-label" aria-hidden="true">Turns</span>
          <MarkerLane kind="turn" markers={turns} step={step} last={last} onSeek={onSeek} onInspect={setInspection} />
        </>}
        <span className="replay-lane-label" aria-hidden="true">Actions</span>
        <div className="replay-scrub">
          <div className="replay-progress" aria-hidden="true" ref={progress} style={{ "--progress": `${percent(step, last)}%` }} />
          {ticks && <svg className="replay-action-marks" viewBox={`0 0 ${Math.max(1, last)} 6`} preserveAspectRatio="none" aria-hidden="true">
            <path d={ticks} vectorEffect="non-scaling-stroke" />
          </svg>}
          <input className="replay-range" type="range" min="0" max={last} value={step} disabled={last === 0}
            aria-label="Replay step" aria-valuetext={[
              `Step ${step + 1} of ${frameCount}`, selected && frameTurnLabel(selected), selected && moveLabel(selected, players),
            ].filter(Boolean).join(" · ")}
            onPointerDown={event => {
              if (event.button !== 0 || !event.isPrimary) return;
              pointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              setInspection(null);
              onPreview(event.currentTarget.valueAsNumber);
            }}
            onPointerMove={event => {
              if (!frames || pointer.current !== null || event.pointerType === "touch") return;
              const { left, width } = progress.current.getBoundingClientRect();
              if (!width) return;
              const next = Math.max(0, Math.min(last, Math.round(last * (event.clientX - left) / width)));
              setInspection(current => current?.step === next ? current : {
                step: next, label: frameTurnLabel(frames[next]), detail: moveLabel(frames[next], players),
              });
            }}
            onPointerLeave={() => setInspection(null)}
            onPointerUp={event => finish(event, true)}
            onPointerCancel={event => finish(event, false)}
            onLostPointerCapture={event => finish(event, false)}
            onBlur={() => {
              if (pointer.current !== null) {
                pointer.current = null;
                onPreview(null);
              }
            }}
            onChange={event => {
              const next = event.currentTarget.valueAsNumber;
              if (pointer.current !== null) onPreview(next);
              else onSeek(next);
            }} />
        </div>
        {frames && keyMoments.length > 0 && <>
          <span className="replay-lane-label" aria-hidden="true">Key moments</span>
          <MarkerLane kind="moment" markers={keyMoments} step={step} last={last} onSeek={onSeek} onInspect={setInspection} />
        </>}
        {loadState === "loading" && <small className="replay-load" role="status">Loading timeline…</small>}
        {loadState === "failed" && <button type="button" className="results-command replay-load" onClick={onRetry}>Retry loading timeline</button>}
        {inspection && <div className="replay-inspection" aria-hidden="true" style={{ "--at": `${percent(inspection.step, last)}%` }}>
          <strong>{inspection.label}</strong>{inspection.detail && <span>{inspection.detail}</span>}
        </div>}
      </div>
      <span className="replay-step" aria-hidden="true"><strong>{step + 1}</strong> / {frameCount}</span>
    </div>
  );
}
