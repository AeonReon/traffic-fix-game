# Session coordination — quick reference

Two Claude Code sessions work on this project in parallel.

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
  progresses, proposes next moves.

No merge conflicts possible — sessions write disjoint files.

## Git safety

Both sessions commit + push. If a push rejects with non-fast-forward,
`git pull --rebase` then push again. Never `push --force`.

## User-answered decisions (locked — don't re-litigate)

- **Primary device:** tablet (iPad) first, phone second. Touch is the
  main input.
- **No game-over state.** Clog → reset or drop demand. Jam bar stays
  as visual feedback.
- **Open-ended session length.** Sandbox pacing.
- **Static only** — no backend, no Vercel Functions (for now).
