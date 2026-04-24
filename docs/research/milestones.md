# Milestones — soft goals via toasts

Full spec for `optimization.md` A4. This doc is the canonical list —
`optimization.md` just points at it.

## What a milestone is (and isn't)

A **milestone** is a one-time toast that fires when the player
incidentally does something worth celebrating. Examples: first Mall,
first 100 people, one minute at 3× demand without a jam.

They are **not**:
- Quests (no objective UI, no tracker).
- Achievements (no dashboard, no badge gallery).
- Rewards that change gameplay (no unlocks, no new tools).

They are **stumbled-into recognition**. The player didn't try to hit
them. The game noticed they did something good. Fire-and-forget.

The design rule: *after reading the toast, the player should feel
"oh nice, I didn't know that was a thing" — not "oh, I should try
for the next one".* If it nudges them toward grinding a specific
target, it's not a milestone — it's a quest.

## The catalogue

30 milestones across 4 tiers. Build session can ship all 30 in one
pass; each is just a condition-check + toast string.

### Tier 1 — First-time (the onboarding beats)

Fire the very first time the condition is met. Never again for this
save.

| id | trigger | toast |
|---|---|---|
| `first-delivery` | `delivered >= 1` | "First delivery!" |
| `first-visit` | Any `block.visits >= 1` | "Cars are visiting your city." |
| `first-house` | First House placed | "Residents moving in." |
| `first-shop` | First Shop placed | "Open for business." |
| `first-mall` | First Mall placed | "A proper mall. Good taste." |
| `first-roundabout` | First Roundabout placed | "Roundabout beats lights, every time." |
| `first-bridge` | First Bridge placed | "Nothing stops a good engineer." |
| `first-oneway` | First One-way road | "One-way streets can transform a city." |
| `first-pause` | First time Pause is used | "Plan calmly. Nothing moves while you think." |
| `first-undo` | First Undo pressed | "Back to the drawing board." |
| `all-gates` | All 4 gates connected to road network | "All gates connected." |

### Tier 2 — Scale milestones (the "city grows" beats)

Fire the first time each threshold is crossed. Never again.

| id | trigger | toast |
|---|---|---|
| `people-10` | `state.peopleCount >= 10` | "Your town exists." |
| `people-50` | `>= 50` | "A neighbourhood." |
| `people-100` | `>= 100` | "100 residents." |
| `people-250` | `>= 250` | "A proper town." |
| `people-500` | `>= 500` | "500 people call this home." |
| `score-100` | `score >= 100` | "Score 100." |
| `score-500` | `>= 500` | "Score 500 — going places." |
| `score-1000` | `>= 1000` | "Score 1 000." |
| `score-5000` | `>= 5000` | "Score 5 000. That's a lot of deliveries." |
| `delivered-100` | `delivered >= 100` | "100 cars delivered." |
| `delivered-1000` | `>= 1000` | "1 000 deliveries. Thanks for driving." |

### Tier 3 — Craft milestones (the "you're playing well" beats)

Conditions require sustained / precise behaviour. Fire once per save.

| id | trigger | toast |
|---|---|---|
| `smooth-city` | Continuous 60s at demand ≥ 2×, jam meter under 0.3 the whole time | "Smooth city — flow mastered." |
| `stress-tested` | Continuous 60s at demand ≥ 3×, jam meter under 0.5 | "Stress-tested. Infrastructure holds." |
| `best-beaten` | `score` exceeds previous `best` by 20%+ | "Personal best — by a mile." |
| `roundabout-3` | 3+ roundabouts on the map | "You've become a roundabout enthusiast." |
| `grid-city` | 6+ buildings, all placed on grid intersections | "The grid planner emerges." |
| `bridge-over-bridge` | Two bridges crossing each other | "Infrastructure layers." |
| `malls-3` | 3+ Malls | "Retail empire." |

### Tier 4 — Rare / discovery (the easter eggs)

