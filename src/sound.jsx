import React, { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { createSoundPlayer } from "./sound-player.js";
import { decisionSoundDeadline } from "./sound-cues.js";

const PREFERENCE_KEY = "catanSoundEffects";

function readPreference() {
  try { return localStorage.getItem(PREFERENCE_KEY) !== "off"; }
  catch { return true; }
}

export function useSoundEffects() {
  const [enabled, setEnabled] = useState(readPreference);
  const [player] = useState(() => createSoundPlayer(enabled));

  useEffect(() => {
    player.preload();
    const onGesture = (event) => { if (event.isTrusted) player.unlock(); };
    const onVisibility = () => { if (document.hidden) player.stop(); };
    const onStorage = (event) => {
      if (event.key !== PREFERENCE_KEY && event.key !== null) return;
      const next = readPreference();
      player.setEnabled(next);
      setEnabled(next);
    };
    document.addEventListener("click", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("click", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      player.dispose();
    };
  }, [player]);

  function toggle() {
    const next = !enabled;
    player.setEnabled(next);
    setEnabled(next);
    try { localStorage.setItem(PREFERENCE_KEY, next ? "on" : "off"); }
    catch { /* The control still works when storage is unavailable. */ }
    if (next) {
      player.unlock();
      player.play("confirm");
    }
  }

  return { enabled, toggle, player };
}

export function useDecisionWarning(game, meId, player) {
  const deadline = decisionSoundDeadline(game, meId);
  useEffect(() => {
    if (!deadline) return;
    const warnAt = deadline - 10_000;
    const delay = warnAt - Date.now();
    if (delay < 0) return;
    const timer = setTimeout(() => {
      if (Date.now() - warnAt < 1_500) player.play("timeWarning");
    }, delay);
    return () => clearTimeout(timer);
  }, [deadline, player]);
}

export function SoundToggle({ enabled, onToggle, className }) {
  const Icon = enabled ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      className={className}
      aria-label="Sound effects"
      aria-pressed={enabled}
      title={enabled ? "Mute sound effects" : "Unmute sound effects"}
      onClick={onToggle}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
