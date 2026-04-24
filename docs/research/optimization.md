# Optimization — enjoyment & development

Two questions, one doc:

- **What will make the game more *fun to play*?** (Player side)
- **What will make the three-session build run *faster and tighter*?**
  (Developer side)

Both are ranked by impact-per-effort. Start from the top.

---

## Part A — Game enjoyment optimizations

### Context: what's shipped and where the gaps are

The game is already doing a lot well. Through v19 we have:

- Typed buildings (v12), weighted dispatch + pressure rings (v13),
  persistence (v14), oriented cars + delivery bursts (v15), houses as
  origins + per-building colour variation (v16), one-way roads + SVG
  toolbar (v17), score + gate colour + ambient decor (v18), pastel
  car palette + colour-tinted queues (v19).

The remaining joy gaps fall into four families:

1. **The player can't tell if their change helped** — the tweak → run
   → observe → tweak loop has a weak "observe" signal.
2. **The player has no pause button** — the sim runs while they
   plan, forcing them to use the demand slider as a pause proxy.
3. **No soft goals** — open sandbox with a score number, but nothing
   hints "here's something worth trying to do".
4. **Still silent** — sound.md is specced but not shipped.

Fix those four and the game moves from "cozy prototype" to "actually
engaging". Details below, ranked.

### A1 — Explicit Pause (~30 min work, huge UX win)

**The problem:** The current "pause" is dragging demand to 0. That
just stops new cars spawning — in-flight cars keep moving, queues
keep draining, pressure rings keep changing. If the player wants to
freeze the scene to study it, they can't.

**The fix:**
- Add a proper Pause button in the HUD (big icon, top-right).
- Space bar toggles it (already wired for `togglePause`).
- When paused: overlay a very subtle tint (e.g. cream @ 10% alpha)
  + a small "Paused" pill badge in the top centre. Sim is frozen —
  no car motion, no spawn, no pressure change, no timer tick.
- Player can still edit the network while paused. **Especially while
  paused** — this becomes the primary "planning mode".

**Why it matters:** This is the most common missing mechanic in fast-
iteration simulation games. *Every* Mini Metro/Mini Motorways player
reaches for pause. Giving it to them is a 30-line change that
unlocks a whole planning mindset.

### A2 — "Did that help?" sparkline (~1-2 hours)

**The problem:** Player adds a road. Did flow improve? Stay the
same? Get worse? No way to tell except vibes.

**The fix:** Replace (or augment) the current numeric Flow value in
the HUD with a tiny 60-second sparkline.

- 60 data points: `delivered-per-minute` sampled every second (last
  60 seconds).
- Draw as a 120×24 sparkline in the HUD.
- Colour: green if the current value is above the 60s average, red
  if below.
- A faint horizontal line at the peak value seen this session.

**Why it matters:** Instantly tells the player whether the last
change helped. This is the single biggest "feedback loop" lever in
the game, and it's missing. ([Feedback Loops — Game Design Toolkit](https://tkdev.dss.cloud/gamedesign/toolkit/feedback-loops/))

**Bonus:** A quick "peak flow this session" callout when the player
breaks their peak. Tiny dopamine hit for pushing harder.

### A3 — Sound pass — ship `sound.md` (~2-3 hours)

**The problem:** Silence. The design-pack and sound research both
flag this as the single biggest "this is a real game" signal. Still
not shipped.

**The fix:** Execute `docs/research/sound.md` Pass 1 only —
delivery chime + ambient pad + road-click. Skip the jam tone and
gate-open for now.

- Five-tone pentatonic scale: each building type has a pitch.
- Ambient pad: two detuned saws through lowpass, barely audible.
- Click on road-commit.
- Mute button in HUD (already-visible spec).

**Why it matters:** Most effective single polish lift-per-hour in
the entire roadmap. A game with sound feels *alive* in a way no
visual change can reproduce.

### A4 — Soft goals / "Aha, I just did X" toasts (~1-2 hours)

