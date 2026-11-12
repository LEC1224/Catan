import soundUrl from "./audio/tabletop.mp3";
import clips from "./audio/tabletop.json";

const VARIANTS = {
  dice: ["dice-1", "dice-2", "dice-3"],
  road: ["road-1", "road-2"],
  settlement: ["settlement-1", "settlement-2"],
};
const MIN_INTERVAL = { chat: 0.7, offer: 0.6, ready: 0.28 };
const REPLACE_PREVIOUS = new Set(["start", "discardWarning", "won", "finished"]);

export function createSoundPlayer(initiallyEnabled) {
  let enabled = initiallyEnabled;
  let context, output, download, decoding, buffer, resuming;
  let generation = 0;
  const sources = new Set();
  const lastPlayed = new Map();
  const lastVariant = new Map();

  function preload() {
    if (!enabled || download) return;
    download = fetch(soundUrl)
      .then((response) => {
        if (!response.ok) throw Error("Sound pack unavailable");
        return response.arrayBuffer();
      })
      .catch(() => {
        download = null;
        return null;
      });
  }

  function unlock() {
    if (!enabled || document.hidden) return;
    if (!context) {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return;
      try {
        context = new AudioContext();
        output = context.createGain();
        output.gain.value = 0.9;
        output.connect(context.destination);
      } catch {
        dispose();
        return;
      }
    }
    if (context.state !== "running") {
      const attempt = context.resume().catch(() => {});
      resuming = attempt;
      void attempt.then(() => { if (resuming === attempt) resuming = null; });
    }
    preload();
    if (!buffer && !decoding) {
      const audio = context;
      decoding = download
        .then((bytes) => bytes && audio.decodeAudioData(bytes.slice(0)))
        .then((decoded) => { if (context === audio) buffer = decoded; })
        .catch(() => { if (context === audio) download = null; })
        .finally(() => { if (context === audio) decoding = null; });
    }
  }

  function play(...cues) {
    if (!cues.length || !enabled || !context || document.hidden) return;
    if (!buffer || context.state !== "running") {
      if (!decoding && !resuming) return;
      const requested = performance.now(), current = generation;
      void Promise.all([decoding, resuming]).then(() => {
        if (generation === current && buffer && context?.state === "running" && performance.now() - requested < 650) {
          play(...cues);
        }
      });
      return;
    }

    if (cues.some((cue) => REPLACE_PREVIOUS.has(cue))) stop();
    let at = context.currentTime + 0.008;
    for (const cue of cues) {
      if (at - (lastPlayed.get(cue) ?? -Infinity) < (MIN_INTERVAL[cue] ?? 0.085)) continue;
      let name = cue;
      if (Object.hasOwn(VARIANTS, cue)) {
        const available = VARIANTS[cue].filter((variant) => variant !== lastVariant.get(cue));
        name = available[Math.floor(Math.random() * available.length)];
        lastVariant.set(cue, name);
      }
      if (!Object.hasOwn(clips, name)) continue;
      const [offset, duration] = clips[name];
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
      };
      source.start(at, offset, duration);
      lastPlayed.set(cue, at);
      // Let the dice hit the table first, then bring in the next cue as they settle.
      at += Math.max(0.12, Math.min(cue === "dice" ? 0.59 : Infinity, duration - 0.035));
    }
  }

  function stop() {
    generation++;
    for (const source of sources) source.stop();
    sources.clear();
    lastPlayed.clear();
  }

  function setEnabled(value) {
    enabled = value;
    if (enabled) preload();
    else stop();
  }

  function dispose() {
    stop();
    if (context && context.state !== "closed") void context.close().catch(() => {});
    context = output = decoding = buffer = resuming = null;
  }

  return { preload, unlock, play, stop, setEnabled, dispose };
}
