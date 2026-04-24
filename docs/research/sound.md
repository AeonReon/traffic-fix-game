# Sound — ambient + key SFX, Web Audio only

## TL;DR — what to ship, ranked by lift-per-line

1. **Delivery chime** — pleasant synthesized tone on every delivery
   + building visit. Pitch varies by building type (sub-scale). This
   alone makes the game feel 3× more alive.
2. **Ambient pad loop** — 8-bar synth pad, very quiet. Sets mood.
3. **Road-complete click** — tiny soft click when a road drag
   completes. Tactile feedback.
4. **Jam warning tone** — low slow pulse when `jamMeter > 0.7`. Only
   plays if demand > 0. Acts as an audio version of the red bar.
5. **Gate open** — slide-up 2-note chime when a new edge entry
   unlocks. Rare event; high impact.

**Non-goals:**
- Engine loops on cars. Fiddly, annoying fast.
- Voice-over / narration. Wrong vibe.
- Backing track / music song. Too strong a presence. Ambient pad only.

## Why synthesise, not sample

Our deploy target is a static single-file site. Adding audio files
means:
- Extra bytes (10-500 KB each, 50+ sounds at scale).
- Extra file paths / MIME config.
- License/attribution tracking.
- Load-time flicker until assets arrive.

**All of the above are avoidable with Web Audio oscillators for this
game.** Our SFX palette is tiny (5 sounds) and harmonic, so
synthesized tones land perfectly. An ambient pad made from two
slightly-detuned triangle-wave oscillators with a gentle LFO *is* the
genre. Think: Mini Metro's station chimes — they are synthesized.

If the ambient pad is too flat to carry alone, a single ambient
texture file (~30 KB MP3, 8-16 seconds loop) is acceptable as an
exception. Everything else must be synthesized.

## Concrete spec

### Setup (single global AudioContext, lazy-init)

```js
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
```

Lazy-init because iOS Safari requires audio to start from a user
gesture. Hook `ensureAudio()` to the Start button click in
`onPointerDown` or the Start splash button.

### 1. Delivery chime

Pitches by building type — all in a consonant pentatonic scale so
multiple chimes in quick succession always sound musical:

```
House    → A4  (440 Hz)
Shop     → C5  (523.25 Hz)
Mall     → E5  (659.25 Hz)
Office   → G5  (783.99 Hz)
Industry → D5  (587.33 Hz)
```

Edge-exit delivery (not a building visit): lower octave, `F4` (349.23 Hz).

Per chime:
- Sine oscillator, 180ms duration.
- Envelope: attack 5ms, decay to 0 over 175ms (exponential).
- Master gain × 0.15 (quiet — will layer up under demand).

```js
function chime(freq, volume = 0.15) {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  osc.connect(gain).connect(masterGain);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}
```

Call `chime()` from whichever code increments `state.delivered` or
`block.visits++`.

### 2. Ambient pad

Two sawtooth oscillators detuned by ±7 cents, through a lowpass
filter at 800 Hz, Q 0.5, sent to a big reverb (ConvolverNode with
synthesized impulse, 3s tail). Very quiet master gain (0.05).

Add a slow LFO modulating the filter cutoff (0.2 Hz, ±300 Hz) so
the pad breathes.

```js
function startPad() {
  const ctx = ensureAudio();
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = o2.type = 'sawtooth';
  o1.frequency.value = 110;                    // A2
  o2.frequency.value = 110 * Math.pow(2, 7/1200); // A2 +7 cents
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 800;
  lp.Q.value = 0.5;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.2;
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain).connect(lp.frequency);
  const g = ctx.createGain();
  g.gain.value = 0.05;
  o1.connect(lp); o2.connect(lp);
  lp.connect(g).connect(masterGain);
  [o1, o2, lfo].forEach(n => n.start());
}
```

Call once from the Start button. Do not stop it unless mute is hit.