Fire once per save, only if the condition is actually met (some of
these are rare enough they may never fire — that's fine).

| id | trigger | toast |
|---|---|---|
| `no-jam-1k` | Reach `delivered >= 1000` without jam meter ever going above 0.4 in this save | "1 000 clean deliveries. Immaculate." |
| `one-road-empire` | Reach `people >= 50` with only the starter W↔E road + its direct branches (no demolitions of starter) | "One long road. Impressive restraint." |
| `perfect-hour` | Game time ≥ 60 min, jam meter never exceeded 0.6 | "An hour without a single gridlock." |

Rare milestones should fire even if an earlier-tier one in the same
category hasn't — they don't gate each other.

## Implementation sketch

```js
// state additions — hydrate from the active scenario's save blob
state.milestonesSeen = new Set(activeSave.milestonesSeen || []);

// one definition per milestone
const MILESTONES = {
  'first-delivery': {
    check: s => s.delivered >= 1,
    toast: 'First delivery!'
  },
  'people-100': {
    check: s => s.peopleCount >= 100,
    toast: '100 residents.'
  },
  'smooth-city': {
    check: s => s.continuousFlow60s && s.demandMult >= 2 && s.peakJamIn60s < 0.3,
    toast: 'Smooth city — flow mastered.'
  },
  // ... all 30
};

function checkMilestones() {
  for (const [id, m] of Object.entries(MILESTONES)) {
    if (state.milestonesSeen.has(id)) continue;
    if (!m.check(state)) continue;
    state.milestonesSeen.add(id);
    showToast(m.toast, { kind: 'milestone', duration: 3500 });
  }
}
```

Call `checkMilestones()` at most **once per second** (not every
frame) from `stepSim` — cheap because most `check` functions are
O(1) and the `Set.has` lookup is O(1).

### Persistence (per-scenario)

**Scope:** milestones are tracked **per scenario**, not globally
per-player. First mall in Plains should not block first mall in
Coastal — the discovery moment matters each time.

- Store `milestonesSeen` (array) inside each scenario's save blob
  at `localStorage['traffic-flow:v1:<scenarioId>']`. Not a separate
  key.
- On load, hydrate `state.milestonesSeen` from the active save.
- On save, serialise `Array.from(state.milestonesSeen)` back in.
- "Reset this scenario" wipes that scenario's milestones along with
  the rest of the save. Other scenarios are untouched.
- When `scenarios.md` S2 ships, migration code should delete any
  legacy `localStorage['tf:milestones']` key — it's per-player and
  no longer used.

### Toast visual

Distinct from the current "Nothing to undo" toasts so the player
knows this one is *good news*.

- Slide up from bottom, 3.5s duration, ease-in then ease-out.
- Background: pale sage (`#c8e0c8`) with the accent terracotta
  border on the top edge only (2px).
- Text: `ink` colour, 15px, medium weight.
- Tiny rosette icon on the left (16px SVG, pre-rendered) — the
  "milestone" marker.
- Fade out over the last 400ms.

If multiple milestones fire on the same second (e.g. the player
imports a save that already qualifies for 10), stack them — fire
one every 800ms so the player can read each. Max 3 in the queue;
silently drop the rest.

### First-load grandfathering

When the milestone system ships, existing save files have no
`milestonesSeen` set. If we fire every applicable milestone on
load, the player gets a 20-toast spam.

**Solution:** on first load after the feature ships, check every
milestone *silently* — mark as seen any that already qualify, but
don't fire toasts. Any new milestone crossed from that point on
fires normally.

```js
function grandfatherMilestones() {
  if (localStorage.getItem('tf:milestones-initialized')) return;
  for (const [id, m] of Object.entries(MILESTONES)) {
    if (m.check(state)) state.milestonesSeen.add(id);
  }
  persistMilestones();
  localStorage.setItem('tf:milestones-initialized', '1');
}
```

Run once after `loadState()` in boot.

## Acceptance criteria

- [ ] Every toast in the catalogue fires at most once per save.
- [ ] Toasts visually distinct from error/info toasts.
- [ ] Multiple simultaneous triggers stack, not overlap.
- [ ] Grandfathering works — no toast spam on first update.
- [ ] `milestonesSeen` persists across refresh.
- [ ] "Start fresh" clears milestones.
- [ ] `checkMilestones()` runs ≤ 1 Hz, not per-frame.

## Design rules for future milestones

When you want to add a new one, check it against these:

1. **Would a player gaming this milestone degrade their experience?**
   If yes, it's a quest, not a milestone. Reject or rework.
   (e.g. "place 100 Houses" would make the player grind houses they
   don't need. Reject.)

2. **Is the toast copy three words or fewer per sentence?**
   Longer reads like a quest prompt. Tighten.

3. **Could the player fire this by accident?** Good. If they have
   to *work* for it, it's a quest.

4. **Does the condition require a stopwatch to verify?**
   (e.g. "60s continuous") Fine, but needs careful tracking state
   (see "smooth-city" which needs `continuousFlow60s` and
   `peakJamIn60s` — small dedicated sliding-window trackers in
   `stepSim`).

5. **Is the toast celebratory, not instructional?** "First mall!"
   = good. "Build a mall!" = bad (that's a prompt).

## Don't

- Don't surface a "milestones" page or counter. The toasts are the
  whole UI.
- Don't gate features behind milestones. Everything stays always-
  available.
- Don't give points or score bonuses. That warps the scoring
  balance.
- Don't stack audio — one chime per toast, same as a delivery.
  (Sound lands with `sound.md` pass 1 — milestone toast triggers
  a pentatonic A5 chime when audio is live.)
- Don't localise yet. Copy is English-only, v1. Externalise strings
  later if we ever internationalise.

## Sources / references

- [Terraria — Psychological Rewards in Games](https://omnomgames.wordpress.com/2013/10/14/terraria-psychological-rewards-in-games/)
  — the "discovery feels like a reward" principle.
- [Dwarf Fortress — "What is the goal?" (Steam)](https://steamcommunity.com/app/975370/discussions/0/3709307511570135965/)
  — player-set goals in sandbox games.
- Our own `docs/research/fun.md` — the "5 aha moments" set that
  these milestones lean into.
