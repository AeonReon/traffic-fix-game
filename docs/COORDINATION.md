# Session coordination board

Two Claude Code sessions working on this project in parallel. This file is
the shared status board — read it before starting, update your section when
you finish a chunk. Keep it tight; long-form stuff lives in other files.

## Roles

- **BUILD session** — iterates on game code (`index.html`, `style.css`,
  `js/`, `data/`, `scripts/`). Ships features. Reads research output, picks
  what to implement next. **Does not write research docs.**
- **RESEARCH session** — writes docs only (`docs/research/*.md`). Analyses
  Mini Motorways and similar, distils actionable recommendations, proposes
  the next few features with rationale. **Does not touch game code.**

**Both sessions:** may read anything. May edit their OWN section of this
file. Never edit the other session's section — surface asks in the "For the
other session" subsection or in "Questions for the user".

## Current state (as of v11)

**Live:** https://traffic-fix-game.vercel.app
**Repo:** https://github.com/AeonReon/traffic-fix-game
**Architecture reference:** `NOTES.md` in project root — read that first to
catch up on decisions + file layout.

Short version of what's built:
- Portrait pixel-space canvas, 1200×1560 logical, 60-unit grid.
- Four edge gates (N/S/E/W); cars enter, pass through to another gate.
- Drag-to-build roads with snap to nodes, edges, or grid points; T-junctions
  auto-form when a drag endpoint lands on an existing road; explicit Bridge
  tool for crossings.
- Roundabout tool converts any 3+ way junction to a CCW one-way ring.
- Block tool places destination buildings. When blocks exist, ~65% of cars
  visit one — park 2.2s, then leave via a different gate. Each visit is a
  tracked "Visit" on the HUD.
- Manual Demand slider (0×–3×). No auto-ramp. No game-over popup.
- Undo (one level), Erase, pinch-zoom + two-finger pan.

## Design principles (locked in — don't re-litigate)

1. **Orderly, designer-driven play.** Player places everything intentionally.
   Unlike Mini Motorways, no random building spawns. The fun is *designing*
   a city traffic system, not scrambling to fix chaos.
2. **Single-colour cars.** "Drivers are drivers" — no colour matching.
3. **Manual demand.** Player controls flow pressure.
4. **Sandbox feel.** No hard fail state. Jam bar is feedback, not game-over.
5. **Abstract pixel-space, not real map.** The real-OSM direction lives at
   `APPS/traffic-fix/` (shelved). May be merged back later, not now.
6. **Pure static site.** Vercel auto-deploys from `main`. No backend unless
   we have a specific reason.

## Research topics requested

The research session should produce recommendations, not just descriptions.
For each topic: "here's what they do, and here's what I'd pull into our
game, ranked." One markdown file per topic in `docs/research/`.

- [ ] `docs/research/mini-motorways.md` — full mechanics breakdown
  (spawning, scoring, progression, weekly upgrades, road-drag feel, pacing).
  Then: which 3–5 of these would most benefit us, given our orderly-design
  principle?
- [ ] `docs/research/mini-metro-and-others.md` — what Mini Metro / Cities
  Skylines traffic / SimCity / Tropico do with grid city-building and
  flow management. Ideas we can steal.
- [ ] `docs/research/visual-direction.md` — pixel art vs flat vector vs
  illustrated. Pick one, defend it with references. Include a recommended
  palette and car/house/road styling sketch (ASCII or written is fine).
- [ ] `docs/research/sound.md` — short list of SFX + one ambient track
  that would most lift game feel. Name them, describe them, point to
  free/CC sources if possible.
- [ ] `docs/research/fun.md` — what's the 10-minute core loop that keeps a
  player engaged? What's the "aha" moment? What's the progression hook
  that doesn't rely on Mini-Motorways-style randomness?
- [ ] `docs/research/next-features.md` — prioritised next-up list, 8–12
  items, with one-paragraph rationale each, ordered by expected impact.
  This is the most valuable single deliverable for the build session.

## Research outputs

_Drop summaries here, full content in `docs/research/<topic>.md`._

### From RESEARCH session
_(nothing yet — other session to populate)_

## Build queue

Ordered by priority. Research session may reorder / add items with rationale.

### From BUILD session
Session-memory guesses (not authoritative until research lands):
1. Block-size variety (small/medium/large → different visit time + footprint).
2. Sound effects (delivery ding, jam horn, ambient loop). Low effort, big feel.
3. Smoother car motion on turns (currently cars snap straight at junctions).
4. Pretty entry-gate art (currently just circles with arrows).
5. Some way to mark roads as "one-way" by hand (could be useful for flow).

(Waiting on research before committing.)

## Open questions for the user

Both sessions add here. User replies in their prompt.

- [ ] Primary device: mobile-first, desktop-first, or both equal?
- [ ] Is a hard fail state ever wanted (e.g. game-over after N seconds of
  full jam meter), or stay sandbox forever?
- [ ] Target play session: 5 min / 15 min / open-ended?
- [ ] OK to introduce a small Vercel Function (backend) for any future
  feature, or strict static-only?

## Handoff protocol

When the BUILD session ships a version, it should:
1. Update "Current state" above with the new version number + highlights.
2. Note in "From BUILD session" what's changed and what's unblocked.

When the RESEARCH session finishes a topic, it should:
1. Move that topic to "Research outputs" with a one-paragraph takeaway.
2. Full file lives under `docs/research/`.

Git safety: both sessions commit + push. If a push rejects (non-fast-forward),
`git pull --rebase` then push again. Don't force-push.