Optional alternative if this is too flat: a single ambient-pad MP3
file (8-16s loop, sub-30KB at low bitrate). Freesound has usable
ones:
- [Freesound — Klankbeeld "traffic" pack (ambient textures)](https://freesound.org/people/klankbeeld/packs/7274/)
- [Freesound — dobroide "city noise" pack](https://freesound.org/people/dobroide/packs/247/)
- [Pixabay — City Ambience sounds (CC0 available)](https://pixabay.com/sound-effects/search/city-ambience/)

Recommendation: synthesise first. Swap for a file only if the synth
pad feels sterile after a week of listening.

### 3. Road-complete click

Very short noise burst + quick pitch decay:

```js
function clickSfx() {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.06);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
  osc.connect(gain).connect(masterGain);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}
```

Call from `onPointerUp` when a road is successfully committed.

### 4. Jam warning tone

Low slow pulse while jam is critical:

```js
let jamToneActive = false;
function updateJamTone(jamMeter) {
  if (jamMeter > 0.7 && state.demandMult > 0 && !jamToneActive) {
    jamToneActive = true;
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 80;
    // pulsing volume
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.7;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(gain.gain);
    gain.gain.value = 0.06;
    osc.connect(gain).connect(masterGain);
    osc.start(); lfo.start();
    // store refs to stop later
    currentJamTone = { osc, lfo };
  } else if (jamMeter < 0.5 && jamToneActive) {
    currentJamTone.osc.stop(); currentJamTone.lfo.stop();
    jamToneActive = false;
  }
}
```

Important: hysteresis between 0.7 (on) and 0.5 (off) to stop
chattering. Call every frame from `stepSim`.

### 5. Gate open chime (for unlocked entries, when shipped)

Two-note slide, E5 → A5 (659 → 880 Hz), over 500ms, warm sine.
Triangle wave harmonic adds body. Only fires on the unlock event,
never again for that gate.

## Master gain + mute

Wire everything through a single `masterGain` node:

```js
const masterGain = ctx.createGain();
masterGain.gain.value = 1.0;
masterGain.connect(ctx.destination);
```

Mute button in HUD toggles `masterGain.gain.value` 0 or 1. Persist
the preference to `localStorage` (along with city save — feature #1).

## When to trigger each

| Trigger | Sound |
|---|---|
| Splash "Start" tapped | `ensureAudio()`; start ambient pad |
| Car visits a building | `chime(buildingFreq)` |
| Car exits via edge | `chime(349)` |
| Road drag committed | `clickSfx()` |
| Jam meter crosses 0.7 | start jam tone |
| Jam meter falls below 0.5 | stop jam tone |
| Gate unlocks (feature #5) | gate open chime |
| Mute button tapped | toggle `masterGain.gain` |

## Acceptance criteria

- [ ] Audio only starts after user gesture (works on iOS Safari).
- [ ] Mute button in HUD silences everything, persisted.
- [ ] No audio file under `js/` / `data/` — everything
      synthesized, OR a single ambient pad file under 30 KB as the
      only exception.
- [ ] Delivery chimes are pitched per building type and sound
      pleasant when multiple trigger within 1s.
- [ ] No sound plays over itself in a way that distorts
      (max-polyphony guard per sound).
- [ ] Jam tone has hysteresis (0.7 on, 0.5 off).

## Sources

- [Freesound.org — main index (CC audio library)](https://freesound.org/)
- [Freesound — car tag](https://freesound.org/browse/tags/car/)
- [Freesound — Klankbeeld traffic pack](https://freesound.org/people/klankbeeld/packs/7274/)
- [Freesound — dobroide city noise pack](https://freesound.org/people/dobroide/packs/247/)
- [Pixabay — Creative Commons sound effects](https://pixabay.com/sound-effects/search/creative-commons/)
- [Pixabay — city ambience](https://pixabay.com/sound-effects/search/city-ambience/)
- [Krotos — Free Ambient Sounds pack](https://krotos.studio/free-sound-effects/free-ambient-sounds-wind-bird-song-street-noise-and-more)
- [Into Games — Getting started with Freesound.org](https://intogames.org/news/getting-started-with-freesound.org)
- [MDN — Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
