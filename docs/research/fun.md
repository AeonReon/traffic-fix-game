# Fun — the 10-minute loop, the aha moment, the hook

The question this doc answers: *why would someone open the game a
second time?* Not a pleasant theory exercise — we're making concrete
claims about which moments to design for.

## The thesis

Our game isn't a puzzle or a survival sim. It's a **design-and-observe
sandbox**. The analogue is *model railways*, not Mini Motorways. The
player designs a system, runs it, watches how it performs, adjusts,
runs again. The satisfaction is from **diagnosing and fixing flow**,
with the game doing the simulation work.

This is a deliberately different shape from Mini Motorways:

| | Mini Motorways | Ours |
|---|---|---|
| Primary verb | React | Design |
| Time pressure | Constant | Self-imposed |
| Fail state | Real | None |
| Session length | 15–30 min scored run | Open-ended |
| Source of challenge | Random spawns | Self-selected demand |
| Feel | "Keep up!" | "Get it right." |

Everything below serves that thesis.

## The 10-minute core loop

We're going to describe what the player does from session-open to
first-natural-exit. This is the loop the features should reinforce.

```
0:00  Open game. Existing layout loads from localStorage (or splash).
0:15  Glance at current state, remember what they were trying.
0:30  Nudge demand slider up. Watch traffic behave.
1:00  Notice a bottleneck — queue building at N entry, or a junction
      turning red on the pressure indicator.
1:30  Slider down to 0 ("pause pressure"). Study the layout. Plan.
2:00  Delete a road. Redraw it as a bypass. Maybe place a roundabout.
      Place a new shop to absorb traffic elsewhere.
3:30  Slider back up. Watch. Is the bottleneck gone? Did a new one
      emerge?
5:00  Repeat — tiny tweak, run, watch, tweak.
8:00  Try an ambitious change: rebuild the whole NE district. 
9:00  End-of-week hits — pick a new upgrade tool from the draft.
10:00 Put phone down, session ended in a natural pause.
```

The loop is **tweak → run → observe → tweak**. Every cycle is <30s.
The "run → observe" phase is where the game's sim does the fun bit;
the player is just a viewer. The "tweak" phase is where we sell the
toolbox.

## The aha moments — what we design around

We want to engineer these specific emotional beats. Each requires a
concrete mechanic to trigger it:

### Aha #1 — "I just unblocked a jam with one line"
**The moment:** player drags one extra road as a bypass; instantly
the queue at an entry drains. Cars that were stopped start moving.

**Requires:** (a) visible queue building up at entries (✅ already);
(b) fast feedback — cars start moving within 2s of the new road
being connected.

**Threat:** if Dijkstra is slow to re-dispatch, the feedback lags.
See Stage-A performance notes in old RESEARCH.md.

### Aha #2 — "my city works"
**The moment:** player pushes the slider to 2× (high demand). Traffic
flows smoothly. Queues stay empty. They can crank to 3× without
breaking it.

**Requires:** (a) a believable "stress test" where the player sees
proof of their design's capacity; (b) no hidden failures (jam bar
must reflect reality); (c) at 3× it actually *should* start breaking
if they haven't optimised — otherwise the stress test is meaningless.

**This is the single best feeling in the game and the thing that will
keep players coming back.** The manual demand slider is the feature
that makes this possible.

### Aha #3 — "the roundabout was the answer"
**The moment:** player places a roundabout at the worst four-way
junction. Throughput visibly increases. Chain-reaction: other
queues drain because this one isn't bottlenecking them anymore.

**Requires:** intersection speed penalty (from `mini-motorways.md`
item #4). Without that, the roundabout is just cosmetic and the aha
doesn't trigger.

### Aha #4 — "the one-way street fixed everything"
**The moment:** congested two-way road between two malls. Player
splits it into two parallel one-ways. Traffic triples its throughput.

**Requires:** one-way road tool + a test scenario where the player
would naturally hit this.

### Aha #5 — "I built a nice-looking city"
**The moment:** player zooms out at session end, sees their city.
Leans back. It's pleasing to look at.

**Requires:** visual coherence (see `visual-direction.md`). Warm
palette, buildings that read as buildings, roads with lane markings,
some ambient life (trees, benches). This aha doesn't require a
specific mechanic — it requires the art to land.

## The hook — why they come back tomorrow

Mini Motorways' hook is *leaderboard + "just one more run"*. Ours
can't be that — sandbox + no fail state = no run to beat. So what
pulls them back?

### Option A: Persistent city
Their city saves. Next session, it's still there. They can keep
iterating on it for weeks. This is the **model-railway** hook and
probably our best answer.

Requires: localStorage save + load of the full graph + building state.
Not hard to ship. Ship this early — it's the hook.

### Option B: Daily challenges
A rotating daily scenario — "you have this starter layout, keep
demand above X× for 3 minutes, no jam events over 0.6." Shareable
score.

Requires: scoring infrastructure + shareable URL state. Bigger lift.
Only compelling if Option A alone doesn't stick.

### Option C: Scenarios
Prebuilt maps with interesting constraints (river, park, tight entries).
Not procedural — hand-authored. Player works through the set.

Requires: scenario file format + UI. Also not hard.

**Recommendation:** Ship A (persistence) first. Add C (scenarios)
alongside. Leave B for later if it's needed.

## The anti-patterns — things that will kill the fun

Flag these so the build session can reject them proactively.

### 1. Random buildings spawned for the player
Would directly contradict the design pillar. Would kill Aha #2 and
#5. Would confuse players ("why did a mall just appear here?").

### 2. Resource economy / road-tile budget
Would break the "tweak freely, observe, tweak again" loop. Every
redesign would have a cost. The frictionless iteration IS the fun.

### 3. Hard game-over
Would contradict the locked-in "sandbox, no fail state." Jams are
feedback; they are not an ending.

### 4. Dense HUD / number-heavy UI
Would turn the aesthetic from "calm design study" into "dashboard".
Mini Metro and MM both use visual cues (rings, pins) over numbers for
exactly this reason.

### 5. Sound that demands attention
Music that loops aggressively, alerts that beep. Breaks the
contemplative feel. (See `sound.md`.)

### 6. Tutorials that block play
The game should be comprehensible in 10 seconds. A coach-mark on first
road drag is plenty. No tutorial level, no "press next to continue".

## The single most important feature to nail

Out of everything in this doc and `next-features.md`: **the stress-test
loop**. The ability to:

1. Push demand up to see where it breaks.
2. Pull demand to 0 to freeze pressure and rebuild.
3. Push demand back up to verify the fix.

This already exists (the slider does it). But we must not break it.
Any feature that compromises this loop (e.g. "you can only change
demand at the start of a week") is a **no**.

Every planned feature below can be evaluated with one question: *does
this enhance the tweak-run-observe-tweak loop, or does it add friction
to it?*

## Concrete summary for the build session

Build these, in order of fun-delivered:

1. **Persistence** — cities survive between sessions. Hook.
2. **Pressure indicators on buildings** — triggers Aha #1 and #3.
3. **Intersection speed penalty + roundabout upgrade** — makes the
   toolbox meaningful, triggers Aha #3.
4. **One-way roads** — triggers Aha #4, biggest single player "oh!"
   moment.
5. **Visual polish** (cars look like cars, tinted day/night) —
   triggers Aha #5, gets the screenshot-worthy moment.

See `next-features.md` for the full ranked list and rationales.
