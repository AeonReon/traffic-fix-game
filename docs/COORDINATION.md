# Session coordination — quick reference

Three Claude Code sessions work on this project in parallel. Each owns
a disjoint set of files — no session writes to another's lane.

## Where things live

- **`RESEARCH.md`** (project root) — the master plan. Owned by the
  RESEARCH session. Stages A–H with detailed specs, acceptance criteria,
  and the next-action recommendation. **Always the source of truth for
  "what to build next."**
- **`NOTES.md`** (project root) — architectural decisions + shipped log.
  Owned by the BUILD session. Updated after every deploy.
- **`docs/research/`** — topic-specific research deep-dives can live
  here if they get too long for RESEARCH.md (optional).

## Division of labour

- **BUILD session**: game code only (`index.html`, `style.css`, `js/`,
  `data/`, `scripts/`). Reads RESEARCH.md, picks a Stage, ships.
  Appends one-liner to NOTES.md "Shipped log" after every deploy.
- **RESEARCH session**: markdown only. Owns RESEARCH.md, updates Stage
  status checkboxes when informed of ships, adds detail as the build
  progresses, proposes next moves. Also owns `docs/research/`.
- **PLAYTEST session**: testing + bug tracking only. Owns
  `docs/testing/`. Reads code + diffs to find bugs; files reports in
  `docs/testing/known-issues.md`; maintains `test-plan.md` regression
  checklist. Never edits code or research docs. See
  `docs/testing/README.md` for its full brief.

No merge conflicts possible — sessions write disjoint files.

## Git safety

Both sessions commit + push. If a push rejects with non-fast-forward,
`git pull --rebase` then push again. Never `push --force`.

## Research deep-dives shipped

Opinionated, sourced. Each ends with a prioritised "what to pull in" list.

- **`research/next-features.md`** — the 12-item prioritised roadmap. The
  top 5: (1) localStorage persistence; (2) pressure rings on buildings;
  (3) typed buildings (done for placement — dispatch/pressure pending);
  (4) one-way road tool; (5) weekly upgrade draft. Start with #1: it's
  what turns the game from a toy into a project people return to.
- **`research/mini-motorways.md`** — MM mechanics in full, with a
  ranked list of 5 to adapt (weekly draft, pressure pins, building
  upgrades, intersection-speed penalty, new-entry unlocks) and 5 to
  reject (random spawns, colour puzzle, tile budget, hard fail, scored
  runs).
- **`research/mini-metro-and-others.md`** — Mini Metro's pressure ring
  is the single best visual UX pattern from adjacent games. Cities
  Skylines community consensus: one-way roads and roundabouts with
  through-roads are the biggest anti-congestion wins.
- **`research/fun.md`** — our game is a *design-and-observe sandbox*,
  not a puzzle. Five "aha moments" to design around. Persistence is
  the hook — ship it first.
- **`research/visual-direction.md`** — flat vector, warm-pastel,
  procedural Canvas-2D (no sprite pipeline). Palette codified; per-
  building shape sketches included; explicit "don't" list.
- **`research/design-pack.md`** — the execution spec for polishing to
  Mini-Motorways level. Exact dimensions, colours, strokes, shadows,
  motion timings for every element (cars, each building type, roads,
  junctions, gates, effects). Seven implementation passes with time
  estimates. When the build session is ready to "make it look like a
  real game", open this and walk top-to-bottom.
- **`research/sound.md`** — Web-Audio-only spec. 5 SFX (delivery
  chime pitched by building type, pad, click, jam tone, gate open)
  with runnable JS snippets. No audio files needed for v1.

## User-answered decisions (locked — don't re-litigate)

- **Primary device:** tablet (iPad) first, phone second. Touch is the
  main input.
- **No game-over state.** Clog → reset or drop demand. Jam bar stays
  as visual feedback.
- **Open-ended session length.** Sandbox pacing.
- **Static only** — no backend, no Vercel Functions (for now).
