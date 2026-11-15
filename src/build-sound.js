const TAU = 2 * Math.PI;

// Each scale adds a longer resonance and a lower body. The upper modes are
// audible on small speakers, while the grit carries the tail of the impact.
const MATERIALS = {
  road: { body: 91, fall: 49, decay: .039, grit: .34, duration: .20, level: .67, seed: 73 },
  settlement: { body: 72, fall: 57, decay: .054, grit: .28, duration: .26, level: .77, seed: 131 },
  city: { body: 56, fall: 63, decay: .071, grit: .39, duration: .34, level: .84, seed: 199 },
};

export function createBuildImpact(context, name) {
  const [kind, take] = name.split("-");
  if (!Object.hasOwn(MATERIALS, kind)) return null;
  const { body, fall, decay, grit, duration, level, seed } = MATERIALS[kind];
  const secondTake = take === "2";
  const hz = body * (secondTake ? .94 : 1.03);
  const slice = context.createBuffer(1, Math.ceil(duration * context.sampleRate), context.sampleRate);
  const pcm = slice.getChannelData(0);
  const filterRate = 1 - Math.exp(-TAU * 1050 / context.sampleRate);
  const slowRate = 1 - Math.exp(-TAU * 210 / context.sampleRate);
  let random = seed + (secondTake ? 421 : 0), highs = 0, lows = 0, peak = 0;

  for (let i = 0; i < pcm.length; i++) {
    const t = i / context.sampleRate;
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const grain = random / 2147483648 - 1;
    highs += (grain - highs) * filterRate;
    lows += (grain - lows) * slowRate;

    const attack = Math.min(1, t / .0025);
    const pitch = TAU * (hz * t + fall * .014 * (1 - Math.exp(-t / .014)));
    const weight = .63 * Math.sin(pitch) * Math.exp(-t / decay);
    const knock = .29 * Math.sin(pitch * 2.12 + .3) * Math.exp(-t / (decay * .52))
      + .14 * Math.sin(pitch * 3.43 + 1) * Math.exp(-t / .024);
    // A short granular strike followed by quieter, irregular settling.
    const scatter = Math.exp(-t / .046) * (.62 + .38 * Math.cos(TAU * (19 * t + 77 * t * t)));
    const dirt = (1.55 * (highs - lows) + .24 * grain) * (grit * scatter + .57 * Math.exp(-t / .009));
    const fade = Math.min(1, (duration - t) / .028);
    pcm[i] = (weight + knock + dirt) * attack * fade;
    peak = Math.max(peak, Math.abs(pcm[i]));
  }
  const gain = level / peak;
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  return slice;
}
