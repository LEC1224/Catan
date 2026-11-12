import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { shortcutProps } from "./match-shortcuts.jsx";
import { useRollReminder } from "./roll-reminder.js";

const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
// Inverse rotations of the six faces. The die always lands on the server's value.
const LANDINGS = [[0, 0], [0, -90], [-90, 0], [90, 0], [0, 90], [0, 180]];
export const DICE_THROW_DURATION = 760;

function Die({ value, second }) {
  const [x, y] = LANDINGS[value - 1];
  return (
    <span className={`table-die${second ? " second" : ""}`} style={{ "--land-x": `${x}deg`, "--land-y": `${y}deg` }} aria-hidden="true">
      <span className="die-shadow" />
      <span className="die-flight">
        <span className="die-cube">
          {PIPS.map((dots, i) => (
            <span className={`die-face face-${i + 1}`} key={i + 1}>
              {Array.from({ length: 9 }, (_, p) => <i className={dots.includes(p) ? "pip" : undefined} key={p} />)}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

export function MatchDice({ dice, rollId, canRoll, onRoll }) {
  const lastRoll = useRef(rollId), inFlight = useRef(false);
  const [throwId, setThrowId] = useState(null), [rolling, setRolling] = useState(false), [pending, setPending] = useState(false);
  useLayoutEffect(() => {
    if (!rollId) { setRolling(false); return; }
    if (rollId === lastRoll.current) return;
    lastRoll.current = rollId;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setRolling(false); return; }
    setThrowId(rollId);
    setRolling(true);
    const timer = setTimeout(() => setRolling(false), DICE_THROW_DURATION);
    return () => clearTimeout(timer);
  }, [rollId]);

  const enabled = canRoll && !rolling && !pending;
  const remind = useRollReminder(enabled);
  const total = dice ? dice[0] + dice[1] : null;
  const label = enabled ? "Roll dice" : rolling || pending ? "Rolling dice" : dice ? `Dice: ${dice[0]} and ${dice[1]}, total ${total}` : "Dice not rolled";
  async function roll() {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try { await onRoll(); }
    finally { inFlight.current = false; setPending(false); }
  }
  return (
    <div className="dice-group">
      <button type="button" className={`dice-control roll-reminder${enabled ? " can-roll" : ""}${rolling ? " rolling" : ""}`}
        data-roll-reminder={remind || undefined} aria-label={label} title={label} {...shortcutProps("roll")} disabled={!enabled} onClick={roll}>
        <span className="dice-pair" key={throwId}>
          <Die value={dice?.[0] ?? 1} />
          <Die value={dice?.[1] ?? 5} second />
        </span>
        <span className="dice-total" aria-hidden="true" data-visible={total != null && !rolling}>{total ?? ""}</span>
      </button>
      <span className="visually-hidden" role="status">{total != null && !rolling ? `Rolled ${total}` : ""}</span>
    </div>
  );
}

export function TurnClock({ deadline, limit }) {
  const timeLeft = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(timeLeft);
  useEffect(() => {
    const interval = setInterval(() => setSeconds(timeLeft()), 200);
    return () => clearInterval(interval);
  }, [deadline]);
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  return (
    <div className={`turn-clock${seconds <= 15 ? " urgent" : ""}`} role="timer" aria-live="off" aria-label={`Time left: ${minutes} minute${minutes === 1 ? "" : "s"} ${remainder} second${remainder === 1 ? "" : "s"}`}>
      <span className="clock-readout"><Clock3 size={17} aria-hidden="true" /> <b>{minutes}:{String(remainder).padStart(2, "0")}</b></span>
      <span className="clock-track" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, seconds / (limit || 1))})` }} /></span>
    </div>
  );
}
