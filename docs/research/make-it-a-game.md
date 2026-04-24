# Make it a game — diagnosis + fix

The user's instinct: *"it has a lot of the functionality but it doesn't
feel like a fun process to engage in."*

They're right. This doc explains why, and what to do about it — without
abandoning the designer-driven principle we committed to.

## The diagnosis: we built a toy, not a game

Game designer Chris Crawford's classic test: a **toy** does whatever
you tell it; a **game** has structured challenges and goals. A doll
is a toy; chess is a game. Minecraft's creative mode is a toy;
Minecraft's survival mode is a game.

**Right now our project is Minecraft creative mode — with nothing to
survive against.** The player can:
- Place roads freely
- Place buildings freely
- Move cars (well, the cars do)
- Watch pretty animations
- Accumulate score (but score means nothing)

What's missing is **forward pull**. The reason to keep playing after
minute 3.

Quote from the game-design research:
> *"A child playing in a sandbox needs a lot of direction to have
> fun — they need toys first and ideas of things they can do with
> them."*
> ([GameDev.tv — Sandbox Game Design](https://gamedev.tv/articles/game-design-deep-dive-sandbox-games))

We've built the sandbox. We haven't built the ideas-of-things-to-do.

## Why we got here — the three honest reasons

### Reason 1: We correctly rejected Mini Motorways' pressure source

Mini Motorways creates pull via *random building spawns + capped
tiles + a hard fail state*. We rightly said no — the "scramble to
keep up with chaos" feel wasn't what we wanted. But we removed the
pressure **without replacing it with anything**.

### Reason 2: "Sandbox mode" was an intent, not a design

We locked in "no fail state, no forced anything" as a principle —
but principles aren't mechanics. Townscaper, Dorfromantik, and
Islanders *also* avoid hard fail states, and they're still fun —
because they replaced fail states with *something else*. We didn't.

### Reason 3: We made the demand slider *the whole loop*

The current "gameplay" is: set demand, watch, fix, repeat. That's
the *testing harness* for a game, not a game. No scenario compels
the player to crank demand. No milestone rewards keeping the city
flowing. No surprise emerges from the system.

**This is fixable. We don't need to tear anything down. We need to
add forward pull that fits the designer-driven ethos.**

## What "game feel" actually requires (the four missing pillars)

Research across cozy city-builders converges on four mechanisms that
create fun *without* chaotic pressure:
[(Game Developer — Sandbox History)](https://www.gamedeveloper.com/design/the-history-and-theory-of-sandbox-gameplay),
[(GameDesigning — Creativity at Scale)](https://gamedesigning.org/beyond/designing-for-creativity-at-scale-how-sandbox-games-balance-freedom-and-structure/).

### 1. A closed reward loop

Islanders: place buildings → score → score unlocks more buildings
to place → loop. The player's **own success generates new toys**.

Dorfromantik: draw tile → match to board → match bonuses refill the
tile stack → loop. Success extends your play time.

**We have score but no loop.** Score just counts up and does
nothing. Need: score or deliveries or population must generate
something the player gets to use next.

### 2. A soft constraint that creates pacing

Dorfromantik ends when the tile stack runs out. Not a *failure* —
just a natural conclusion. This creates tempo: every placement
matters a bit, but never so much that it stresses.

**We have no constraint.** Sessions have no natural shape —
beginning, middle, end don't exist. Need: some gentle way to say
"this run has progressed" without punishing.

### 3. Endogenous escalation

SimCity: your successful city grows its own population. More
population = more cars = more demand = design challenge. The
pressure comes *from the player's own success*, not from random
events.

This is the key mechanism our ethos demands. Player designs a good
city → city succeeds → city attracts more residents → player has a
new design problem. All three steps are the player's work. The game
just reports the consequences.

**We have none of this.** Placing more Houses directly adds cars,
but there's no *reason* to place more Houses. The city doesn't
grow because it's working.

### 4. Story / identity

Townscaper and Tiny Tower both give the player *something to name
and point at*. "This is my town. This is Maple Bay." The player's
emotional attachment is what keeps them coming back.

**Our game has zero of this.** The city has no name, no
personality, no history. You can't say "look at my city" — only
"look at these roads".

## Five design mechanisms that fit our ethos

Each maps to one of the missing pillars. None of them violate the
"player designs everything" principle. None of them introduce
random spawns. Some we already have partial work toward.

### M1 — Organic population growth from successful deliveries

**Concept:** Every N successful deliveries (N varies by building
type), the **game asks** if the player wants to add a new House.

It doesn't place anything — it shows a ghost-building at a plausible
location near the current network and a toast: "Your city is
growing — place a new house?". Player can:
- **Accept** — places the house at that spot (they can also drag
  to reposition before committing).
- **Place elsewhere** — opens House tool, player places wherever.
- **Dismiss** — next prompt in ~30s.

Every Xth prompt is for a Shop or Mall instead. Frequency scales
with current People count: early-game prompts every ~60s, later
every ~20s.

**Why this fits us:** player still places everything (designer-
driven). Forward pull comes from "your city wants to grow" — a
*positive* invitation, not a negative threat. Escalation is
endogenous: more people → more deliveries → more prompts → more
people. The player's own success generates the next design
challenge.

**Why it's fun:** Every successful run of deliveries produces the
satisfaction of "my city is growing". Seeing 50 → 200 → 500 people
feels like real progression. The game starts *telling a story*
about the city succeeding.

**Ship:** Modest — new state field (`state.growthCooldown`), new
prompt UI reusing the toast infrastructure, ghost-building render
(already have code for drag preview).

### M2 — Scenario objectives (not quests — just targets)

**Concept:** Each scenario in `scenarios.md` has 2-3 **targets**
shown at the top of the HUD when that scenario is active.

Coastal targets:
- 🟦 Deliver 100 cars
- 🏛 Connect both sides of the river
- 🧭 Keep jam under 0.5 for 5 continuous minutes at 2×+ demand

When a target is hit: big burst, toast, the target badge lights up
permanently for that save slot. **No fail** — if the player never
hits a target, nothing bad happens.

Plains (the sandbox default) has a single soft target: *"Reach 500
People"*. That's it. The goal is deliberately loose so Plains still
feels like a pure sandbox.

**Why this fits us:** targets are optional, not required. Sandbox
feel preserved, but now there's *something to aim at* if the player
wants.

**Why it's fun:** Gives sessions shape. The player can say "I'll
try to hit the third target tonight". Ending a session feels
earned: "I got two of three — good run."

Different from Milestones (`milestones.md`) — milestones are
incidental, discovered. Targets are *visible*, *chosen per
scenario*, *primary progress markers*.

**Ship:** Add `targets[]` to scenario JSON. HUD widget showing
scenario name + 2-3 target pills with progress fill. Check-on-
event similar to milestones.

### M3 — Time-gated tool unlocks (Mini Motorways' weekly draft, ours)

**Concept:** Every 3 minutes of played time, **one new
tool/feature becomes available** with a fanfare moment.

Order of unlocks (after the starter toolkit of Road + Erase):

- Minute 3 — **House** tool
- Minute 6 — **Shop** tool
- Minute 9 — **Mall** tool
- Minute 12 — **Roundabout** tool
- Minute 15 — **Bridge** tool
- Minute 18 — **One-way** tool
- Minute 21 — **Traffic Light** tool (to be built — Stage C)
- Minute 24 — **Highway** tool
- Minute 27 — **New entry gate** opens on a random side (with
  preview), bringing more external traffic

When a tool unlocks: sim pauses briefly (like 300ms), a card slides
in: "Unlocked: **Roundabout** — tap any 3+ way junction to convert."
Player taps to dismiss. Tool is now in the palette.

**Alternate mode toggle:** for players who want every tool
available from the start, a "Free play" toggle on the splash skips
the unlock progression.

**Why this fits us:** new toys arrive on a rhythm the player can
feel. Every unlock is a *gift*, not a threat. Creates a reason to
keep playing: "wait — what unlocks next?"

**Why it's fun:** Mini Motorways' single best pacing device,
adapted. Each session has a built-in arc of "starter tools → more
options → complex city design" that feels like natural progression.

**Ship:** Time-tracking state field. `UNLOCKS[]` array. Unlock
card UI reusing the pause overlay style. `Free play` toggle on
splash.

### M4 — City identity: name, headlines, weekly summary

**Concept:** Three small additions that make the city feel like *a
place*, not a grid:

**a) City name** — set on new-game. Procedurally suggest one
("Maple Bay", "Port Harlow", "Tealwick") via a seeded random. Player
can rename from a settings cog. Name appears in the HUD corner.

**b) Weekly summary** — every ~3 minutes (aligns with unlock
cadence), a card slides in: "**Week 4 in Maple Bay.** 47 new
residents, 342 deliveries, peak flow 18/min. New this week:
Roundabout tool unlocked. Best district: North." Player taps to
dismiss. Sim continues. Gives each session a chapter structure.

**c) News ticker** — every ~45s during play, a one-line toast at
the bottom: *"Traffic at the North gate is backed up."*  *"The
downtown mall is bustling."*  *"The Maple Bay council approves a
new residential development."* Procedurally generated from current
state (look at which gate has queue, which building has highest
visits, etc). Adds flavour without mechanics.

**Why this fits us:** zero gameplay impact — pure flavour. But
flavour is what separates a *game* from a *simulation*. The city
becomes something the player can talk about.

**Why it's fun:** emotional attachment. When a player says "my
Maple Bay" instead of "the game", you've won. The weekly summary
makes every session feel like an *instalment*, not a fresh slate.

**Ship:** Three small modular pieces, can ship independently.
Name-generator is ~40 lines of word-bank code. News-ticker is a
rules engine of ~20 rule patterns. Weekly summary is a card
triggered on the unlock timer.

### M5 — A closed score loop via "civic investments"

**Concept:** Score no longer just counts up. Every 500 score
earned, the player gets to spend 500 score on a **civic
investment** — a one-off upgrade to something they've already built.

Investments (pick one from a card of 2-3):

- **Upgrade the largest Shop to a Mall** (gains size, demand, +2
  score/visit).
- **Build a beautification pass**: sprinkle 20 trees/benches along
  every road (pure cosmetic but *lovely*).
- **Sponsor a new bridge over a river** (free Bridge placement
  anywhere crossing terrain).
- **Civic park**: place a small park polygon anywhere (cosmetic,
  adds +1% to delivery score within its radius).
- **Gate expansion**: widen one gate — doubles its incoming car
  rate.

Score balance resets to 0 after the investment. A running "Total
spent on city" stat appears on the HUD so the score never feels
lost, just *transformed*.

**Why this fits us:** Closed loop. Score is now *something*, not a
number. Each investment is the player's choice — designer-driven.
The city physically evolves as investments land.

**Why it's fun:** The best kind of reward — a choice, not a
trinket. Each investment is a small "what do I want most right
now?" moment. The city looks *visibly different* after each one.

**Ship:** Largest mechanic of the five. Needs the investment card
UI, the pool of ~8-12 investment types, the state tracking for
"where did this Mall come from" so upgrades can target correctly,
and the beautification system (trees/benches) which partially
exists already.

## What we're NOT going to add (the anti-patterns we correctly rejected)

Reconfirming, so we don't drift:

- ❌ **Random building spawns** — the Mini Motorways chaos. Player
  places everything.
- ❌ **Hard fail state** — jam meter stays a signal, never an
  ending.
- ❌ **Forced objectives / quests** — targets (M2) are *soft*. No
  "must do X to proceed".
- ❌ **Tile budget** — roads stay free-form.
- ❌ **Scored runs with timer** — open-ended sessions stay.
- ❌ **Tutorial** — the game is 10-seconds-to-grasp.
- ❌ **PvP / multiplayer** — single-player, single-file deploy.

## The ship plan — from toy to game in 4 commits

Everything above is a lot. Prioritise by what fixes the
most-broken pillar with least work.

### Ship G1 — **City identity** (M4a + M4c) — ~2 hours

Name the city. Add the news ticker. That's it. *Before the game
is a game, it needs to be a place.*

Ship as v27 or whenever. Visible change: the city has a name. Toasts
appear. The game feels like it's *happening somewhere*.

Why first: zero mechanical risk, pure flavour. Immediately shifts
the feel without changing any systems.

### Ship G2 — **Organic growth prompts** (M1) — ~3 hours

The player's successful city *asks to grow*. This is the single
biggest "make it feel like a game" lever. Adds pull without
changing principles.

Ship as the next feature after G1.

Why second: creates the forward pull. Every other pillar leans on
this.

### Ship G3 — **Time-gated unlocks** (M3) — ~3 hours

Starter tools only; unlock progression via minute counter;
alternate Free Play toggle on splash.

Ship third.

Why third: this gives the session *shape*. Combined with G2, every
session now has "new people → new tools → more city" rhythm.

### Ship G4 — **Scenario targets + weekly summary** (M2 + M4b) — ~4 hours

Each scenario gets 2-3 targets shown in HUD. Every 3 minutes a
weekly summary card appears. These work together as the session-
structure layer.

Ship fourth (after scenarios.md S1-S3 have landed).

Why fourth: depends on scenarios being in place. Completes the
game-feel transformation.

### Ship G5 — **Civic investments** (M5) — ~5 hours (LATER)

The closed score loop. Adds depth and choice. Big-ish lift.

Ship when G1-G4 have settled and we want the next engagement
layer.

## Acceptance test — does it feel like a game now?

After G1-G4 ship, try the following:

1. Open the game. Do you see the city's name?
2. Over a 10-minute session, does at least one of: a growth prompt,
   a tool unlock, a weekly summary, or a target completion fire?
3. At the end of the session, can you describe what *happened* in a
   sentence that isn't "I placed some roads"?
4. Do you want to keep the session running to see what unlocks
   next?
5. When you close the tab, do you feel like you were playing
   something — not just testing it?

If you can answer yes to 4/5: we're a game. If 5/5: we're a game
that people will talk about.

Current state (pre-G1): probably 1/5. That's the gap we're
closing.

## Why I believe this works

Three games ship this exact pattern with different skins:

- **Mini Metro** — station pressure + weekly upgrade draft + map
  growth = forward pull. No random placement (player draws lines).
  Calm surface, real game underneath.
- **Islanders** — place-for-score → score unlocks → place more. Pure
  closed reward loop. No fail state. Deeply enjoyable.
- **Tiny Tower / Pocket City** — city name, residents with names,
  news headlines, gentle time progression. No hard pressure, lots
  of pull.

All three are loved. All three are calm. All three have exactly
the four pillars we're about to add. We're not inventing anything
— we're importing proven mechanisms, styled to fit our palette.

## Sources

- [GameDev.tv — Sandbox Games Deep Dive](https://gamedev.tv/articles/game-design-deep-dive-sandbox-games) — the "toy vs game" framing.
- [Game Developer — Sandbox Gameplay Theory](https://www.gamedeveloper.com/design/the-history-and-theory-of-sandbox-gameplay) — structure enables creativity.
- [GameDesigning — Creativity at Scale](https://gamedesigning.org/beyond/designing-for-creativity-at-scale-how-sandbox-games-balance-freedom-and-structure/) — freedom via structure.
- [Moll About Games — Sandbox Mode: Game or Toy?](https://mollaboutgames.wordpress.com/2019/04/24/simulation-sandbox-mode-game-or-toy/) — direct analysis of the exact problem.
- [Dorfromantik Analysis (Aidan Pohl)](https://aidandanielpohl3637.wordpress.com/2022/02/28/dorfromantik-game-analysis/) — the tile-stack-as-soft-constraint pattern.
- [The Hyperbolic Gamer — Townscaper vs Dorfromantik](https://thehyperbolicgamer.com/2021/04/20/game-review-townscaper-and-dorfromantik-a-tale-of-two-citybuilders/) — toy-commitment vs game-commitment.
- [Electron Dance — Every Click Has Meaning](http://www.electrondance.com/every-click-has-meaning/) — on cozy games having weight.
- Our own `docs/research/fun.md` — the existing "design-and-observe" thesis we're now extending.