**The problem:** The sandbox doesn't hint at anything worth
attempting. Score number on HUD but no sense of milestones. Terraria
and Dwarf Fortress thrive on *incidental* goals the player stumbles
into — our game should too.
([Dwarf Fortress Steam — "no predefined goal"](https://steamcommunity.com/app/975370/discussions/0/3709307511570135965/))

**The fix:** A catalogue of milestones that trigger a toast when
incidentally hit. Not quests — no UI for them, no tracker, they
just *happen*.

**Full catalogue and implementation spec: `milestones.md`.**
30 milestones across 4 tiers (first-time / scale / craft / rare),
toast visual spec, grandfathering logic for existing saves,
acceptance criteria. Build session can paste the `MILESTONES`
object straight from there.

**Why it matters:** Gives the player a *reason to try things* they
wouldn't have tried otherwise. Zero cost to player freedom (no
forced objectives), pure upside. Mirrors Terraria's trick of
rewarding exploration with unexpected hits.

### A5 — Day/night tint (~1 hour)

**The problem:** The world never changes. It's always noon. Every
screenshot looks the same.

**The fix:** Implement `design-pack.md` §10 — 90-second day cycle,
multiply tint overlay, window-lit buildings at night, tiny grass-
point stars. Skip rush-hour demand for now; pure visual.

**Why it matters:** Every open session feels subtly different. Adds
the sense of *time passing* that sandbox games thrive on. Very high
lift-per-effort.

### A6 — "Why is this slow?" overlay (~2-3 hours)

**The problem:** A junction is backing up. Why? Is it the turn-rate?
Too many cars converging? A bad one-way choice upstream? Player has
no diagnostic tool.

**The fix:** An Inspect tool (icon: magnifying glass, keyboard `i`).
When active:
- Hover/tap any edge: show a small overlay with edge stats —
  *cars-per-minute passing through*, *average speed*, *backup length*.
- Hover/tap any building: show *incoming / dwell / visits-per-minute*.
- Hover/tap a node: show *connected edges, cars passing through per min*.

Sampling: keep a rolling 30s window per edge of "cars that passed
this frame". Minimal perf cost.

**Why it matters:** Turns the player from "flailing at problems"
into "diagnosing them". Cities Skylines' traffic-flow heatmap is
this move. It's the difference between cozy and *deep* sandbox.
Save for later if A1-A5 aren't shipped yet — but it's the pivot to
real depth.

### A7 — Pressure-ring differentiation past 100% (~30 min, known-issue P2)

**The problem:** Already filed as P2 bug by playtest. A shop with 3
incoming and a shop with 30 incoming render the same full-red ring.
The "THIS is the bottleneck" signal fails when you need it most.

**The fix:** Option (a) — let `pressure` exceed 1.0 and drive a
pulse intensity that scales. Option (b) — render a second thin inner
ring filling with `(incoming - capacity) / capacity`. Either works;
prefer (b) for clarity.

**Why it matters:** Existing mechanic broken at its best case. Low
effort to fix, high gameplay impact.

### A8 — Scenario picker (~4-5 hours, biggest replay lever)

**The problem:** Every new game starts from the same blank 4-gate
grid. Repetition sets in.

**The fix:** Implement RESEARCH Stage F with 3 hand-authored
starting scenarios:
- **Plains** (current default).
- **Coastal** — no E gate, N-S river with one bridge.
- **Two Districts** — two disconnected clusters, player must
  unify them.

Scenario data in `data/scenarios.json`. Splash shows a 3-scenario
picker after the Continue/Start-fresh choice.

**Why it matters:** Second reason to open the game tomorrow — "let
me try the coastal one". Doesn't fight the sandbox principle; it
*enhances* it. Biggest replayability lever available without
backend or randomness.

### A9 — Tiny procedural things that *move* (~1 hour)

**The problem:** Cars move; everything else is static. The scene
looks alive only where traffic is.

**The fix:** Add minimal ambient motion that's *not* distracting:
- Trees: very gentle 3% scale breathing cycle on a 4s sine. Each
  tree offset by its deterministic seed so they're not synchronised.
- Gate arrow: subtle 10% opacity pulse at 2 Hz to draw the eye.
- Road chevrons on one-ways: marching-ants effect, very slow (20u/s
  along the road).

**Why it matters:** Fills the "dead zones" of the map with gentle
motion. Matches the cozy/meditative vibe without becoming
distracting. Lose 10% of the "stillness is a feature" rule to buy
90% more "the world is alive".

Skip this for at least Pass B of design-pack. It's Pass G-tier
(juice).

---

### Player-side TL;DR

Ship in this order — each standalone, cumulative impact compounds:

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| A1 | Explicit pause | 30 min | ★★★★★ |
| A2 | Flow sparkline + peak callout | 1-2h | ★★★★★ |
| A3 | Sound (Pass 1 from sound.md) | 2-3h | ★★★★★ |
| A4 | Soft-goal milestone toasts | 1-2h | ★★★★☆ |
| A5 | Day/night tint | 1h | ★★★★☆ |
| A7 | Pressure-ring past-100% | 30 min | ★★★☆☆ |
| A6 | "Why slow?" inspect tool | 2-3h | ★★★★☆ (late-game) |
| A8 | Scenario picker | 4-5h | ★★★★★ (replay) |
| A9 | Micro-motion (trees, arrows) | 1h | ★★☆☆☆ |

Total for the "must-ship" ★★★★★ set (A1-A5 minus A4): **~6 hours
of build time**. That gets the game from cozy prototype to a solid
cozy *game*.

---

## Part B — Development workflow optimizations

The three-session pattern is working. Zero merge conflicts across
20+ ships. But there are specific frictions worth addressing.

### B1 — Playtest cadence: auto-run on every ship (biggest dev win)

**The problem:** Playtest last ran at v13. The build session has
since shipped v14 through v19 — six ships without a QA sweep. The
P1 persistence bug is almost certainly fixed by v14, but nobody has
confirmed it and moved it to Resolved. Bugs are piling up silently
against a stale known-issues list.

**The fix:** Change the playtest protocol (README.md) to trigger on
every commit, not ad-hoc:

> Before starting any new bug-review work, run `git log --oneline
> HEAD..<last-reviewed>` (recorded in the top of `playtest-log.md`).
> If the diff shows any `vN:` commits not yet reviewed, review each
> in order before doing anything else. Close known-issues that the
> diff fixed (move to Resolved with the fix commit hash). File new
> ones if you spot regressions.

**Also:** When the user wakes the playtest session, the FIRST ask
should be "catch up on recent versions" rather than "find me a
bug". Make it habit.

**Why it matters:** Without this, bugs compound silently. A P1 fixed
in v14 still shows as P1 open at v19, confusing everyone. Also, code
review catches regressions in the *new* code — fresh diffs are
easier to audit than 6-commit-deep ones.

### B2 — Research session sweeps NOTES on every turn

**The problem:** `RESEARCH.md` status lags reality. I marked
"Stage A complete" after v13, but didn't update after v14-v19. When
the user asks "where are we?", the research doc doesn't answer
honestly.

**The fix:** Research session's first action every turn:

1. `git pull --rebase`.
2. Read the top N entries of `NOTES.md` "Shipped log" since last
   status update.
3. Update `RESEARCH.md` STATUS block to reflect reality.
4. *Then* do whatever the user asked.

**Why it matters:** The research doc is the source of truth for
"what's shipped". If it's stale, the whole coordination chain is
lying to itself.

### B3 — Tighten ship granularity

**The problem:** v18 shipped as one commit: "score system + colour-
coded gates + ambient decor + new favicon". That's 4 features. If
the score system has a bug, reverting v18 takes out three healthy
features too.

**The fix:** Soft convention: *one feature per commit*. Multi-
feature commits are allowed for true "paired" changes (e.g. "add
tool X + its keyboard binding"), but the target is one concept per
ship. The commit subject should name *one* thing, not four.

Playtest sessions benefit: reviewing a single-feature diff is 5x
faster than reviewing a 4-in-1.

**Why it matters:** Reverts become safe. Bug attribution becomes
trivial. Each commit becomes a legible journal entry.

### B4 — Single source of truth for "what the game currently is"

**The problem:** The truth about the current feature set is spread
across: `NOTES.md` Shipped log, `RESEARCH.md` STATUS block,
`docs/testing/known-issues.md`, and the code itself. No single doc
says "here's what the game does today, bullet points, from scratch".

**The fix:** Add a `## Current features` section at the top of
`NOTES.md` (owned by build session) — a simple bullet list of
player-facing features in the game *right now*. Updated when a
feature ships. Removed when a feature is cut.

Example:
```markdown
## Current features (what the player can do today, v19)

- Drag roads (with orthogonal snap)
- Build Bridges over existing roads
- Convert junctions to Roundabouts
- Toggle roads to One-way
- Erase any road
- Place Houses, Shops, Malls
- Undo last edit (one level)
- Manual demand slider (0×–3×)
- Persistence (save + Continue vs Start fresh)
- Score, Best score, People HUD, Flow HUD
```

Takes 60 seconds to maintain. Massive clarity win for any new
session or the user.

**Why it matters:** First question the user or a new session asks
is always "what does this game actually do?". Answering it from
Shipped-log archaeology is inefficient.

### B5 — Pre-ship checklist per commit

**The problem:** New features sometimes miss trivial cross-cutting
cleanups (e.g. updating the test plan, adding the tool's keyboard
shortcut, adding it to the undo stack).

**The fix:** Three-line checklist the build session runs through
mentally before each push:

```
Before `git push`, check:
[ ] Keyboard shortcut wired if relevant
[ ] Undo records the action if relevant
[ ] Persistence schema updated if new state field added
[ ] NOTES.md Shipped log updated
[ ] If this is a user-visible feature, NOTES.md Current features updated
```

Not a big process. Just a cache of the 5 things that are otherwise
easy to forget. Build session can paste it into the top of their
turn.

**Why it matters:** Catches the specific regressions we keep
seeing (undo not inverting cleanly, persistence schema drift).

### B6 — "Known-issues alive" — periodic cull

**The problem:** Bug lists decay. Fixed bugs not moved to Resolved.
Outdated bugs not culled. Resolved sections grow infinitely.

**The fix:** Every ~10 ships or so, playtest session spends a turn
on *just* the bug list: re-verify every "open" bug still repros;
close or update as needed. Delete Resolved entries older than 20
ships (keep only recent).

**Why it matters:** A trustworthy bug list is the difference
between "list is truth" and "ignore the list, just report new
issues". Decay kills its usefulness.

### B7 — Feature-flag scaffold for WIP work

**The problem:** Build session can only ship complete features. If
they want to get half a feature in front of the user for feedback,
they can't without polluting main.

**The fix:** Tiny scaffold in `game.js`:

```js
const FLAGS = {
  dayNightTint: false,
  sparkline: false,
  inspectTool: false,
  // etc.
};
```

Query-string overrides for testing:
`traffic-fix-game.vercel.app/?flags=dayNightTint`.

Each feature-in-progress guards render/update calls behind the flag.
When shipping, flip to `true` and optionally delete the flag in a
follow-up commit.

**Why it matters:** Lets build session make bigger changes in
smaller increments without gating merges. Good practice from every
real shipping team.

### B8 — Auto-version tagging

**The problem:** Every commit says `vN:` manually. Someone will
mis-number eventually. Also no machine-readable version.

**The fix:** A tiny `version.json` at project root:
```json
{ "version": "v19", "shipped": "2026-04-24" }
```

Read it in `game.js`, render tiny version label in the HUD corner
(12px, 40% alpha). Updates on every commit.

Also helps playtest: "the game reports v19 but I'm testing v20's
diff — mismatch" becomes a visible alert rather than a mystery.

**Why it matters:** Cheap insurance against coordination drift.

---

### Developer-side TL;DR

| # | Optimization | Effort | Impact |
|---|--------------|--------|--------|
| B1 | Playtest auto-runs on every ship | 10 min (protocol edit) | ★★★★★ |
| B2 | Research session sweeps NOTES each turn | 5 min per turn | ★★★★☆ |
| B3 | One-feature-per-commit discipline | Zero (just habit) | ★★★★☆ |
| B4 | `Current features` section in NOTES.md | 60s per ship | ★★★★☆ |
| B5 | Pre-ship checklist (5 items) | 30s per ship | ★★★☆☆ |
| B6 | Periodic bug-list cull | 1 playtest turn per 10 ships | ★★★☆☆ |
| B7 | Feature-flag scaffold | 30 min one-time | ★★★☆☆ |
| B8 | `version.json` + HUD label | 15 min one-time | ★★☆☆☆ |

The three-session pattern is working beautifully. These are
*refinements*, not fixes. B1 is the single highest-value change
and should go live immediately.

---

## Things deliberately NOT recommended

To calibrate: here's what the research considered but rejected for
this project.

- ❌ **Multiplayer / shared cities.** Violates single-file static
  deploy. Also dilutes the "design a city, admire it" thesis.
- ❌ **Random events (accidents, roadworks).** Would re-introduce
  the Mini Motorways "react to chaos" loop we've explicitly rejected.
- ❌ **An economy (money to build roads).** Breaks the tweak-freely
  loop that's core to the fun.
- ❌ **Achievements UI.** Soft goals via toasts (A4) do the same job
  without the dashboard overhead.
- ❌ **Mod support / user scripts.** Massively out of scope.
- ❌ **Tutorialisation.** The game is already 10-seconds-to-grasp.
  Adding a tutorial would be a regression.
- ❌ **Full accessibility pass.** Deferred to a dedicated session
  when the game is feature-stable.

---

## Recommended action right now

**For the user:** run the playtest session to catch it up on
v14-v19 (close the P1 persistence if v14 actually fixed it, file
anything new). Then have the build session ship **A1 (pause)** next
— it's 30 minutes and removes the single biggest friction in the
current UX.

**For the build session** (prompt to paste next):

```
Before any new feature: read docs/research/optimization.md.
Ship A1 (explicit Pause) first — ~30 minutes. Then A2 (flow
sparkline). Then A3 (sound, Pass 1). Each as its own commit / its
own version. Update NOTES.md "Current features" as you go (add
that section if it doesn't exist yet — it's called out in B4 of
the optimization doc).
```

**For the research session** (me, next turn): update RESEARCH.md
STATUS block to reflect v14-v19 (done in this commit already).
When A1-A3 ship, update again. Stop letting status drift by 6
ships.

## Sources

- [Feedback Loops — Game Design Toolkit](https://tkdev.dss.cloud/gamedesign/toolkit/feedback-loops/)
- [Machinations.io — Game systems: Feedback loops](https://machinations.io/articles/game-systems-feedback-loops-and-how-they-help-craft-player-experiences)
- [Arcade Rage — How Feedback Loops Work in Game Design](https://arcaderage.co/2018/02/11/game-design-feedback-loops/)
- [Medium — Feedback Loops in Game Economics](https://medium.com/super-jump/feedback-loops-in-game-economics-7327f740d2e8)
- [Derek Yu — Indie Game Dev: Death Loops](https://www.derekyu.com/makegames/deathloops.html)
- [Kokutech — Playtest Your Indie Game](https://www.kokutech.com/blog/gamedev/tips/development/guide-for-prototype-testing-for-indie-game-devs)
- [Wayline — Creating Compelling Game Prototypes: Fast Iteration](https://www.wayline.io/blog/creating-compelling-game-prototypes-fast-iteration)
- [Game Design Skills — How to Apply the Iterative Process in Game Design](https://gamedesignskills.com/game-design/iterative-process/)
- [Terraria — Psychological Rewards in Games](https://omnomgames.wordpress.com/2013/10/14/terraria-psychological-rewards-in-games/)
- [Dwarf Fortress Steam — "What is the goal?"](https://steamcommunity.com/app/975370/discussions/0/3709307511570135965/)
- [Factorio sandbox reviews (Metacritic)](https://www.metacritic.com/game/pc/factorio/user-reviews)
