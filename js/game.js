// Traffic Flow — v3
// Ultra-simple Mini-Motorways-style sandbox.
// Hand-placed houses and shops in pixel space. No map data. No confetti.
// Core loop: watch cars flow, drag to add roads, watch new flow emerge.

(() => {
  // ================================================================
  // Level — pure pixel coords, fits into a logical 1200×800 space.
  // The renderer scales this to whatever screen it's on.
  // ================================================================
  // Portrait, generous map — bigger than default view, so the player pans
  // and zooms around to explore / build in different neighbourhoods.
  const LOGICAL_W = 1800;
  const LOGICAL_H = 2340;
  const GRID = 60;

  // Day/night cycle — one full day lasts DAY_LENGTH simulated seconds.
  // Keyframes interpolate the tint overlay colour + alpha across the day.
  const DAY_LENGTH = 90;
  const DAY_PHASES = [
    { t: 0.00, r: 180, g: 200, b: 230, a: 0.15 },  // Dawn — cool cyan
    { t: 0.18, r:   0, g:   0, b:   0, a: 0.00 },  // Late morning — clear
    { t: 0.55, r:   0, g:   0, b:   0, a: 0.00 },  // Mid-afternoon — clear
    { t: 0.70, r: 230, g: 130, b:  80, a: 0.22 },  // Dusk — warm orange
    { t: 0.85, r:  36, g:  56, b: 104, a: 0.42 },  // Midnight — deep blue
    { t: 1.00, r: 180, g: 200, b: 230, a: 0.15 }   // Wrap back to dawn
  ];

  // Cars get a cheerful pastel mix. The player is watching these things move
  // around — giving them life is the single biggest visual-feel lever.
  const CAR_COLOR = '#5d6470';   // fallback / neutral for queue dots
  const CAR_COLORS = [
    '#db6d51',  // coral
    '#5aa3c9',  // dusty blue
    '#4fa16a',  // sage
    '#e8a13a',  // amber
    '#a065c3',  // lavender
    '#c74a6a',  // rose
    '#3a7ca5',  // deeper blue
    '#d6a05a',  // honey
    '#6b8e76',  // olive
    '#b05a8a'   // plum
  ];

  // Edge entries: cars enter from one side of the map, exit through another.
  // Coordinates sit just inside the logical 1200×800 area so they render as
  // gates on the border.
  // Entries at the edges of the bigger 1800×2340 map. Starter road is
  // at vertical centre; N & S gates at top/bottom centre.
  const LEVEL = {
    entries: [
      { id: 'N', x:  900, y:   60, side: 'N', label: 'N' },
      { id: 'S', x:  900, y: 2280, side: 'S', label: 'S' },
      { id: 'W', x:   60, y: 1140, side: 'W', label: 'W' },
      { id: 'E', x: 1740, y: 1140, side: 'E', label: 'E' }
    ],
    // No starter road. The map opens with just the four edge gates so the
    // player's first move is always to draw a road from a gate. Gives the
    // empty-canvas-feel that "I am building this from scratch."
    starterRoads: [],
    // Static water features. Roads cannot cross a lake; a Bridge can. Purely
    // visual + drag-validation — lakes never appear in saves. Coordinates
    // chosen so neither lake sits across a gate's natural straight-in path:
    // the player can still build N–S and W–E direct routes if they want,
    // but routing AROUND the water (or over with bridges) is what gives
    // each city its own shape.
    lakes: [
      { cx: 1340, cy:  720, r: 220 },
      { cx:  470, cy: 1690, r: 200 }
    ]
  };

  // Cars and physics (pixel units, pixels per second)
  const CAR_RADIUS = 11;
  const CAR_GAP = 4;                      // visible gap between car centres extra to radius
  const CAR_SPEED = 110;                  // max pixels per second
  const CAR_FOLLOW_TRIGGER = 42;          // start following at this gap
  const CAR_STOP_GAP = 28;                // stop if leader is this close

  // Spawning — manually controlled by a HUD slider instead of auto-ramping.
  // Interval = BASE / demandMult. demandMult = 0 means paused.
  const BASE_SPAWN_INTERVAL = 1.6;
  // Houses ALSO spawn cars (internal city traffic). Slower than edge gates
  // individually, but with enough houses they produce the bulk of the load.
  const HOUSE_SPAWN_INTERVAL = 5.5;
  const QUEUE_FAIL_SIZE = 9;
  const JAM_FILL_RATE = 0.14;
  const JAM_DRAIN_RATE = 0.06;
  const JAM_FAIL = 1.0;

  // Building types (Stage A.1 — RESEARCH.md). `points` = score awarded when
  // a car visits this type of building. `decorative: true` means the type
  // doesn't dispatch or receive cars — just sits as scenery / bonus radius.
  const BUILDING_TYPES = {
    house: { dwell: 2.6, size: 1, label: 'House', points: 1 },
    shop:  { dwell: 2.0, size: 1, label: 'Shop',  points: 2 },
    mall:  { dwell: 4.0, size: 2, label: 'Mall',  points: 3 },
    park:  { dwell: 0,   size: 1, label: 'Park',  points: 0, decorative: true }
  };
  const DELIVERY_POINTS = 1;   // car reaches an exit gate

  // Park bonus — buildings within PARK_RADIUS get +PARK_BONUS_PER_PARK to
  // their income multiplier, capped at PARK_BONUS_CAP. Parks within range
  // of one another don't compound (you'd just spam them).
  const PARK_RADIUS = 140;
  const PARK_BONUS_PER_PARK = 0.25;
  const PARK_BONUS_CAP = 0.75;

  // Civic credits — earned every $500 of cumulative totalEarned. Each
  // credit = one free park placement. M5 from make-it-a-game.md, simplest
  // possible v1: only one investment type (Park), only one source ($500
  // earned), no card-pick UI yet.
  const CIVIC_CREDIT_INTERVAL = 500;

  // Build version — bumped on every ship; shown in the corner pill so the
  // user can see at a glance whether the page reloaded with a new build.
  const VERSION = 'v37';

  // Save / load — per mode. Legacy key stays the sandbox save so existing
  // saves keep working without migration.
  const SAVE_KEY_SANDBOX = 'traffic-flow:v1';
  const SAVE_KEY_GAME = 'traffic-flow:game:v1';
  const SAVE_VERSION = 1;

  // Slow ramp — in any mode, demand starts low and ramps up to full over
  // RAMP_TIME seconds so the city has time to breathe before things get hot.
  // Without this, all four gates flood at once and jam the moment you start.
  const RAMP_TIME = 90;
  const RAMP_START = 0.25;

  // ================================================================
  // Modes & economy (Game Mode only — Sandbox ignores all of this)
  // ================================================================
  const MODE_SANDBOX = 'sandbox';
  const MODE_GAME = 'game';

  const STARTING_MONEY = 200;

  // Costs in dollars. Roads scale with length so a giant road isn't free.
  // `perGrid` is dollars per 60-unit grid step in addition to `base`.
  const COSTS = {
    road:       { base: 5,  perGrid: 1 },
    bridge:     { base: 30, perGrid: 1 },
    oneway:     0,
    roundabout: 40,
    house:      20,
    shop:       40,
    mall:       100,
    park:       150,
    erase:      0
  };

  // Per-instance cost scaling. Each existing building of a given type bumps
  // the next one's cost by COST_SCALING[type] dollars. Without this, late-
  // game money becomes effectively unlimited because income compounds with
  // city size while costs stay flat — the player stops thinking about
  // resources entirely. Linear scaling keeps the early game friendly
  // (first house is still $20) while making the 10th mall a real decision.
  //   house:      20,  30,  40,  50,  60,  70,  ...   (+$10 each)
  //   shop:       40,  65,  90, 115, 140, 165,  ...   (+$25 each)
  //   mall:      100, 175, 250, 325, 400, 475,  ...   (+$75 each)
  //   park:      150, 200, 250, ...                   (free with civic credit)
  const COST_SCALING = {
    house: 10,
    shop:  25,
    mall:  75,
    park:  50
  };

  function buildingCostFor(type) {
    const base = COSTS[type];
    if (typeof base !== 'number') return base;
    const scale = COST_SCALING[type] || 0;
    if (!scale) return base;
    const n = state.blocks.filter(b => b.type === type).length;
    return base + n * scale;
  }

  // Income per car-event in game mode. Sandbox uses score points only.
  const INCOME = {
    house: 1,
    shop:  3,
    mall:  8,
    exit:  1,
    park:  0
  };

  // How much a building's income is multiplied by when within range of N
  // parks. Capped at PARK_BONUS_CAP. Used in the visit/exit income code.
  function parkBonusFor(b) {
    let bonus = 0;
    for (const p of state.blocks) {
      if (p.type !== 'park') continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) <= PARK_RADIUS) {
        bonus += PARK_BONUS_PER_PARK;
      }
    }
    return Math.min(PARK_BONUS_CAP, bonus);
  }

  // Crash / overload — game mode only. Sustained near-max jam ends the run.
  const OVERLOAD_JAM = 0.95;
  const OVERLOAD_TIME = 30;       // seconds at >= OVERLOAD_JAM

  // Game-mode targets (M2 from research/make-it-a-game.md). Visible in the
  // HUD as 3 pills; soft goals — no fail if you miss them.
  //
  // TIERED — each target has a list of escalating goals. Hit one, get a
  // celebratory burst + cash bonus, the bar resets, and the *next* tier
  // appears in its place. This is what "make it feel like a real run"
  // needs: a never-ending goal that keeps escalating with the city.
  //
  // For income, each tier raises the $/min threshold; the sustain duration
  // stays at 60 seconds.
  const TARGET_DEFS = [
    {
      id: 'earn',
      icon: '💰',
      tiers: [500, 2000, 10000, 50000, 250000],
      labelTpl: (g) => `Earn $${g.toLocaleString()}`,
      progress: (s) => s.totalEarned,
      format:   (v, g) => `$${Math.floor(v).toLocaleString()} / $${g.toLocaleString()}`
    },
    {
      id: 'people',
      icon: '🏘️',
      tiers: [30, 100, 300, 1000, 5000],
      labelTpl: (g) => `House ${g.toLocaleString()} people`,
      progress: (s) => s.blocks.reduce((n, b) => n + (b.type === 'house' ? 2 : 0), 0),
      format:   (v, g) => `${Math.floor(v)} / ${g.toLocaleString()}`
    },
    {
      id: 'income',
      icon: '🚀',
      tiers: [30, 100, 300, 1000, 5000],   // $/min thresholds
      isIncome: true,
      goalSec: 60,
      labelTpl: (threshold) => `Sustain $${threshold.toLocaleString()}/min · 60s`,
      progress: (s) => s._incomeSustainSec || 0,
      format:   (v) => `${Math.floor(v)}s / 60s`
    }
  ];

  // Cash bonus per tier (matches array index). Bigger goals → bigger payout.
  const TIER_BONUSES = [100, 250, 1000, 5000, 25000];

  // Helpers — given target def + current tier, return the active goal value
  // and threshold (if income).
  function targetActiveGoal(def, tier) {
    if (def.isIncome) return def.goalSec;          // 60s for all tiers
    return def.tiers[Math.min(tier, def.tiers.length - 1)];
  }
  function targetActiveThreshold(def, tier) {
    return def.tiers[Math.min(tier, def.tiers.length - 1)];
  }
  function targetMaxedOut(def, tier) {
    return tier >= def.tiers.length;
  }

  function gridSteps(lenPx) {
    return Math.max(1, Math.round(lenPx / GRID));
  }

  function roadCost(lenPx, isBridge) {
    const c = isBridge ? COSTS.bridge : COSTS.road;
    return c.base + c.perGrid * gridSteps(lenPx);
  }

  function isGameMode() { return state.mode === MODE_GAME; }

  // ================================================================
  // State
  // ================================================================
  const state = {
    entries: [],
    nodes: new Map(),
    edges: [],
    adjacency: new Map(),
    nextNodeId: 1,
    nextEdgeId: 1,

    blocks: [],         // { id, x, y, nodeId, visits }
    nextBlockId: 1,

    cars: [],
    nextCarId: 1,

    effects: [],        // ephemeral visual bursts { x, y, startTime, kind }

    // Flow sparkline — samples of per-minute delivery rate.
    flowSamples: [],    // last 60 numbers (one per sim-second)
    flowLastSampleAt: -1,
    flowLastCount: 0,   // delivered-at-last-sample, so we can diff
    flowPeak: 0,


    undoStack: [],      // [{ type: 'road' | 'block', ... }]

    time: 0,
    paused: true,
    started: false,
    over: false,
    delivered: 0,
    visits: 0,
    score: 0,
    bestScore: 0,
    jamMeter: 0,
    demandMult: 1.0,

    // Mode + economy (game mode only — ignored in sandbox).
    mode: MODE_SANDBOX,
    money: STARTING_MONEY,
    totalEarned: 0,         // lifetime income this run
    peakPeople: 0,
    overloadTimer: 0,       // seconds spent above OVERLOAD_JAM
    bestMoney: 0,
    bestSurvived: 0,        // longest survived run, seconds

    // Civic credits (M5) — one free park per $500 cumulative totalEarned.
    civicCredits: 0,         // unspent credits
    civicCreditsClaimed: 0,  // total ever issued (for milestone tracking)
    toolbarHidden: false,    // user can collapse the toolbar on phone

    // Targets (M2). Tiered — each target has multiple escalating goals.
    // targetTiers stores the *current* tier index per target id.
    targetTiers: {},        // { earn: 0, people: 1, ... }
    targetsCollapsed: false,
    earnSamples: [],        // last 60 numbers ($/sec for that sim-second)
    earnLastSampleAt: -1,
    earnLastTotal: 0,
    _incomeSustainSec: 0,   // continuous seconds at >= threshold income/min

    // Camera / view fitted to LOGICAL coords
    view: { scale: 1, originX: LOGICAL_W / 2, originY: LOGICAL_H / 2, dpr: window.devicePixelRatio || 1 },

    tool: 'road',
    pointers: new Map(),
    pinch: null,
    dragging: null,     // { startWorld, snapStart, cursorWorld, snapEnd, isBridge }
    panActive: false,
    panFrom: null,
    hover: null
  };

  // ================================================================
  // Network helpers
  // ================================================================
  function makeNode(x, y, opts = {}) {
    const n = { id: state.nextNodeId++, x, y, entry: opts.entry || null };
    state.nodes.set(n.id, n);
    return n;
  }

  function makeEdge(fromNode, toNode, opts = {}) {
    const shape = opts.shape || [
      { x: fromNode.x, y: fromNode.y },
      { x: toNode.x, y: toNode.y }
    ];
    const edge = {
      id: state.nextEdgeId++,
      from: fromNode.id, to: toNode.id,
      shape, length: polyLen(shape),
      bridge: !!opts.bridge,
      custom: !!opts.custom
    };
    state.edges.push(edge);
    // Reverse for two-way travel.
    const rev = {
      id: state.nextEdgeId++,
      from: toNode.id, to: fromNode.id,
      shape: shape.slice().reverse(), length: edge.length,
      bridge: edge.bridge, custom: edge.custom
    };
    state.edges.push(rev);
    return [edge, rev];
  }

  function rebuildAdjacency() {
    const a = new Map();
    for (const e of state.edges) {
      if (!a.has(e.from)) a.set(e.from, []);
      a.get(e.from).push(e);
    }
    state.adjacency = a;
  }

  function polyLen(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return d;
  }

  function sampleEdge(edge, d) {
    const pts = edge.shape;
    if (d <= 0) {
      const a = pts[0], b = pts[1];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: a.x, y: a.y, hx: (b.x - a.x) / L, hy: (b.y - a.y) / L };
    }
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
      if (acc + L >= d) {
        const t = (d - acc) / L;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          hx: (b.x - a.x) / L, hy: (b.y - a.y) / L
        };
      }
      acc += L;
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: b.x, y: b.y, hx: (b.x - a.x) / L, hy: (b.y - a.y) / L };
  }

  function distPointSeg2(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-6;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + dx * t, qy = a.y + dy * t;
    return (qx - px) ** 2 + (qy - py) ** 2;
  }

  // Distance² from a point to a segment, used by the lake-crossing check
  // and elsewhere. Inlined version of the routine below for readability.
  function segCrossesAnyLake(a, b) {
    if (!LEVEL.lakes || !LEVEL.lakes.length) return false;
    for (const L of LEVEL.lakes) {
      const d2 = distPointSeg2(L.cx, L.cy, a, b);
      // Margin of 4 world units so a road that just *grazes* the shore is
      // allowed — the visual edge of the lake fades out a few pixels.
      if (d2 < (L.r - 4) * (L.r - 4)) return true;
    }
    return false;
  }

  function segIntersect(a, b, c, d) {
    const d1x = b.x - a.x, d1y = b.y - a.y;
    const d2x = d.x - c.x, d2y = d.y - c.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-6) return null;
    const t = ((c.x - a.x) * d2y - (c.y - a.y) * d2x) / denom;
    const u = ((c.x - a.x) * d1y - (c.y - a.y) * d1x) / denom;
    if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
    return { t, u, x: a.x + t * d1x, y: a.y + t * d1y };
  }

  function findNearestNode(x, y, snapR) {
    let best = null, bestD = snapR * snapR;
    for (const n of state.nodes.values()) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function findNearestEdge(x, y, snapR) {
    let best = null, bestD = snapR * snapR;
    for (const e of state.edges) {
      // Only check one direction of each pair to avoid double work.
      if (e.id % 2 === 0) continue;
      const pts = e.shape;
      for (let i = 1; i < pts.length; i++) {
        const d = distPointSeg2(x, y, pts[i - 1], pts[i]);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    return best;
  }

  // Return { edge, x, y } of the closest point lying on any edge within snapR
  // pixels, or null. Used for T-junction snapping.
  // =============================================================
  // Persistence — localStorage
  // =============================================================
  function saveKeyFor(mode) {
    return mode === MODE_GAME ? SAVE_KEY_GAME : SAVE_KEY_SANDBOX;
  }

  function serializeState() {
    return {
      v: SAVE_VERSION,
      mode: state.mode,
      nodes: [...state.nodes.values()].map(n => ({
        id: n.id, x: n.x, y: n.y,
        entry: n.entry || null,
        junction: !!n.junction,
        degree: n.degree || 0
      })),
      edges: state.edges.map(e => ({
        id: e.id, from: e.from, to: e.to,
        shape: e.shape, length: e.length,
        bridge: !!e.bridge, custom: !!e.custom
      })),
      blocks: state.blocks.map(b => ({
        id: b.id, type: b.type, x: b.x, y: b.y,
        nodeId: b.nodeId, visits: b.visits || 0,
        dwell: b.dwell, size: b.size
      })),
      entries: state.entries.map(e => ({
        id: e.id, x: e.x, y: e.y, side: e.side, label: e.label, nodeId: e.nodeId
      })),
      nextNodeId: state.nextNodeId,
      nextEdgeId: state.nextEdgeId,
      nextBlockId: state.nextBlockId,
      demandMult: state.demandMult,
      delivered: state.delivered,
      visits: state.visits,
      score: state.score,
      bestScore: state.bestScore,
      flowSamples: state.flowSamples,
      flowPeak: state.flowPeak,
      // Game-mode economy
      money: state.money,
      totalEarned: state.totalEarned,
      peakPeople: state.peakPeople,
      bestMoney: state.bestMoney,
      bestSurvived: state.bestSurvived,
      runTime: state.time,
      targetTiers: state.targetTiers,
      targetsCollapsed: state.targetsCollapsed,
      earnSamples: state.earnSamples,
      civicCredits: state.civicCredits,
      civicCreditsClaimed: state.civicCreditsClaimed,
      toolbarHidden: state.toolbarHidden
    };
  }

  function loadState(data) {
    if (!data || data.v !== SAVE_VERSION) return false;
    try {
      state.nodes.clear();
      for (const n of data.nodes) state.nodes.set(n.id, { ...n });
      state.edges = data.edges.slice();
      state.blocks = data.blocks.slice();
      state.entries = data.entries.map(e => ({ ...e, queue: [], timer: 0 }));
      state.nextNodeId = data.nextNodeId;
      state.nextEdgeId = data.nextEdgeId;
      state.nextBlockId = data.nextBlockId;
      state.demandMult = data.demandMult ?? 1.0;
      state.delivered = data.delivered || 0;
      state.visits = data.visits || 0;
      state.score = data.score || 0;
      state.bestScore = data.bestScore || 0;
      state.flowSamples = Array.isArray(data.flowSamples) ? data.flowSamples.slice(-60) : [];
      state.flowPeak = data.flowPeak || 0;
      state.flowLastSampleAt = -1;
      state.flowLastCount = state.delivered;
      state.cars = [];
      state.undoStack = [];
      state.jamMeter = 0;
      state.overloadTimer = 0;
      state.time = data.runTime || 0;
      // Economy fields — default for sandbox saves that didn't have them.
      state.money = data.money ?? STARTING_MONEY;
      state.totalEarned = data.totalEarned || 0;
      state.peakPeople = data.peakPeople || 0;
      state.bestMoney = data.bestMoney || 0;
      state.bestSurvived = data.bestSurvived || 0;
      state.targetTiers = data.targetTiers || {};
      state.targetsCollapsed = !!data.targetsCollapsed;
      state.earnSamples = Array.isArray(data.earnSamples) ? data.earnSamples.slice(-60) : [];
      state.earnLastSampleAt = -1;
      state.earnLastTotal = state.totalEarned;
      state._incomeSustainSec = 0;
      state.civicCredits = data.civicCredits || 0;
      state.civicCreditsClaimed = data.civicCreditsClaimed || 0;
      state.toolbarHidden = !!data.toolbarHidden;
      rebuildAdjacency();
      return true;
    } catch (err) {
      console.warn('loadState failed:', err);
      return false;
    }
  }

  let saveTimer = null;
  function scheduleSave() {
    if (!state.started) return;  // don't save if player hasn't even started
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(saveKeyFor(state.mode), JSON.stringify(serializeState()));
      } catch (err) {
        console.warn('save failed:', err);
      }
    }, 600);
  }

  function hasSavedCity(mode) {
    try { return !!localStorage.getItem(saveKeyFor(mode || state.mode)); } catch (_) { return false; }
  }

  function clearSavedCity(mode) {
    try { localStorage.removeItem(saveKeyFor(mode || state.mode)); } catch (_) {}
  }

  function snapToGrid(x, y) {
    return {
      x: Math.round(x / GRID) * GRID,
      y: Math.round(y / GRID) * GRID
    };
  }

  // Visual offset for buildings — they sit BESIDE a road, not on it. Cars
  // still route to the road point (block.nodeId is on the road), but the
  // building is drawn one grid step perpendicular to the road, on
  // whichever side the player tapped.
  //
  // If road direction is known (from the edge geometry or a connected
  // edge at a node), the offset is taken perpendicular to that direction
  // — clean for axis-aligned roads. Falls back to "direction from road
  // point to tap" when no road direction is available.
  function offsetVisualFromRoad(roadX, roadY, tapX, tapY, roadDirX, roadDirY) {
    if (typeof roadDirX === 'number' && typeof roadDirY === 'number'
        && (roadDirX !== 0 || roadDirY !== 0)) {
      const L = Math.hypot(roadDirX, roadDirY) || 1;
      const dirX = roadDirX / L, dirY = roadDirY / L;
      // Perpendicular (rotate 90°). Sign is decided by which side of the
      // road the player's tap landed on.
      const px = -dirY, py = dirX;
      const dot = (tapX - roadX) * px + (tapY - roadY) * py;
      const sign = dot >= 0 ? 1 : -1;
      return snapToGrid(roadX + px * sign * GRID, roadY + py * sign * GRID);
    }
    // Tap-direction fallback (no road direction known).
    let dx = tapX - roadX;
    let dy = tapY - roadY;
    const L = Math.hypot(dx, dy);
    if (L < 1) { dx = 0; dy = -1; }
    else { dx /= L; dy /= L; }
    return snapToGrid(roadX + dx * GRID, roadY + dy * GRID);
  }

  // Snap a drag end point to a strict horizontal or vertical line on the
  // grid. v29 dropped the 45° diagonal escape hatch — it was the source of
  // most of the "wonky" feel because a slightly diagonal drag would commit
  // to a diagonal road, which then fed off-grid roundabouts and weird
  // junctions. Pure axis-aligned roads keep every approach cardinal, which
  // makes the rest of the geometry (junctions, roundabouts, plots) clean.
  function snapAxisAligned(startPt, endPt) {
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx >= ady) {
      return { x: Math.round(endPt.x / GRID) * GRID, y: startPt.y };
    }
    return { x: startPt.x, y: Math.round(endPt.y / GRID) * GRID };
  }

  function findNearestEdgePoint(x, y, snapR) {
    let best = null, bestD = snapR * snapR;
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
      const pts = e.shape;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const L2 = dx * dx + dy * dy || 1e-6;
        let t = ((x - a.x) * dx + (y - a.y) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = a.x + dx * t, qy = a.y + dy * t;
        const d = (qx - x) ** 2 + (qy - y) ** 2;
        if (d < bestD) { bestD = d; best = { edge: e, x: qx, y: qy }; }
      }
    }
    return best;
  }

  // For live preview: would this straight line geometrically cross any existing
  // non-bridge edge (ignoring those the drag's endpoints already snap to)?
  function lineWouldCross(aPt, bPt, dragData) {
    const skipEdges = new Set();
    if (dragData.snapStartEdge) skipEdges.add(dragData.snapStartEdge.edge);
    if (dragData.snapEndEdge)   skipEdges.add(dragData.snapEndEdge.edge);

    for (const e of state.edges) {
      if (e.bridge) continue;
      if (e.id % 2 === 0) continue;
      if (skipEdges.has(e)) continue;
      if (dragData.snapStart && (e.from === dragData.snapStart.id || e.to === dragData.snapStart.id)) continue;
      if (dragData.snapEnd   && (e.from === dragData.snapEnd.id   || e.to === dragData.snapEnd.id))   continue;
      const pts = e.shape;
      for (let i = 1; i < pts.length; i++) {
        if (segIntersect(aPt, bPt, pts[i - 1], pts[i])) return true;
      }
    }
    // Water counts as a crossing too — turns the drag preview red so the
    // player sees they need a Bridge to cross the lake.
    if (segCrossesAnyLake(aPt, bPt)) return true;
    return false;
  }

  // ================================================================
  // Road building
  // ================================================================
  function splitEdgeAtPoint(edge, px, py) {
    // Find segment and t
    const pts = edge.shape;
    let bestI = 1, bestT = 0, bestD = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1e-6;
      let t = ((px - a.x) * dx + (py - a.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + dx * t, qy = a.y + dy * t;
      const d = (qx - px) ** 2 + (qy - py) ** 2;
      if (d < bestD) { bestD = d; bestI = i; bestT = t; }
    }
    const a = pts[bestI - 1], b = pts[bestI];
    const splitPt = { x: a.x + (b.x - a.x) * bestT, y: a.y + (b.y - a.y) * bestT };

    const newNode = findNearestNode(splitPt.x, splitPt.y, 6) || makeNode(splitPt.x, splitPt.y);

    const shapeA = pts.slice(0, bestI).concat([{ x: splitPt.x, y: splitPt.y }]);
    const shapeB = [{ x: splitPt.x, y: splitPt.y }].concat(pts.slice(bestI));
    const lengthA = polyLen(shapeA);
    const lengthB = polyLen(shapeB);

    const oldTo = edge.to;
    const oldLength = edge.length;

    // Create the tail edge (forward direction, from split point to old destination).
    const tailEdge = {
      id: state.nextEdgeId++,
      from: newNode.id, to: oldTo,
      shape: shapeB, length: lengthB,
      bridge: edge.bridge, custom: edge.custom
    };
    state.edges.push(tailEdge);

    // Find the twin (reverse direction) and prepare its tail too.
    const twin = state.edges.find(x =>
      x !== edge && x !== tailEdge &&
      x.from === oldTo && x.to === edge.from &&
      Math.abs(x.length - oldLength) < 3
    );
    let twinTailEdge = null;
    if (twin) {
      twinTailEdge = {
        id: state.nextEdgeId++,
        from: newNode.id, to: twin.to,
        shape: shapeA.slice().reverse(), length: lengthA,
        bridge: twin.bridge, custom: twin.custom
      };
      state.edges.push(twinTailEdge);
    }

    // Migrate any cars on these edges BEFORE mutating the edge objects —
    // the critical bit that was causing "bounce backwards".
    for (const car of state.cars) {
      for (let i = 0; i < car.path.length; i++) {
        const pe = car.path[i];
        if (pe === edge) {
          if (i < car.pathIdx) break;
          if (i === car.pathIdx) {
            if (car.pos > lengthA) {
              // Car is past the split point — move it onto the tail.
              car.path[i] = tailEdge;
              car.pos -= lengthA;
            } else {
              // Still on the first half — insert the tail so it continues.
              car.path.splice(i + 1, 0, tailEdge);
            }
          } else {
            // Edge appears later in the path — will need the tail after.
            car.path.splice(i + 1, 0, tailEdge);
          }
          break;
        }
        if (twin && pe === twin) {
          if (i < car.pathIdx) break;
          if (i === car.pathIdx) {
            if (car.pos > lengthB) {
              car.path[i] = twinTailEdge;
              car.pos -= lengthB;
            } else {
              car.path.splice(i + 1, 0, twinTailEdge);
            }
          } else {
            car.path.splice(i + 1, 0, twinTailEdge);
          }
          break;
        }
      }
    }

    // NOW mutate the original edge in place to become the first half.
    edge.to = newNode.id;
    edge.shape = shapeA;
    edge.length = lengthA;
    if (twin) {
      twin.to = newNode.id;
      twin.shape = shapeB.slice().reverse();
      twin.length = lengthB;
    }

    return newNode;
  }

  // addRoad takes resolved endpoint objects from the drag handler:
  //   { node: Node }        — endpoint snapped to an existing node
  //   { edgePoint: {...} }  — endpoint snapped to a point on an existing road
  // Bridges ignore crossings, regular roads reject crossings.
  function addRoad(startData, endData, opts = {}) {
    const isBridge = !!opts.isBridge;

    if (startData.edgePoint && endData.edgePoint &&
        startData.edgePoint.edge === endData.edgePoint.edge) {
      return { ok: false, reason: 'Pick a different road for the other end' };
    }

    function resolve(data, allowFree) {
      if (data.node) return data.node;
      if (data.edgePoint) return splitEdgeAtPoint(data.edgePoint.edge, data.edgePoint.x, data.edgePoint.y);
      if (allowFree && data.freePoint) return makeNode(data.freePoint.x, data.freePoint.y);
      return null;
    }
    const startNode = resolve(startData, false);   // start must be anchored
    if (!startNode) return { ok: false, reason: 'Start on a road or building' };
    const endNode = resolve(endData, true);        // end can be open space
    if (!endNode) return { ok: false, reason: 'Invalid end' };
    if (startNode.id === endNode.id) return { ok: false, reason: 'Start and end are the same spot' };

    const shape = [
      { x: startNode.x, y: startNode.y },
      { x: endNode.x,   y: endNode.y }
    ];
    if (polyLen(shape) < 40) return { ok: false, reason: 'Too short' };

    // Game mode — check funds before letting the road land.
    let cost = 0;
    if (isGameMode()) {
      cost = roadCost(polyLen(shape), isBridge);
      if (state.money < cost) {
        return { ok: false, reason: `Need $${cost} — got $${state.money}` };
      }
    }

    // Regular roads cannot cross existing non-bridge roads. Use Bridge for that.
    if (!isBridge) {
      for (const e of state.edges) {
        if (e.bridge) continue;
        if (e.id % 2 === 0) continue;
        if (e.from === startNode.id || e.from === endNode.id ||
            e.to === startNode.id   || e.to === endNode.id) continue;
        const pts = e.shape;
        for (let i = 1; i < pts.length; i++) {
          if (segIntersect(shape[0], shape[1], pts[i - 1], pts[i])) {
            return { ok: false, reason: 'Use Bridge to cross an existing road' };
          }
        }
      }
      // Roads can't cross water either — the player needs a Bridge for that.
      if (segCrossesAnyLake(shape[0], shape[1])) {
        return { ok: false, reason: 'Use Bridge to cross water' };
      }
    }

    const [fwd, rev] = makeEdge(startNode, endNode, { custom: true, bridge: isBridge, shape });
    rebuildAdjacency();
    if (isGameMode() && cost > 0) {
      state.money -= cost;
      state.effects.push({ x: (startNode.x + endNode.x) / 2, y: (startNode.y + endNode.y) / 2,
                           startTime: state.time, kind: 'spend', amount: cost });
    }
    state.undoStack.push({ type: 'road', edgeIds: [fwd.id, rev.id], cost });
    scheduleSave();
    return { ok: true, cost };
  }

  // Place a building. `type` is one of BUILDING_TYPES keys. `opts.visualPos`
  // optionally separates the BUILDING'S DRAWN POSITION from its routing node:
  // the node sits on the road (so cars can reach it) and the building art
  // sits one grid step beside the road. This is what makes the city look
  // like a real one — roads run BY the houses, not THROUGH them.
  function placeBlock(wx, wy, type = 'shop', opts = {}) {
    const spec = BUILDING_TYPES[type] || BUILDING_TYPES.shop;

    // Game mode — check funds first so we don't mutate the network only to
    // bail. Parks are free if you have an unspent civic credit.
    let cost = 0;
    let usedCivicCredit = false;
    if (isGameMode()) {
      if (type === 'park' && state.civicCredits > 0) {
        cost = 0;
        usedCivicCredit = true;
      } else {
        cost = buildingCostFor(type);
      }
      if (state.money < cost) {
        return { ok: false, reason: `Need $${cost} — got $${state.money}` };
      }
    }

    // Snap to existing road nodes / edge points — but skip nodes that
    // already have a building, and skip nodes that are *only* part of a
    // building (so tapping near a house drops a new house next door rather
    // than rejecting). Otherwise the small house render misleads the player
    // into thinking they have lots of room.
    const sn = snapRadii();
    const blockedNodeIds = new Set(state.blocks.map(b => b.nodeId));
    const nodeSnapRaw = findNearestNode(wx, wy, sn.node);
    const nodeSnap = (nodeSnapRaw && !blockedNodeIds.has(nodeSnapRaw.id)) ? nodeSnapRaw : null;
    const edgeSnap = !nodeSnap ? findNearestEdgePoint(wx, wy, sn.edge) : null;

    // No buildings in the water — parks and houses both need dry ground.
    if (LEVEL.lakes) {
      for (const L of LEVEL.lakes) {
        if ((wx - L.cx) ** 2 + (wy - L.cy) ** 2 < (L.r - 4) ** 2) {
          return { ok: false, reason: 'Can\'t build on water' };
        }
      }
    }

    let node;
    if (nodeSnap) node = nodeSnap;
    else if (edgeSnap) node = splitEdgeAtPoint(edgeSnap.edge, edgeSnap.x, edgeSnap.y);
    else if (type === 'park') node = makeNode(wx, wy);
    // v31 — non-park buildings need a road within snap range. Otherwise the
    // building would be unreachable: cars can't visit, no income, dead pixel.
    // Reject early so the player learns "build the road first".
    else return { ok: false, reason: 'Place on or next to a road' };

    if (node.entry) return { ok: false, reason: 'Can\'t place on a gate' };
    if (blockedNodeIds.has(node.id)) return { ok: false, reason: 'Building already here' };

    // Visual position — beside the road, not on it. Falls back to node
    // coords if no opts.visualPos was given (parks, sandbox-mode old paths).
    const visualX = opts.visualPos ? opts.visualPos.x : node.x;
    const visualY = opts.visualPos ? opts.visualPos.y : node.y;

    // Visual / footprint check — minimum spacing measured against drawn
    // positions so two houses on opposite sides of one road don't collide.
    // Park-vs-park is given a smaller minimum so parks can tile into the
    // "park zones" the user asked for: lawns merge into one continuous
    // green carpet instead of bouncing apart.
    const MIN_BLOCK_DIST = GRID - 4;   // 56 — adjacent grid cells (60 apart) pass
    const PARK_PARK_MIN_DIST = 56;     // exact grid-step apart, enough for shared lawn
    for (const b of state.blocks) {
      const d = Math.hypot(b.x - visualX, b.y - visualY);
      const minD = (type === 'park' && b.type === 'park') ? PARK_PARK_MIN_DIST : MIN_BLOCK_DIST;
      if (d < minD) {
        return { ok: false, reason: 'Too close to another building' };
      }
    }

    const block = {
      id: state.nextBlockId++,
      type,
      x: visualX, y: visualY,
      nodeId: node.id,
      visits: 0,
      dwell: spec.dwell,
      size: spec.size
    };
    state.blocks.push(block);
    rebuildAdjacency();
    if (isGameMode()) {
      if (usedCivicCredit) {
        state.civicCredits -= 1;
      } else if (cost > 0) {
        state.money -= cost;
        state.effects.push({ x: block.x, y: block.y, startTime: state.time, kind: 'spend', amount: cost });
      }
    }
    state.undoStack.push({ type: 'block', blockId: block.id, nodeId: node.id, cost, usedCivicCredit });
    scheduleSave();
    return { ok: true, cost, usedCivicCredit };
  }

  function undoLast() {
    const action = state.undoStack.pop();
    if (!action) return { ok: false, reason: 'Nothing to undo' };
    if (action.type === 'road') {
      const gone = new Set(action.edgeIds);
      state.edges = state.edges.filter(e => !gone.has(e.id));
      state.cars = state.cars.filter(c => !c.path.some(e => gone.has(e.id)));
      rebuildAdjacency();
      if (isGameMode() && action.cost) state.money += action.cost;
      scheduleSave();
      return { ok: true, what: 'road', refund: action.cost || 0 };
    }
    if (action.type === 'block') {
      state.blocks = state.blocks.filter(b => b.id !== action.blockId);
      state.cars = state.cars.filter(c => c.blockId !== action.blockId);
      if (isGameMode()) {
        if (action.usedCivicCredit) state.civicCredits += 1;
        else if (action.cost) state.money += action.cost;
      }
      scheduleSave();
      return { ok: true, what: 'block', refund: action.cost || 0 };
    }
    return { ok: false };
  }

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function makeRoundabout(nodeId, radius = 90) {
    const node = state.nodes.get(nodeId);
    if (!node) return { ok: false, reason: 'no node' };

    // Collect edges touching this node (both directions).
    const touching = state.edges.filter(e => e.from === nodeId || e.to === nodeId);
    if (touching.length < 3) return { ok: false, reason: 'need 3+ roads' };

    // Game mode — funds check before mutating anything.
    if (isGameMode()) {
      if (state.money < COSTS.roundabout) {
        return { ok: false, reason: `Need $${COSTS.roundabout} — got $${state.money}` };
      }
    }

    // Direction vector AWAY from the node for each touching edge.
    function dirAway(e) {
      let dx, dy;
      if (e.from === nodeId) {
        dx = e.shape[1].x - e.shape[0].x;
        dy = e.shape[1].y - e.shape[0].y;
      } else {
        const n = e.shape.length;
        dx = e.shape[n - 2].x - e.shape[n - 1].x;
        dy = e.shape[n - 2].y - e.shape[n - 1].y;
      }
      const L = Math.hypot(dx, dy) || 1;
      return { dx: dx / L, dy: dy / L };
    }

    // Four cardinal ring nodes (E / S / W / N) with a fatter radius. The
    // earlier 8-node ring + radius 60 produced 8 short arcs of length ~47 —
    // queueing cars stacked up on each tiny segment, the ring filled
    // instantly, and what the player saw was a swirl of cars "going round
    // multiple times before they could leave." Roads are axis-aligned now
    // (v29 dropped the 45° escape hatch) so 4 cardinal nodes is plenty;
    // diagonal approaches still snap to the nearest within 45°.
    const FIXED_BEARINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // E, S, W, N
    const ringNodes = FIXED_BEARINGS.map(bearing => ({
      node: makeNode(node.x + radius * Math.cos(bearing), node.y + radius * Math.sin(bearing)),
      bearing
    }));

    // Rewire each approach to the ring node closest to its bearing. With
    // axis-aligned roads, every approach is exactly 0/90/180/270 and maps
    // perfectly onto a ring node — no kink. Diagonal approaches map to the
    // nearest 45° ring node within ≤22.5°.
    function bestRingFor(approachBearing) {
      let best = ringNodes[0];
      let bestDiff = Math.abs(angleDiff(best.bearing, approachBearing));
      for (let i = 1; i < ringNodes.length; i++) {
        const d = Math.abs(angleDiff(ringNodes[i].bearing, approachBearing));
        if (d < bestDiff) { best = ringNodes[i]; bestDiff = d; }
      }
      return best;
    }
    for (const e of touching) {
      const d = dirAway(e);
      const bearing = Math.atan2(d.dy, d.dx);
      const target = bestRingFor(bearing);
      if (e.from === nodeId) {
        e.from = target.node.id;
        e.shape[0] = { x: target.node.x, y: target.node.y };
      } else {
        e.to = target.node.id;
        e.shape[e.shape.length - 1] = { x: target.node.x, y: target.node.y };
      }
      e.length = polyLen(e.shape);
    }

    // Build the ring as 4 one-way arcs (no reverse twins — that's what
    // enforces single-direction roundabout flow). Each arc is a 90° quarter
    // circle, ≈141 world units long at radius 90 — plenty of room for
    // multiple cars without bottlenecking.
    ringNodes.sort((a, b) => b.bearing - a.bearing);
    for (let i = 0; i < ringNodes.length; i++) {
      const a = ringNodes[i].node;
      const b = ringNodes[(i + 1) % ringNodes.length].node;
      let angA = Math.atan2(a.y - node.y, a.x - node.x);
      let angB = Math.atan2(b.y - node.y, b.x - node.x);
      let delta = angB - angA;
      if (delta <= -Math.PI) delta += 2 * Math.PI;
      else if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < 0) delta += 2 * Math.PI;
      const steps = 4;
      const shape = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const ang = angA + delta * t;
        shape.push({ x: node.x + radius * Math.cos(ang), y: node.y + radius * Math.sin(ang) });
      }
      state.edges.push({
        id: state.nextEdgeId++,
        from: a.id, to: b.id,
        shape, length: polyLen(shape),
        bridge: false, custom: true
      });
    }

    // Remove the original centre node.
    state.nodes.delete(nodeId);
    rebuildAdjacency();

    // Re-route cars whose path touches the now-rewired approaches. Dropping
    // them wholesale (the old behaviour) made roundabouts an exploit: jamming
    // up? plonk a roundabout in the middle of the queue, every queued car
    // vanishes, jam meter empties, score-discipline broken. Now traffic
    // persists and gets re-routed onto the new ring.
    const modifiedIds = new Set(touching.map(e => e.id));
    for (const car of state.cars) {
      if (!car.path.some(e => modifiedIds.has(e.id))) continue;
      const curEdge = car.path[car.pathIdx];
      // Approach edges shrank by `radius` on the junction-side end. Clamp pos
      // so the car never sits past its (now-shorter) shape.
      if (modifiedIds.has(curEdge.id)) {
        car.pos = Math.min(car.pos, Math.max(0, curEdge.length - 1));
      }
      const targetNodeId = car.destKind === 'block'
        ? state.blocks.find(b => b.id === car.blockId)?.nodeId
        : (state.entries.find(e => e.id === car.sinkEntryId) || {}).nodeId;
      if (targetNodeId == null) {
        car.path = [curEdge];
        car.pathIdx = 0;
        car.needsReroute = true;
        continue;
      }
      const onward = routeFromNode(curEdge.to, targetNodeId);
      if (!onward) {
        car.path = [curEdge];
        car.pathIdx = 0;
        car.needsReroute = true;
        continue;
      }
      car.path = [curEdge, ...onward];
      car.pathIdx = 0;
    }
    if (isGameMode()) {
      state.money -= COSTS.roundabout;
      state.effects.push({ x: node.x, y: node.y, startTime: state.time, kind: 'spend', amount: COSTS.roundabout });
    }
    scheduleSave();
    return { ok: true };
  }

  // Toggle an edge between one-way and two-way. If it currently has a reverse
  // twin, remove it (→ one-way in the direction of `edge`). If it doesn't,
  // create one (→ two-way). Works regardless of which direction was tapped.
  function toggleOneWay(edge) {
    const twin = state.edges.find(x =>
      x !== edge && x.from === edge.to && x.to === edge.from &&
      Math.abs(x.length - edge.length) < 1
    );
    if (twin) {
      state.edges = state.edges.filter(e => e.id !== twin.id);
      state.cars = state.cars.filter(c => !c.path.some(e => e.id === twin.id));
      rebuildAdjacency();
      scheduleSave();
      return { ok: true, nowOneWay: true };
    }
    // Add a reverse twin, making the road two-way again.
    const rev = {
      id: state.nextEdgeId++,
      from: edge.to, to: edge.from,
      shape: edge.shape.slice().reverse(),
      length: edge.length,
      bridge: edge.bridge,
      custom: edge.custom
    };
    state.edges.push(rev);
    rebuildAdjacency();
    scheduleSave();
    return { ok: true, nowOneWay: false };
  }

  function edgeIsOneWay(edge) {
    return !state.edges.some(x =>
      x !== edge && x.from === edge.to && x.to === edge.from &&
      Math.abs(x.length - edge.length) < 1
    );
  }

  function eraseEdgeById(edge) {
    const twin = state.edges.find(x =>
      x !== edge && x.from === edge.to && x.to === edge.from &&
      Math.abs(x.length - edge.length) < 1
    );
    const gone = new Set([edge.id]);
    if (twin) gone.add(twin.id);
    state.edges = state.edges.filter(e => !gone.has(e.id));
    state.cars = state.cars.filter(c => !c.path.some(e => gone.has(e.id)));
    rebuildAdjacency();
    scheduleSave();
  }

  // ================================================================
  // Routing
  // ================================================================
  function routeFromNode(startNodeId, targetNodeId) {
    if (startNodeId === targetNodeId) return [];
    const dist = new Map();
    const prevEdge = new Map();
    const visited = new Set();
    const q = [[0, startNodeId]];
    dist.set(startNodeId, 0);
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, u] = q.shift();
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === targetNodeId) break;
      const outs = state.adjacency.get(u) || [];
      for (const e of outs) {
        const w = e.length;
        const nd = d + w;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd); prevEdge.set(e.to, e);
          q.push([nd, e.to]);
        }
      }
    }
    if (!prevEdge.has(targetNodeId)) return null;
    const chain = [];
    let cur = targetNodeId;
    while (cur !== startNodeId && prevEdge.has(cur)) {
      const e = prevEdge.get(cur);
      chain.push(e);
      cur = e.from;
    }
    chain.reverse();
    return chain;
  }

  // (refreshRoutes removed — cars commit to their spawn-time path; in-flight
  // re-routing produced the "bounce backwards" glitch.)

  // ================================================================
  // Spawning
  // ================================================================
  function currentSpawnInterval() {
    const m = state.demandMult;
    if (m < 0.02) return Infinity;  // paused
    // v31 — external traffic (edge gates) is now driven by the city's
    // attractiveness, not a fixed clock. With NO shops or malls there's
    // nothing for visiting cars to do, so we spawn nothing. Each shop = 1,
    // each mall = 2 (matches dispatch weights). Houses don't count here —
    // they generate their *own* traffic via tryDispatchFromHouse. Sqrt
    // scaling: 1 destination → slow trickle; 16 destinations → 4× faster.
    let destWeight = 0;
    for (const b of state.blocks) {
      if (b.type === 'shop') destWeight += 1;
      else if (b.type === 'mall') destWeight += 2;
    }
    if (destWeight === 0) return Infinity;
    const ramp = Math.min(1, RAMP_START + (1 - RAMP_START) * (state.time / RAMP_TIME));
    // 16s/gate at destWeight=1; 8s/gate at 4; 4s/gate at 16.
    return 16 / (m * ramp * Math.sqrt(destWeight));
  }

  // A gate's queue should only fill when it has at least one outgoing road.
  // Otherwise four disconnected gates flood at start with nowhere to go.
  function gateHasNetwork(entry) {
    const out = state.adjacency.get(entry.nodeId);
    return !!(out && out.length);
  }

  // Category weights matching RESEARCH.md Stage A.1 — cars from an edge
  // entry pick a destination *type* first, then a random instance of that
  // type. If no instance exists, fall through to another category. That way
  // Malls pull more cars than Shops pull more than Houses, and buildings
  // feel meaningfully different from each other.
  const DISPATCH_WEIGHTS = { mall: 40, shop: 30, house: 5, exit: 25 };

  function pickDestinationCategory() {
    const total = DISPATCH_WEIGHTS.mall + DISPATCH_WEIGHTS.shop + DISPATCH_WEIGHTS.house + DISPATCH_WEIGHTS.exit;
    let r = Math.random() * total;
    for (const cat of ['mall', 'shop', 'house', 'exit']) {
      r -= DISPATCH_WEIGHTS[cat];
      if (r <= 0) return cat;
    }
    return 'exit';
  }

  function tryDispatchFromQueue(entry) {
    if (entry.queue.length === 0) return;

    // Try the rolled category first; if nothing routable, try the other
    // categories in a random order before giving up this tick.
    const order = ['exit', 'mall', 'shop', 'house'];
    const rolled = pickDestinationCategory();
    order.splice(order.indexOf(rolled), 1);
    shuffle(order);
    order.unshift(rolled);

    let path = null, destKind = 'exit', destBlockId = null, destEntryId = null;

    outer:
    for (const cat of order) {
      if (cat === 'exit') {
        const others = state.entries.filter(e => e.id !== entry.id);
        shuffle(others);
        for (const target of others) {
          const p = routeFromNode(entry.nodeId, target.nodeId);
          if (p && p.length > 0) {
            path = p; destKind = 'exit'; destEntryId = target.id; break outer;
          }
        }
      } else {
        const blocks = state.blocks.filter(b => b.type === cat);
        shuffle(blocks);
        for (const b of blocks) {
          const p = routeFromNode(entry.nodeId, b.nodeId);
          if (p && p.length > 0) {
            path = p; destKind = 'block'; destBlockId = b.id; break outer;
          }
        }
      }
    }
    if (!path) return;

    // Check the first edge has room for a newly-spawned car.
    const firstEdge = path[0];
    for (const c of state.cars) {
      if (c.path[c.pathIdx] === firstEdge && c.pos < CAR_RADIUS * 2 + CAR_GAP + 6) return;
    }

    const car = {
      id: state.nextCarId++,
      path, pathIdx: 0, pos: 0,
      speed: 0, maxSpeed: CAR_SPEED,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      destKind,               // 'block' | 'exit'
      blockId: destBlockId,   // set only when visiting
      srcEntryId: entry.id,
      sinkEntryId: destEntryId,
      spawnedAt: state.time,
      stuckTime: 0,
      hasVisited: false,
      pauseUntil: 0,
      needsReroute: false
    };
    state.cars.push(car);
    entry.queue.pop();
  }

  // Cars spawning FROM a house (internal traffic). Houses mostly drive their
  // residents to Malls/Shops; sometimes they leave town entirely.
  const HOUSE_WEIGHTS = { mall: 40, shop: 30, exit: 30 };

  function tryDispatchFromHouse(house) {
    const order = ['exit', 'mall', 'shop'];
    const total = HOUSE_WEIGHTS.mall + HOUSE_WEIGHTS.shop + HOUSE_WEIGHTS.exit;
    let r = Math.random() * total;
    let rolled = 'exit';
    for (const c of ['mall', 'shop', 'exit']) {
      r -= HOUSE_WEIGHTS[c];
      if (r <= 0) { rolled = c; break; }
    }
    order.splice(order.indexOf(rolled), 1);
    shuffle(order);
    order.unshift(rolled);

    let path = null, destKind = 'exit', destBlockId = null, destEntryId = null;
    outer:
    for (const cat of order) {
      if (cat === 'exit') {
        const exits = state.entries.slice();
        shuffle(exits);
        for (const ex of exits) {
          const p = routeFromNode(house.nodeId, ex.nodeId);
          if (p && p.length > 0) {
            path = p; destKind = 'exit'; destEntryId = ex.id; break outer;
          }
        }
      } else {
        const blocks = state.blocks.filter(b => b.type === cat && b.id !== house.id);
        shuffle(blocks);
        for (const b of blocks) {
          const p = routeFromNode(house.nodeId, b.nodeId);
          if (p && p.length > 0) {
            path = p; destKind = 'block'; destBlockId = b.id; break outer;
          }
        }
      }
    }
    if (!path) return;

    // First edge must have room for a fresh car.
    const firstEdge = path[0];
    for (const c of state.cars) {
      if (c.path[c.pathIdx] === firstEdge && c.pos < CAR_RADIUS * 2 + CAR_GAP + 6) return;
    }

    state.cars.push({
      id: state.nextCarId++,
      path, pathIdx: 0, pos: 0,
      speed: 0, maxSpeed: CAR_SPEED,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      destKind,
      blockId: destBlockId,
      srcEntryId: null,          // came from a house, not an edge
      srcBlockId: house.id,
      sinkEntryId: destEntryId,
      spawnedAt: state.time,
      stuckTime: 0,
      hasVisited: false,
      pauseUntil: 0,
      needsReroute: false
    });
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function stepSim(dt) {
    if (state.paused || state.over) return;
    state.time += dt;

    // Per-entry spawning. Each entry has its own timer.
    const interval = currentSpawnInterval();
    for (const e of state.entries) {
      e.timer = (e.timer || 0) + dt;
      const connected = gateHasNetwork(e);
      while (e.timer >= interval) {
        e.timer -= interval;
        // Only enqueue if the gate is actually connected to a road. Otherwise
        // an isolated N/S gate at start would queue cars instantly that have
        // nowhere to go, jam the meter, and crash the city before the player
        // does anything.
        if (connected && e.queue.length < 12) e.queue.push({ waitingSince: state.time });
      }
      if (connected) tryDispatchFromQueue(e);
    }

    // Houses generate internal traffic to Shops / Malls / exits.
    if (state.demandMult >= 0.02) {
      const houseInterval = HOUSE_SPAWN_INTERVAL / state.demandMult;
      for (const b of state.blocks) {
        if (b.type !== 'house') continue;
        b.timer = (b.timer || 0) + dt;
        while (b.timer >= houseInterval) {
          b.timer -= houseInterval;
          tryDispatchFromHouse(b);
        }
      }
    }

    // O(1) lookups for the per-frame loops below. Rebuilding once per step
    // is cheap; the alternative (state.blocks.find inside hot loops) was
    // O(blocks*cars) per frame and dominated lag in cities with 50+
    // buildings and 200+ cars.
    const blockById = new Map();
    for (const b of state.blocks) blockById.set(b.id, b);
    const entryById = new Map();
    for (const e of state.entries) entryById.set(e.id, e);

    // Move cars.
    const byEdge = new Map();
    for (const c of state.cars) {
      const e = c.path[c.pathIdx];
      let arr = byEdge.get(e.id);
      if (!arr) { arr = []; byEdge.set(e.id, arr); }
      arr.push(c);
    }
    // Sort each edge's cars by pos AND cache each car's index in its list,
    // so the per-car leader lookup below is O(1) instead of an indexOf scan.
    for (const arr of byEdge.values()) {
      arr.sort((a, b) => a.pos - b.pos);
      for (let i = 0; i < arr.length; i++) {
        arr[i]._idx = i;
        arr[i]._lane = arr;
      }
    }

    const toRemove = new Set();
    for (const car of state.cars) {
      // Parked at a block — count as stopped until pauseUntil expires.
      if (car.pauseUntil && state.time < car.pauseUntil) {
        car.speed = 0;
        continue;
      }
      // After pausing, reroute to a random exit (different from source).
      if (car.needsReroute) {
        car.needsReroute = false;
        const curEdge = car.path[car.pathIdx];
        const exits = state.entries.filter(e => e.id !== car.srcEntryId);
        shuffle(exits);
        let newPath = null, chosenExit = null;
        for (const x of exits) {
          const p = routeFromNode(curEdge.to, x.nodeId);
          if (p) { newPath = p; chosenExit = x; break; }
        }
        if (!newPath) {
          toRemove.push(car);
          continue;
        }
        car.path = [curEdge, ...newPath];
        car.pathIdx = 0;
        car.destKind = 'exit';
        car.sinkEntryId = chosenExit.id;
      }

      const e = car.path[car.pathIdx];
      const list = car._lane || byEdge.get(e.id) || [];
      const myIdx = (car._idx != null) ? car._idx : list.indexOf(car);
      const leader = myIdx >= 0 ? list[myIdx + 1] : null;

      let targetSpeed = car.maxSpeed;
      if (leader) {
        const gap = leader.pos - car.pos - CAR_RADIUS * 2;
        if (gap < CAR_STOP_GAP) targetSpeed = Math.max(0, leader.speed * 0.8);
        else if (gap < CAR_FOLLOW_TRIGGER) {
          // Smoothly match leader's speed when close.
          const k = (gap - CAR_STOP_GAP) / (CAR_FOLLOW_TRIGGER - CAR_STOP_GAP);
          targetSpeed = leader.speed + (car.maxSpeed - leader.speed) * k;
        }
      } else {
        // Look ahead to the next edge for a leader near its start.
        const remaining = e.length - car.pos;
        if (remaining < 60 && car.path[car.pathIdx + 1]) {
          const nextE = car.path[car.pathIdx + 1];
          const nlist = byEdge.get(nextE.id) || [];
          if (nlist.length && nlist[0].pos < 30) {
            const gap = remaining + nlist[0].pos - CAR_RADIUS * 2;
            if (gap < CAR_STOP_GAP) targetSpeed = Math.max(0, nlist[0].speed * 0.8);
            else if (gap < CAR_FOLLOW_TRIGGER) {
              const k = (gap - CAR_STOP_GAP) / (CAR_FOLLOW_TRIGGER - CAR_STOP_GAP);
              targetSpeed = nlist[0].speed + (car.maxSpeed - nlist[0].speed) * k;
            }
          }
        }
      }

      // Smooth towards targetSpeed.
      const accel = targetSpeed > car.speed ? 160 : 260;  // brake harder than accelerate
      const d = targetSpeed - car.speed;
      const maxStep = accel * dt;
      car.speed += Math.sign(d) * Math.min(Math.abs(d), maxStep);
      if (car.speed < 0) car.speed = 0;

      car.pos += car.speed * dt;

      if (car.speed < 2) car.stuckTime += dt; else car.stuckTime = 0;

      // Advance across edges.
      let curE = e;
      while (car.pos >= curE.length && car.pathIdx < car.path.length - 1) {
        car.pos -= curE.length;
        car.pathIdx++;
        curE = car.path[car.pathIdx];
      }
      if (car.pathIdx >= car.path.length - 1 && car.pos >= car.path[car.path.length - 1].length) {
        if (car.destKind === 'block' && !car.hasVisited) {
          // Reached a building — park here for the type's dwell time, then head
          // out via a random exit.
          car.hasVisited = true;
          const block = blockById.get(car.blockId);
          const dwell = block ? block.dwell : 2.2;
          car.pauseUntil = state.time + dwell;
          car.needsReroute = true;
          car.pos = car.path[car.path.length - 1].length - 0.5;
          car.speed = 0;
          if (block) {
            block.visits++;
            const spec = BUILDING_TYPES[block.type];
            const pts = (spec && spec.points) || 1;
            state.score += pts;
            state.effects.push({ x: block.x, y: block.y, startTime: state.time, kind: 'visit' });
            // In game mode, the building EARNS dollars for the city. The
            // floating popup shows $earnings instead of points so the
            // player feels the income loop directly. Park bonus stacks on
            // top of the base income — every park within PARK_RADIUS adds
            // PARK_BONUS_PER_PARK to the multiplier.
            if (isGameMode()) {
              const baseEarn = INCOME[block.type] || 0;
              const bonus = parkBonusFor(block);
              const earn = Math.round(baseEarn * (1 + bonus));
              state.money += earn;
              state.totalEarned += earn;
              state.effects.push({ x: block.x, y: block.y, startTime: state.time, kind: 'earn', amount: earn });
              checkCivicCredits();
            } else {
              state.effects.push({ x: block.x, y: block.y, startTime: state.time, kind: 'points', points: pts });
            }
            Audio.chime(block.type);
          }
          state.visits++;
          if (state.score > state.bestScore) state.bestScore = state.score;
          checkRecordBreak();
        } else {
          state.delivered++;
          state.score += DELIVERY_POINTS;
          if (state.score > state.bestScore) state.bestScore = state.score;
          checkRecordBreak();
          const exit = entryById.get(car.sinkEntryId);
          if (exit) {
            state.effects.push({ x: exit.x, y: exit.y, startTime: state.time, kind: 'deliver' });
            if (isGameMode()) {
              // Park bonus at exits — uses the gate position so a park near
              // the gate boosts every car that completes a delivery there.
              const bonus = parkBonusFor(exit);
              const earn = Math.round((INCOME.exit || 0) * (1 + bonus));
              state.money += earn;
              state.totalEarned += earn;
              state.effects.push({ x: exit.x, y: exit.y, startTime: state.time, kind: 'earn', amount: earn });
              checkCivicCredits();
            } else {
              state.effects.push({ x: exit.x, y: exit.y, startTime: state.time, kind: 'points', points: DELIVERY_POINTS });
            }
            Audio.chime('exit');
          }
          toRemove.add(car);
        }
      }
      if (car.stuckTime > 180) toRemove.add(car);
    }
    if (toRemove.size) state.cars = state.cars.filter(c => !toRemove.has(c));

    // Recompute per-building "incoming" car count for pressure-ring render.
    // An incoming car is one whose current destination is this block and it
    // hasn't arrived yet. Cheap — one pass through cars.
    for (const b of state.blocks) b.incoming = 0;
    for (const c of state.cars) {
      if (c.destKind !== 'block' || c.hasVisited) continue;
      const b = blockById.get(c.blockId);
      if (b) b.incoming++;
    }

    // Sample the per-sim-second earnings ($) so we can compute a rolling
    // $/min for the income-sustain target. Uses the same per-second cadence
    // as the flow sampler.
    if (isGameMode()) {
      if (state.earnLastSampleAt < 0) {
        state.earnLastSampleAt = state.time;
        state.earnLastTotal = state.totalEarned;
      } else if (state.time - state.earnLastSampleAt >= 1) {
        const delta = state.totalEarned - state.earnLastTotal;
        state.earnSamples.push(delta);
        if (state.earnSamples.length > 60) state.earnSamples.shift();
        state.earnLastSampleAt = state.time;
        state.earnLastTotal = state.totalEarned;
      }
      // Rolling income/min — sum of the windowed per-sec samples.
      const incomePerMin = state.earnSamples.reduce((a, b) => a + b, 0)
        * (60 / Math.max(1, state.earnSamples.length));
      const incomeDef = TARGET_DEFS.find(d => d.isIncome);
      const incomeTier = state.targetTiers[incomeDef.id] || 0;
      const threshold = targetMaxedOut(incomeDef, incomeTier)
        ? Infinity
        : targetActiveThreshold(incomeDef, incomeTier);
      if (incomePerMin >= threshold) {
        state._incomeSustainSec += dt;
      } else {
        // Reset on drop — "sustain" means continuous. Soft 2× drain instead
        // of instant zero so a single dip doesn't punish.
        state._incomeSustainSec = Math.max(0, state._incomeSustainSec - dt * 2);
      }
      // Target-hit detection — cheap, runs every step but reads small data.
      checkTargets();
    }

    // Sample the delivery-per-minute rate once per sim-second for the
    // Flow sparkline. Converts the 1s window count to a /min figure.
    if (state.flowLastSampleAt < 0) {
      state.flowLastSampleAt = state.time;
      state.flowLastCount = state.delivered;
    } else if (state.time - state.flowLastSampleAt >= 1) {
      const dt1 = state.time - state.flowLastSampleAt;
      const deltaDelivered = state.delivered - state.flowLastCount;
      const perMin = (deltaDelivered / dt1) * 60;
      state.flowSamples.push(perMin);
      if (state.flowSamples.length > 60) state.flowSamples.shift();
      // Peak tracking — notify when we break it (after a warm-up).
      if (perMin > state.flowPeak + 0.5 && state.time > 10) {
        state.flowPeak = perMin;
        toast(`New peak flow: ${Math.round(perMin)}/min`, 1600);
      } else if (perMin > state.flowPeak) {
        state.flowPeak = perMin;
      }
      state.flowLastSampleAt = state.time;
      state.flowLastCount = state.delivered;
    }

    // Age out visual effects — points popups live longer than bursts.
    if (state.effects.length) {
      state.effects = state.effects.filter(fx => {
        const maxAge = fx.kind === 'points' ? 1.1 : 0.8;
        return state.time - fx.startTime < maxAge;
      });
    }

    // Jam meter: fills from two pressures.
    //   1. Gate-queue overflow (cars piling up at the entries with nowhere to
    //      dispatch).
    //   2. In-flight stuck cars (cars idling mid-city — building queues,
    //      junction snarls). Without (2) the meter ignored most real jams
    //      until the gates choked, which is much later than the player would
    //      expect from watching the city.
    let jamPressure = 0;
    for (const e of state.entries) {
      if (e.queue.length >= QUEUE_FAIL_SIZE) jamPressure += (e.queue.length - QUEUE_FAIL_SIZE + 1);
    }
    let stuckCount = 0;
    for (const c of state.cars) {
      if (c.stuckTime <= 4) continue;
      if (c.pauseUntil && state.time < c.pauseUntil) continue;   // parked, not stuck
      // Cars patiently queueing at their destination are organic demand,
      // not gridlock. If a car is on its FINAL path edge heading to a
      // building, it's bunching at the curb behind earlier arrivals — let
      // the per-building pressure ring report that, not the city-wide jam
      // meter. Otherwise a popular mall would always show as "city jammed."
      if (c.destKind === 'block' && c.pathIdx === c.path.length - 1) continue;
      stuckCount++;
    }
    const STUCK_THRESHOLD = 8;
    if (stuckCount > STUCK_THRESHOLD) {
      jamPressure += (stuckCount - STUCK_THRESHOLD) * 0.4;
    }
    if (jamPressure > 0) state.jamMeter = Math.min(JAM_FAIL, state.jamMeter + JAM_FILL_RATE * dt * Math.max(1, jamPressure / 3));
    else state.jamMeter = Math.max(0, state.jamMeter - JAM_DRAIN_RATE * dt);

    // Game-mode crash condition — sustained near-max jam triggers a
    // city collapse. Sandbox keeps the meter purely visual.
    if (isGameMode()) {
      // Track peak population for the post-game stats card.
      const ppl = state.blocks.reduce((n, b) => n + (b.type === 'house' ? 2 : 0), 0);
      if (ppl > state.peakPeople) state.peakPeople = ppl;

      if (state.jamMeter >= OVERLOAD_JAM) {
        state.overloadTimer += dt;
      } else {
        state.overloadTimer = Math.max(0, state.overloadTimer - dt * 0.5);
      }
      // Warning flash at 50% / 75% of overload time.
      if (state.overloadTimer > 0 && !state.over) {
        const warnT = state.overloadTimer;
        if (warnT > OVERLOAD_TIME * 0.5 && !state._warnedHalf) {
          state._warnedHalf = true;
          toast('City overwhelmed — jam clearing or collapse!', 2400);
        }
        if (warnT >= OVERLOAD_TIME) {
          endGameCrash();
        }
      } else if (state.overloadTimer === 0) {
        state._warnedHalf = false;
      }
    }
    // Sandbox mode — no game-over popup, just the visible jam bar.
  }

  // ================================================================
  // Render
  // ================================================================
  let canvas, ctx;

  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * state.view.dpr;
    canvas.height = r.height * state.view.dpr;
    state.view.w = r.width;
    state.view.h = r.height;
    fitCamera();
  }

  function fitCamera() {
    // Default view shows a centred ~1200×1600 window into the bigger map.
    // Player pans (2-finger) and pinch-zooms to explore the rest.
    const SHOW_W = 1200, SHOW_H = 1600;
    const pad = 40;
    const sx = (state.view.w - pad * 2) / SHOW_W;
    const sy = (state.view.h - pad * 2) / SHOW_H;
    state.view.scale = Math.min(sx, sy);
    state.view.originX = LOGICAL_W / 2;
    state.view.originY = LOGICAL_H / 2;
  }

  function w2s(x, y) {
    return {
      sx: (x - state.view.originX) * state.view.scale + state.view.w / 2,
      sy: (y - state.view.originY) * state.view.scale + state.view.h / 2
    };
  }
  function s2w(sx, sy) {
    return {
      x: (sx - state.view.w / 2) / state.view.scale + state.view.originX,
      y: (sy - state.view.h / 2) / state.view.scale + state.view.originY
    };
  }

  function render() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Parkland gradient — proper sage, warm enough to stay calm but now
    // actually green. Darker than v25.
    const cw = canvas.width, ch = canvas.height;
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0,
                                          cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    grad.addColorStop(0.0, '#d4dfae');
    grad.addColorStop(0.55, '#bfcd93');
    grad.addColorStop(1.0, '#a6b87a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    ctx.scale(state.view.dpr, state.view.dpr);

    drawGrid();
    drawLakes();
    drawDecor();
    drawRoads();
    drawBlocks();
    drawEntries();
    drawCars();
    drawEffects();
    drawDragPreview();

    // Day/night tint — applied across the whole canvas in screen coords,
    // then sparse stars are drawn on top (so the dark overlay doesn't cover
    // them).
    const tint = currentTint();
    if (tint.a > 0.005) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(${tint.r | 0}, ${tint.g | 0}, ${tint.b | 0}, ${tint.a})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars fade in once the night tint crosses 0.22 alpha.
      if (tint.a > 0.22 && state.stars) {
        const starAlpha = Math.min(0.8, (tint.a - 0.22) * 4);
        ctx.scale(state.view.dpr, state.view.dpr);
        for (const star of state.stars) {
          const p = w2s(star.x, star.y);
          if (p.sx < -2 || p.sx > state.view.w + 2 || p.sy < -2 || p.sy > state.view.h + 2) continue;
          const tw = 0.7 + 0.3 * Math.sin(state.time * 1.2 + star.twinkle * 6.28);
          ctx.fillStyle = `rgba(255, 245, 205, ${starAlpha * tw})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  function drawRoads() {
    const scale = state.view.scale;

    // Pass 1 — non-bridge roads first (regular asphalt). Drawn underneath so
    // bridges layer on top and clearly read as "above".
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
      if (e.bridge) continue;
      drawPolyline(e.shape, 26 * scale, '#1b1f2b');
    }
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
      if (e.bridge) continue;
      drawPolyline(e.shape, 22 * scale, '#2d3242');
    }

    // Pass 2 — bridges, distinct warm stone colour with drop shadow + side
    // rails so they're unmistakable against the dark road surface. The user
    // explicitly asked for bridges to look like bridges, not roads.
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
      if (!e.bridge) continue;
      // Drop shadow — slight offset down/right gives the elevated feel.
      ctx.save();
      ctx.translate(2 * scale, 4 * scale);
      drawPolyline(e.shape, 30 * scale, 'rgba(30, 35, 50, 0.35)');
      ctx.restore();
      // Outer wood/stone frame
      drawPolyline(e.shape, 28 * scale, '#7a5a32');
      // Side rails — render the full width slightly darker, then the centre
      // stone surface narrower on top, leaving 2px of rail showing on each
      // side. Cheap pseudo-railing without computing perpendiculars.
      drawPolyline(e.shape, 24 * scale, '#a47a44');
      drawPolyline(e.shape, 18 * scale, '#e0c79a');
      // Plank stripes — short perpendicular dashes evenly along the bridge
      // give an unmistakable "bridge" read at a glance.
      ctx.save();
      ctx.strokeStyle = 'rgba(122, 90, 50, 0.55)';
      ctx.lineCap = 'butt';
      ctx.lineWidth = Math.max(1, 1.4 * scale);
      const plankSpacing = 14;  // world units between planks
      const plankCount = Math.max(2, Math.floor(e.length / plankSpacing));
      for (let i = 0; i < plankCount; i++) {
        const d = (e.length / plankCount) * (i + 0.5);
        const sp = sampleEdge(e, d);
        // perpendicular vector (px, py)
        const px = -sp.hy, py = sp.hx;
        const half = 9 * scale;
        const a = w2s(sp.x - px * half / scale, sp.y - py * half / scale);
        const b = w2s(sp.x + px * half / scale, sp.y + py * half / scale);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Dashed centre stripe — only on two-way non-bridge roads.
    ctx.save();
    ctx.setLineDash([10 * scale, 12 * scale]);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255, 239, 210, 0.7)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
      if (e.bridge) continue;
      if (edgeIsOneWay(e)) continue;
      drawPolyline(e.shape, 0, null, true);
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Direction chevrons — only on one-way edges (no twin).
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 239, 210, 0.92)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.6, 2 * state.view.scale);
    const chevSize = Math.max(3, 5 * state.view.scale);
    for (const e of state.edges) {
      if (!edgeIsOneWay(e)) continue;
      const count = Math.max(1, Math.floor(e.length / 55));
      for (let i = 0; i < count; i++) {
        const d = (e.length / count) * (i + 0.5);
        const sp = sampleEdge(e, d);
        drawChevron(sp.x, sp.y, sp.hx, sp.hy, chevSize);
      }
    }
    ctx.restore();
  }

  function drawChevron(wx, wy, hx, hy, size) {
    // Centered at world (wx, wy), pointing in world direction (hx, hy).
    const px = -hy, py = hx;
    const p1 = w2s(wx - hx * size - px * size * 0.75, wy - hy * size - py * size * 0.75);
    const pT = w2s(wx + hx * size,                     wy + hy * size);
    const p2 = w2s(wx - hx * size + px * size * 0.75, wy - hy * size + py * size * 0.75);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(pT.sx, pT.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.stroke();
  }

  function drawPolyline(pts, w, color, strokeOnly) {
    if (pts.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!strokeOnly) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
    }
    ctx.beginPath();
    const p0 = w2s(pts[0].x, pts[0].y);
    ctx.moveTo(p0.sx, p0.sy);
    for (let i = 1; i < pts.length; i++) {
      const p = w2s(pts[i].x, pts[i].y);
      ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
  }

  // Ambient decoration — sparse trees / grass tufts in "empty land" so the
  // canvas doesn't feel like a blank page. Generated ONCE per level with a
  // fixed seed so placements are stable across reloads.
  // Pre-seed stars once at boot — same pattern every session.
  function generateStars() {
    state.stars = [];
    let seed = 2024;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 70; i++) {
      state.stars.push({
        x: rand() * LOGICAL_W,
        y: rand() * LOGICAL_H * 0.6,   // cluster stars in the upper 60% of the sky
        size: 0.7 + rand() * 1.0,
        twinkle: rand()
      });
    }
  }

  function currentTint() {
    const f = ((state.time % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH / DAY_LENGTH;
    for (let i = 0; i < DAY_PHASES.length - 1; i++) {
      const p1 = DAY_PHASES[i], p2 = DAY_PHASES[i + 1];
      if (f >= p1.t && f <= p2.t) {
        const span = p2.t - p1.t || 1;
        const k = (f - p1.t) / span;
        return {
          r: p1.r + (p2.r - p1.r) * k,
          g: p1.g + (p2.g - p1.g) * k,
          b: p1.b + (p2.b - p1.b) * k,
          a: p1.a + (p2.a - p1.a) * k
        };
      }
    }
    return DAY_PHASES[0];
  }

  function generateDecor() {
    state.decor = [];
    let seed = 1337;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    function inAnyLake(x, y) {
      if (!LEVEL.lakes) return false;
      for (const L of LEVEL.lakes) {
        if ((x - L.cx) ** 2 + (y - L.cy) ** 2 < (L.r + 6) ** 2) return true;
      }
      return false;
    }
    for (let x = GRID; x < LOGICAL_W; x += GRID) {
      for (let y = GRID; y < LOGICAL_H; y += GRID) {
        if (rand() > 0.14) continue;
        const r = rand();
        const kind = r < 0.32 ? 'tree' : r < 0.72 ? 'grass' : 'flower';
        const dx = (rand() - 0.5) * 28;
        const dy = (rand() - 0.5) * 28;
        if (inAnyLake(x + dx, y + dy)) continue;
        state.decor.push({
          x: x + dx,
          y: y + dy,
          kind,
          size: 0.8 + rand() * 0.5,
          tint: Math.floor(rand() * 5)
        });
      }
    }
  }

  const TREE_TINTS  = ['#8ea87c', '#7f9c70', '#9ab386', '#889e76'];
  const GRASS_TINTS = ['rgba(132,165,110,0.5)', 'rgba(118,155,95,0.5)',
                       'rgba(145,175,120,0.55)', 'rgba(108,145,90,0.5)'];
  const FLOWER_TINTS = ['#db6d51', '#e8a13a', '#c65893', '#6a9f4a', '#a065c3'];

  // Static water features — pretty calm pools the city has to route around
  // (or bridge over). Drawn between the ground and decor so the trees / grass
  // tufts inside the radius stay hidden behind the water.
  function drawLakes() {
    if (!LEVEL.lakes || !LEVEL.lakes.length) return;
    const s = state.view.scale;
    for (const L of LEVEL.lakes) {
      const c = w2s(L.cx, L.cy);
      const rPx = L.r * s;
      // Soft outer halo — moisture / shore line, gives the water a gentle
      // edge instead of a hard circle.
      const grad = ctx.createRadialGradient(c.sx, c.sy, rPx * 0.6, c.sx, c.sy, rPx * 1.05);
      grad.addColorStop(0, 'rgba(120, 175, 195, 1)');
      grad.addColorStop(0.85, 'rgba(120, 175, 195, 1)');
      grad.addColorStop(1, 'rgba(120, 175, 195, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, rPx * 1.05, 0, Math.PI * 2);
      ctx.fill();
      // Main water body — slightly darker teal inside.
      const water = ctx.createRadialGradient(c.sx - rPx * 0.25, c.sy - rPx * 0.25, rPx * 0.1,
                                              c.sx, c.sy, rPx);
      water.addColorStop(0, '#a8d2dd');
      water.addColorStop(0.6, '#6f9fb6');
      water.addColorStop(1, '#557f95');
      ctx.fillStyle = water;
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, rPx, 0, Math.PI * 2);
      ctx.fill();
      // Subtle highlight curve — a single soft arc reads as "shimmer."
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = Math.max(1, 1.2 * s);
      ctx.beginPath();
      ctx.arc(c.sx - rPx * 0.18, c.sy - rPx * 0.18, rPx * 0.55, Math.PI * 0.85, Math.PI * 1.4);
      ctx.stroke();
      // Two thin ripple lines, gently animated by state.time so the water
      // feels alive without distracting motion.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = Math.max(0.8, 0.9 * s);
      const phase = (state.time * 0.5) % 1;
      for (let i = 0; i < 2; i++) {
        const t = (phase + i * 0.5) % 1;
        const ripR = rPx * (0.35 + 0.4 * t);
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, ripR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawDecor() {
    if (!state.decor) return;
    const s = state.view.scale;
    const margin = 30;
    const vw = state.view.w, vh = state.view.h;
    for (const d of state.decor) {
      const p = w2s(d.x, d.y);
      if (p.sx < -margin || p.sx > vw + margin ||
          p.sy < -margin || p.sy > vh + margin) continue;
      if (d.kind === 'tree') {
        // Soft shadow
        ctx.fillStyle = 'rgba(30, 35, 50, 0.12)';
        ctx.beginPath();
        ctx.ellipse(p.sx + 1.5, p.sy + 4 * s, 9 * s * d.size, 3 * s * d.size, 0, 0, Math.PI * 2);
        ctx.fill();
        // Canopy
        ctx.fillStyle = TREE_TINTS[d.tint % TREE_TINTS.length];
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 8 * s * d.size, 0, Math.PI * 2);
        ctx.fill();
        // Darker inner crescent hint of volume
        ctx.fillStyle = 'rgba(60, 85, 55, 0.22)';
        ctx.beginPath();
        ctx.arc(p.sx + 2 * s * d.size, p.sy + 2 * s * d.size, 5.5 * s * d.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'grass') {
        // Grass tuft — three tiny dots in a cluster
        ctx.fillStyle = GRASS_TINTS[d.tint % GRASS_TINTS.length];
        const r = 1.8 * s * d.size;
        ctx.beginPath();
        ctx.arc(p.sx,        p.sy,         r, 0, Math.PI * 2);
        ctx.arc(p.sx - 3 * s * d.size, p.sy + 1.5 * s * d.size, r, 0, Math.PI * 2);
        ctx.arc(p.sx + 3 * s * d.size, p.sy + 1.5 * s * d.size, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Flower patch — bright centre petal with a soft green base
        const r = 2.2 * s * d.size;
        ctx.fillStyle = 'rgba(132, 165, 110, 0.4)';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = FLOWER_TINTS[d.tint % FLOWER_TINTS.length];
        ctx.beginPath();
        ctx.arc(p.sx,           p.sy,           r, 0, Math.PI * 2);
        ctx.arc(p.sx - r * 1.3, p.sy,           r * 0.7, 0, Math.PI * 2);
        ctx.arc(p.sx + r * 1.3, p.sy,           r * 0.7, 0, Math.PI * 2);
        ctx.arc(p.sx,           p.sy - r * 1.3, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        // Tiny yellow centre dot on the main flower
        ctx.fillStyle = 'rgba(250, 220, 120, 0.9)';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGrid() {
    // Only draw dots inside the visible viewport — saves a lot of work at zoom.
    const tl = s2w(0, 0);
    const br = s2w(state.view.w, state.view.h);
    const minX = Math.max(0, Math.floor(tl.x / GRID) * GRID);
    const maxX = Math.min(LOGICAL_W, Math.ceil(br.x / GRID) * GRID);
    const minY = Math.max(0, Math.floor(tl.y / GRID) * GRID);
    const maxY = Math.min(LOGICAL_H, Math.ceil(br.y / GRID) * GRID);

    // Fade dots out at very far zoom-out so they don't clutter.
    const alpha = Math.min(0.18, 0.06 + state.view.scale * 0.18);
    ctx.fillStyle = `rgba(30, 35, 50, ${alpha})`;
    const r = Math.max(1, 1.4 * state.view.scale);

    for (let x = minX; x <= maxX; x += GRID) {
      for (let y = minY; y <= maxY; y += GRID) {
        const p = w2s(x, y);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Adds a rounded-rect path to ctx — caller beginPath()/fill()/stroke() around it.
  function roundedRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawBlocks() {
    const margin = 80;
    const vw = state.view.w, vh = state.view.h;
    for (const b of state.blocks) {
      const p = w2s(b.x, b.y);
      // Viewport cull — buildings outside the visible area are skipped.
      // Park halo extends ±PARK_RADIUS so widen the margin for parks.
      const m = b.type === 'park' ? margin + PARK_RADIUS * state.view.scale : margin;
      if (p.sx < -m || p.sx > vw + m || p.sy < -m || p.sy > vh + m) continue;
      const s = state.view.scale;
      const type = b.type || 'shop';
      const sizeMul = b.size === 2 ? 1.5 : 1;

      // Pressure ring — Mini Metro-style arc behind the building. Fills up
      // based on how many cars are heading here right now. Decorative
      // blocks (parks) skip this — they have no incoming car concept.
      const buildingSpec = BUILDING_TYPES[type];
      const isDecorative = buildingSpec && buildingSpec.decorative;
      const incoming = b.incoming || 0;
      const capacity = b.size === 2 ? 5 : 3;   // Mall handles more load
      const pressure = isDecorative ? 0 : Math.min(1, incoming / capacity);

      // Park bonus halo — soft green circle showing the +25% income radius.
      if (type === 'park') {
        const haloR = PARK_RADIUS * s;
        ctx.fillStyle = 'rgba(120, 175, 90, 0.07)';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 130, 60, 0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, haloR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (pressure > 0.02) {
        const ringR = 34 * s * sizeMul;
        const ringW = Math.max(3, 4 * s);
        // Soft backplate so the ring reads on the warm background.
        ctx.fillStyle = 'rgba(30, 35, 50, 0.05)';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, ringR + ringW / 2, 0, Math.PI * 2);
        ctx.fill();
        // Colour ramps from calm green → amber → alarm red.
        const r = Math.round(79  + (219 - 79)  * pressure);
        const g = Math.round(161 + (109 - 161) * pressure);
        const bl= Math.round(106 + (81  - 106) * pressure);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${0.35 + 0.45 * pressure})`;
        ctx.lineWidth = ringW;
        ctx.lineCap = 'round';
        const start = -Math.PI / 2;
        const end = start + pressure * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, ringR, start, end);
        ctx.stroke();
      }

      // Shadow — skip for house/shop (their plot already grounds them with
      // its own subtle shadow). Mall keeps the broad shadow because its
      // parking lot doesn't fully wrap the building.
      if (type === 'mall') {
        ctx.fillStyle = 'rgba(30, 35, 50, 0.18)';
        ctx.beginPath();
        ctx.ellipse(p.sx + 2, p.sy + 5 * s, 26 * s * sizeMul, 10 * s * sizeMul, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (type === 'house') drawHouse(p.sx, p.sy, s, b.id);
      else if (type === 'mall') drawMall(p.sx, p.sy, s);
      else if (type === 'park') drawPark(p.sx, p.sy, s, b.id);
      else drawShop(p.sx, p.sy, s, b.id);
    }
  }

  // Park — a sizeable green block with several trees, a bench, a winding
  // path, and a small flowerbed. The footprint is large enough that two
  // adjacent parks read as one continuous "park zone" — the user asked
  // for parks the size of four old ones.
  function drawPark(cx, cy, s, seed = 0) {
    const plotR = 50 * s;
    // Two-tone lawn — slightly darker outer ring, lighter centre — gives
    // the park visible depth at zoom-out without extra geometry.
    ctx.fillStyle = '#8db867';
    ctx.beginPath();
    roundedRect(cx - plotR, cy - plotR, plotR * 2, plotR * 2, plotR * 0.22);
    ctx.fill();
    ctx.fillStyle = '#a8cf83';
    ctx.beginPath();
    roundedRect(cx - plotR + 5 * s, cy - plotR + 5 * s,
                plotR * 2 - 10 * s, plotR * 2 - 10 * s, plotR * 0.18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 80, 50, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundedRect(cx - plotR, cy - plotR, plotR * 2, plotR * 2, plotR * 0.22);
    ctx.stroke();
    // Cream path winding through, wider than before so it reads at zoom.
    ctx.strokeStyle = 'rgba(244, 234, 213, 0.78)';
    ctx.lineWidth = 6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - plotR + 8 * s, cy + 14 * s);
    ctx.quadraticCurveTo(cx - 4 * s, cy - 4 * s, cx + 6 * s, cy - 8 * s);
    ctx.quadraticCurveTo(cx + plotR * 0.4, cy - plotR * 0.2, cx + plotR - 8 * s, cy + 12 * s);
    ctx.stroke();
    // Pond on the lower-right — a tiny calm puddle adds variety without
    // turning the park into a forest.
    ctx.fillStyle = '#7fb6cc';
    ctx.beginPath();
    ctx.ellipse(cx + 22 * s, cy + 22 * s, 9 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 70, 90, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Five trees scattered round the plot — bigger, fluffier than v32.
    const trees = [
      { dx: -28, dy: -22, r: 11 },
      { dx:  -8, dy: -32, r:  9 },
      { dx:  22, dy: -20, r: 12 },
      { dx: -30, dy:  18, r: 10 },
      { dx:  10, dy:   2, r:  8 }
    ];
    for (const t of trees) {
      const tx = cx + t.dx * s, ty = cy + t.dy * s;
      // Soft shadow grounds the canopy
      ctx.fillStyle = 'rgba(30, 45, 25, 0.18)';
      ctx.beginPath();
      ctx.ellipse(tx + 1.2 * s, ty + t.r * s * 0.55, t.r * s, t.r * s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Trunk
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(tx - 1.8 * s, ty + t.r * s * 0.4, 3.6 * s, t.r * s * 0.7);
      // Canopy
      ctx.fillStyle = '#3e7a38';
      ctx.beginPath();
      ctx.arc(tx, ty, t.r * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 50, 30, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(tx - t.r * s * 0.35, ty - t.r * s * 0.35, t.r * s * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flower beds — two clusters of four flowers (red + yellow + pink + amber).
    const FLOWERS = ['#e85871', '#f5d040', '#a850c8', '#e8a13a'];
    const beds = [{ bx: 6, by: 24 }, { bx: -22, by: -2 }];
    for (const bed of beds) {
      for (let i = 0; i < 4; i++) {
        const fx = cx + (bed.bx + (i - 1.5) * 4) * s;
        const fy = cy + bed.by * s;
        ctx.fillStyle = FLOWERS[i];
        ctx.beginPath();
        ctx.arc(fx, fy, 1.6 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Bench — slightly bigger to scale with the new plot.
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(cx - 11 * s, cy + 32 * s, 22 * s, 3.5 * s);
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 11 * s, cy + 32 * s, 22 * s, 3.5 * s);
    // Bench legs — small dark dashes underneath
    ctx.fillStyle = 'rgba(50, 35, 20, 0.85)';
    ctx.fillRect(cx - 9 * s,  cy + 35.5 * s, 1.5 * s, 3 * s);
    ctx.fillRect(cx + 7.5 * s, cy + 35.5 * s, 1.5 * s, 3 * s);
  }

  const HOUSE_BODY = ['#f0dbb2', '#ecd1a7', '#e9c899', '#eed7b3', '#e2c29a', '#f2e0ba'];
  const HOUSE_ROOF = ['#8a5c3e', '#7d4f2f', '#94633e', '#80513a', '#a06846'];
  const SHOP_AWNING = ['#db6d51', '#c74a3d', '#d6a05a', '#4fa16a', '#5987c2'];

  // Cheap pseudo-random hash for seeded sprig placement on plots.
  function seedHash(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  // A "plot" is the soft tinted square around a building. It's the visual
  // claim of land that matches the placement footprint, so the player can
  // see exactly how much space a building will take. Sprigs of greenery /
  // texture are seeded per building so neighbours don't look identical.
  function drawPlot(cx, cy, plotR, fillCol, sprigCols, seed) {
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    roundedRect(cx - plotR, cy - plotR, plotR * 2, plotR * 2, plotR * 0.22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 90, 60, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 4 sprigs scattered in the plot, away from the central building body.
    for (let i = 0; i < 4; i++) {
      const px = cx - plotR + plotR * 0.16 + seedHash(seed * 17 + i) * plotR * 1.68;
      const py = cy - plotR + plotR * 0.16 + seedHash(seed * 31 + i + 5) * plotR * 1.68;
      if (Math.hypot(px - cx, py - cy) < plotR * 0.62) continue;
      ctx.fillStyle = sprigCols[i % sprigCols.length];
      ctx.beginPath();
      ctx.arc(px, py, plotR * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }
    // Soft grounding shadow under the building — small, sits inside the plot.
    ctx.fillStyle = 'rgba(30, 35, 50, 0.14)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + plotR * 0.4, plotR * 0.6, plotR * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHouse(cx, cy, s, seed = 0) {
    // v31 — bigger garden so houses feel like proper residences with room
    // to breathe, not crammed-together blocks. Plot is ~70 world units
    // wide; adjacent grid placements (60 apart) blend their lawns into
    // continuous green which reads as a neighbourhood rather than a wall.
    const plotR = 35 * s;
    // Soft hedge-darker base under the lawn for depth.
    ctx.fillStyle = '#9bbf6d';
    ctx.beginPath();
    roundedRect(cx - plotR, cy - plotR, plotR * 2, plotR * 2, plotR * 0.22);
    ctx.fill();
    // Bright lawn on top, slightly inset.
    ctx.fillStyle = '#bfd690';
    ctx.beginPath();
    roundedRect(cx - plotR + 2 * s, cy - plotR + 2 * s, plotR * 2 - 4 * s, plotR * 2 - 4 * s, plotR * 0.18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 90, 50, 0.32)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Grass texture patches (varied tones) — seeded so each house looks
    // unique but stable across reloads.
    const grasses = ['#a8c97e', '#9fc275', '#b6cf85', '#92ba66'];
    for (let i = 0; i < 7; i++) {
      const px = cx + (seedHash(seed * 13 + i) - 0.5) * plotR * 1.6;
      const py = cy + (seedHash(seed * 19 + i + 3) - 0.5) * plotR * 1.6;
      if (Math.hypot(px - cx, py - cy) < 18 * s) continue;  // away from house body
      ctx.fillStyle = grasses[i % grasses.length];
      ctx.beginPath();
      ctx.arc(px, py, plotR * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bright flower clusters — 4 colours, seeded positions. Buildings only
    // get flowers in the corners of their plot so the eye focuses on the
    // house body itself.
    const flowers = ['#e8a857', '#e85871', '#a850c8', '#f5d040', '#ee85a5'];
    for (let i = 0; i < 5; i++) {
      const px = cx + (seedHash(seed * 23 + i + 7) - 0.5) * plotR * 1.7;
      const py = cy + (seedHash(seed * 29 + i + 11) - 0.5) * plotR * 1.7;
      if (Math.hypot(px - cx, py - cy) < 22 * s) continue;
      ctx.fillStyle = flowers[i % flowers.length];
      ctx.beginPath();
      ctx.arc(px, py, plotR * 0.06, 0, Math.PI * 2);
      ctx.fill();
      // Tiny green stem
      ctx.fillStyle = '#5b8a55';
      ctx.fillRect(px - 0.5 * s, py + plotR * 0.06, 1 * s, 2 * s);
    }

    // Stone path from south plot edge up to the door — gives the house a
    // sense of arrival.
    ctx.strokeStyle = 'rgba(220, 210, 180, 0.85)';
    ctx.lineWidth = 4 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy + plotR - 2 * s);
    ctx.lineTo(cx, cy + 16 * s);
    ctx.stroke();

    // Soft grounding shadow under the house body.
    ctx.fillStyle = 'rgba(30, 35, 50, 0.14)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16 * s, 22 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    const w = 44 * s, h = 38 * s;
    const bodyTop = cy - h / 2 + 8 * s;
    const bodyBot = cy + h / 2;
    const bodyCol = HOUSE_BODY[seed % HOUSE_BODY.length];
    const roofCol = HOUSE_ROOF[seed % HOUSE_ROOF.length];
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.6)';
    ctx.lineWidth = 1.5;

    // Chimney first — rendered behind the roof.
    const cxOff = 10 * s;
    ctx.fillStyle = '#7a5032';
    ctx.beginPath();
    ctx.rect(cx + cxOff, cy - h / 2 - 10 * s, 6 * s, 10 * s);
    ctx.fill(); ctx.stroke();

    // Pitched roof
    ctx.fillStyle = roofCol;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 4 * s, bodyTop);
    ctx.lineTo(cx, cy - h / 2 - 10 * s);
    ctx.lineTo(cx + w / 2 + 4 * s, bodyTop);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Body
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    roundedRect(cx - w / 2, bodyTop, w, bodyBot - bodyTop, 3 * s);
    ctx.fill(); ctx.stroke();

    // Door
    ctx.fillStyle = '#6b4a2f';
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.55)';
    ctx.lineWidth = 1;
    const dw = 9 * s, dh = 13 * s;
    ctx.beginPath();
    ctx.moveTo(cx - dw / 2, bodyBot);
    ctx.lineTo(cx - dw / 2, bodyBot - dh + 2 * s);
    ctx.quadraticCurveTo(cx - dw / 2, bodyBot - dh, cx - dw / 2 + 2 * s, bodyBot - dh);
    ctx.lineTo(cx + dw / 2 - 2 * s, bodyBot - dh);
    ctx.quadraticCurveTo(cx + dw / 2, bodyBot - dh, cx + dw / 2, bodyBot - dh + 2 * s);
    ctx.lineTo(cx + dw / 2, bodyBot);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Door knob
    ctx.fillStyle = '#d4b04a';
    ctx.beginPath();
    ctx.arc(cx + dw / 2 - 2 * s, bodyBot - dh / 2, Math.max(0.8, 1.1 * s), 0, Math.PI * 2);
    ctx.fill();

    // Windows with cross mullions.
    const ww = 8 * s, wh = 8 * s;
    const winY = bodyTop + 5 * s;
    const wins = [ { x: cx - 15 * s }, { x: cx + 7 * s } ];
    for (const win of wins) {
      ctx.fillStyle = 'rgba(220, 235, 250, 0.88)';
      ctx.strokeStyle = 'rgba(30, 35, 50, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(win.x, winY, ww, wh);
      ctx.fill(); ctx.stroke();
      // Mullions
      ctx.strokeStyle = 'rgba(30, 35, 50, 0.45)';
      ctx.beginPath();
      ctx.moveTo(win.x + ww / 2, winY); ctx.lineTo(win.x + ww / 2, winY + wh);
      ctx.moveTo(win.x, winY + wh / 2); ctx.lineTo(win.x + ww, winY + wh / 2);
      ctx.stroke();
    }
  }

  function drawShop(cx, cy, s, seed = 0) {
    // Plaza plot — slightly warmer / sandier than a house garden so shops
    // read as "commercial". Same footprint, so placement intuitions
    // transfer between building types.
    drawPlot(cx, cy, 28 * s, '#dcd1b3',
             ['#a89880', '#8a7d65', '#bfa988', '#7d8a72'], seed + 100);

    const w = 46 * s, h = 42 * s;
    const awning = SHOP_AWNING[seed % SHOP_AWNING.length];
    const awningDark = shadeColor(awning, -0.15);
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.6)';
    ctx.lineWidth = 1.5;

    // Body
    ctx.fillStyle = '#c7a88c';
    ctx.beginPath();
    roundedRect(cx - w / 2, cy - h / 2, w, h, 5 * s);
    ctx.fill(); ctx.stroke();

    // Sign band (dark slate top)
    ctx.fillStyle = 'rgba(30, 35, 50, 0.42)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, 8 * s);
    // Tiny white "SHOP" dot pattern on the sign band
    ctx.fillStyle = 'rgba(255, 250, 238, 0.85)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(cx - 10 * s + i * 6 * s, cy - h / 2 + 3 * s, 3 * s, 3 * s);
    }

    // Awning — striped fabric
    const ay = cy - h / 2 + 8 * s, ah = 7 * s;
    ctx.fillStyle = awning;
    ctx.fillRect(cx - w / 2, ay, w, ah);
    // Stripes
    ctx.fillStyle = awningDark;
    const stripeW = w / 5;
    for (let i = 0; i < 5; i += 2) {
      ctx.fillRect(cx - w / 2 + i * stripeW, ay, stripeW, ah);
    }
    // Zigzag trim under the awning
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, ay + ah);
    const zn = 7;
    for (let i = 0; i < zn; i++) {
      const x0 = cx - w / 2 + (w / zn) * i;
      const x1 = cx - w / 2 + (w / zn) * (i + 1);
      ctx.lineTo((x0 + x1) / 2, ay + ah + 3.5 * s);
      ctx.lineTo(x1, ay + ah);
    }
    ctx.fillStyle = awning;
    ctx.fill();

    // Big shopfront window with a mullion + door.
    const winY = ay + ah + 6 * s, winH = cy + h / 2 - winY - 2 * s;
    const winX = cx - w / 2 + 4 * s, winW = w - 8 * s;
    ctx.fillStyle = 'rgba(220, 235, 250, 0.92)';
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(winX, winY, winW, winH); ctx.fill(); ctx.stroke();
    // Door (right third)
    const dw = winW * 0.3, dh = winH;
    const dx = winX + winW - dw;
    ctx.fillStyle = shadeColor(awning, -0.2);
    ctx.fillRect(dx, winY, dw, dh);
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.6)';
    ctx.strokeRect(dx, winY, dw, dh);
    // Window mullions (2 vertical lines in the glass portion)
    const glassW = winW - dw;
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = winX + (glassW / 3) * i;
      ctx.beginPath(); ctx.moveTo(x, winY); ctx.lineTo(x, winY + winH); ctx.stroke();
    }
  }

  // Helper — darken/lighten a hex colour by a factor (-1..1).
  function shadeColor(hex, amt) {
    const c = hex.startsWith('#') ? hex.slice(1) : hex;
    let r = parseInt(c.slice(0, 2), 16);
    let g = parseInt(c.slice(2, 4), 16);
    let b = parseInt(c.slice(4, 6), 16);
    const f = (x) => Math.max(0, Math.min(255, Math.round(x + (amt > 0 ? (255 - x) : x) * amt)));
    r = f(r); g = f(g); b = f(b);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function drawMall(cx, cy, s) {
    const w = 80 * s, h = 56 * s;
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.65)';
    ctx.lineWidth = 1.5;

    // Parking-lot hint — light band under the building.
    ctx.fillStyle = 'rgba(150, 150, 160, 0.38)';
    ctx.beginPath();
    roundedRect(cx - w / 2 - 5 * s, cy - h / 2 + 2 * s, w + 10 * s, h + 5 * s, 6 * s);
    ctx.fill();
    // Parking stripes
    ctx.strokeStyle = 'rgba(255, 250, 238, 0.75)';
    ctx.lineWidth = 1;
    const stripes = 7;
    for (let i = 0; i < stripes; i++) {
      const x = cx - w / 2 - 3 * s + (w + 6 * s) * i / (stripes - 1);
      ctx.beginPath();
      ctx.moveTo(x, cy + h / 2 + 1 * s);
      ctx.lineTo(x, cy + h / 2 + 6 * s);
      ctx.stroke();
    }

    // Stepped roof (back wing — taller) rendered first, behind main body.
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = '#9ba6b8';
    ctx.beginPath();
    roundedRect(cx - w / 2 + 6 * s, cy - h / 2 - 8 * s, w - 12 * s, 18 * s, 3 * s);
    ctx.fill(); ctx.stroke();

    // Main body
    ctx.fillStyle = '#b0b8c4';
    ctx.beginPath();
    roundedRect(cx - w / 2, cy - h / 2 + 4 * s, w, h - 4 * s, 4 * s);
    ctx.fill(); ctx.stroke();

    // Darker sign band across the top of the main body
    ctx.fillStyle = 'rgba(30, 35, 50, 0.55)';
    ctx.fillRect(cx - w / 2, cy - h / 2 + 4 * s, w, 9 * s);

    // Big glass storefront
    const glassY = cy - h / 2 + 17 * s;
    const glassH = h - 24 * s;
    const glassX = cx - w / 2 + 5 * s;
    const glassW = w - 10 * s;
    ctx.fillStyle = 'rgba(200, 230, 245, 0.92)';
    ctx.fillRect(glassX, glassY, glassW, glassH);
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(glassX, glassY, glassW, glassH);
    // Vertical mullions
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.4)';
    for (let i = 1; i < 6; i++) {
      const x = glassX + (glassW / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, glassY); ctx.lineTo(x, glassY + glassH);
      ctx.stroke();
    }
    // Horizontal mullion mid-height
    ctx.beginPath();
    ctx.moveTo(glassX, glassY + glassH / 2);
    ctx.lineTo(glassX + glassW, glassY + glassH / 2);
    ctx.stroke();

    // Central entrance — double doors, darker
    const doorW = glassW * 0.28;
    const doorH = glassH * 0.55;
    ctx.fillStyle = '#3c4256';
    ctx.fillRect(cx - doorW / 2, glassY + glassH - doorH, doorW, doorH);
    ctx.strokeStyle = 'rgba(255, 250, 238, 0.6)';
    ctx.beginPath();
    ctx.moveTo(cx, glassY + glassH - doorH);
    ctx.lineTo(cx, glassY + glassH);
    ctx.stroke();

    // Entrance canopy — small flat awning over the doors
    ctx.fillStyle = '#6c7a8e';
    ctx.fillRect(cx - doorW / 2 - 3 * s, glassY + glassH - doorH - 3 * s, doorW + 6 * s, 3 * s);

    // "MALL" sign on the top band
    ctx.fillStyle = 'rgba(255, 250, 238, 0.9)';
    ctx.font = `bold ${Math.max(9, 10 * s)}px -apple-system, "SF Pro Rounded", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MALL', cx, cy - h / 2 + 8.5 * s);
  }

  // Per-side pastel colour for entry gates — makes each direction memorable.
  const GATE_COLORS = {
    N: '#b8c9a8',  // sage
    S: '#a8b8cc',  // dusty blue
    E: '#e8b89a',  // warm peach
    W: '#c8a8c8'   // muted lavender
  };

  function drawEntries() {
    for (const e of state.entries) {
      const p = w2s(e.x, e.y);
      const r = 20 * state.view.scale;
      // Shadow
      ctx.fillStyle = 'rgba(30, 35, 50, 0.18)';
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy + 3 * state.view.scale, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Gate body — a rounded square tile with a little arrow pointing into the map
      ctx.fillStyle = GATE_COLORS[e.side] || '#e8d59e';
      ctx.strokeStyle = 'rgba(30, 35, 50, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Arrow showing direction the cars travel into the map
      ctx.fillStyle = 'rgba(30, 35, 50, 0.75)';
      const dir = {
        N: [0,  1], S: [0, -1],
        W: [1,  0], E: [-1, 0]
      }[e.side] || [0, 0];
      const ax = p.sx, ay = p.sy;
      const head = r * 0.55;
      const tail = r * 0.35;
      ctx.beginPath();
      // Triangle pointing toward dir
      ctx.moveTo(ax + dir[0] * head, ay + dir[1] * head);
      ctx.lineTo(ax - dir[1] * tail * 0.6 - dir[0] * tail * 0.2,
                 ay + dir[0] * tail * 0.6 - dir[1] * tail * 0.2);
      ctx.lineTo(ax + dir[1] * tail * 0.6 - dir[0] * tail * 0.2,
                 ay - dir[0] * tail * 0.6 - dir[1] * tail * 0.2);
      ctx.closePath();
      ctx.fill();

      // Queue of waiting cars, extending AWAY from the map along the entry's
      // side. Queue dots tinted in the gate's colour so a stacked queue is
      // obviously "this gate's backlog".
      if (e.queue && e.queue.length > 0) {
        const qdx = -dir[0], qdy = -dir[1];
        const gateCol = GATE_COLORS[e.side] || CAR_COLOR;
        for (let i = 0; i < e.queue.length; i++) {
          const d = r + (12 + i * 14) * state.view.scale;
          const qx = p.sx + qdx * d;
          const qy = p.sy + qdy * d;
          ctx.fillStyle = gateCol;
          ctx.strokeStyle = 'rgba(30, 35, 50, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(qx, qy, 5.5 * state.view.scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Label
      ctx.fillStyle = 'rgba(30, 35, 50, 0.65)';
      ctx.font = `${Math.max(10, 10 * state.view.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Rounded", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.id, p.sx, p.sy + r + 14 * state.view.scale);
    }
  }

  function drawCars() {
    const scale = state.view.scale;
    const len = Math.max(20, 24 * scale);
    const wid = Math.max(11, 13 * scale);
    const corner = wid * 0.35;
    // Viewport cull — skip cars completely off-screen. Big perf win at
    // scale: a city with hundreds of cars only renders the visible ones.
    const margin = 40;
    const vw = state.view.w, vh = state.view.h;

    for (const car of state.cars) {
      const e = car.path[car.pathIdx];
      const p = sampleEdge(e, car.pos);
      const s = w2s(p.x, p.y);
      if (s.sx < -margin || s.sx > vw + margin ||
          s.sy < -margin || s.sy > vh + margin) continue;
      const angle = Math.atan2(p.hy, p.hx);

      ctx.save();
      ctx.translate(s.sx, s.sy);
      ctx.rotate(angle);

      // Shadow offset down-right
      ctx.fillStyle = 'rgba(20, 25, 40, 0.28)';
      ctx.beginPath();
      roundedRect(-len / 2 + 1.5, -wid / 2 + 2.5, len, wid, corner);
      ctx.fill();

      // Body
      ctx.fillStyle = car.color;
      ctx.beginPath();
      roundedRect(-len / 2, -wid / 2, len, wid, corner);
      ctx.fill();
      // Subtle dark outline
      ctx.strokeStyle = 'rgba(20, 25, 40, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Windshield (front ~30% of body, lighter)
      const wsLen = len * 0.30;
      const wsPad = wid * 0.22;
      ctx.fillStyle = 'rgba(255, 250, 238, 0.42)';
      ctx.beginPath();
      roundedRect(len * 0.08, -wid / 2 + wsPad, wsLen, wid - wsPad * 2, 1.5);
      ctx.fill();

      // Headlight hint — tiny dots at the front corners
      ctx.fillStyle = 'rgba(255, 240, 200, 0.85)';
      ctx.beginPath();
      ctx.arc(len / 2 - 1.2, -wid / 2 + 2.5, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(len / 2 - 1.2,  wid / 2 - 2.5, 1.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawEffects() {
    for (const fx of state.effects) {
      const age = state.time - fx.startTime;
      if (age < 0) continue;

      if (fx.kind === 'points') {
        // Floating "+N" that rises and fades.
        const LIFE = 1.1;
        const t = Math.min(1, age / LIFE);
        const p = w2s(fx.x, fx.y);
        const rise = (10 + t * 36) * state.view.scale;
        ctx.font = `bold ${Math.max(13, 18 * state.view.scale)}px -apple-system, "SF Pro Rounded", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const alpha = 1 - Math.pow(t, 1.8);
        ctx.fillStyle = `rgba(255, 250, 238, ${alpha * 0.85})`;
        ctx.fillText('+' + fx.points, p.sx + 1, p.sy - rise + 1);
        ctx.fillStyle = `rgba(219, 109, 81, ${alpha})`;
        ctx.fillText('+' + fx.points, p.sx, p.sy - rise);
        continue;
      }

      if (fx.kind === 'earn' || fx.kind === 'spend') {
        // Floating "+$N" (green, rises) or "-$N" (red, falls).
        const LIFE = 1.2;
        const t = Math.min(1, age / LIFE);
        const p = w2s(fx.x, fx.y);
        const isEarn = fx.kind === 'earn';
        const rise = (isEarn ? (10 + t * 38) : -(6 + t * 18)) * state.view.scale;
        ctx.font = `bold ${Math.max(14, 19 * state.view.scale)}px -apple-system, "SF Pro Rounded", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const alpha = 1 - Math.pow(t, 1.8);
        const label = (isEarn ? '+$' : '-$') + fx.amount;
        ctx.fillStyle = `rgba(255, 250, 238, ${alpha * 0.85})`;
        ctx.fillText(label, p.sx + 1, p.sy - rise + 1);
        ctx.fillStyle = isEarn
          ? `rgba(47, 138, 79, ${alpha})`
          : `rgba(194, 74, 61, ${alpha})`;
        ctx.fillText(label, p.sx, p.sy - rise);
        continue;
      }

      // Expanding ring (visit / deliver).
      const LIFE = 0.8;
      const t = Math.min(1, age / LIFE);
      const p = w2s(fx.x, fx.y);
      const r = (12 + t * 32) * state.view.scale;
      const alpha = (1 - t) * 0.6;
      ctx.strokeStyle = fx.kind === 'deliver'
        ? `rgba(219, 109, 81, ${alpha})`
        : `rgba(79, 161, 106, ${alpha})`;
      ctx.lineWidth = Math.max(2, 2.5 * state.view.scale * (1 - t * 0.5));
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawDragPreview() {
    if (!state.dragging) return;
    const d = state.dragging;
    const aPt = d.snapStart ? { x: d.snapStart.x, y: d.snapStart.y }
              : d.snapStartEdge ? { x: d.snapStartEdge.x, y: d.snapStartEdge.y }
              : d.startWorld;
    // Free-end preview axis-aligns to the start (if anchored) and snaps to
    // grid so the line looks exactly like it'll be built.
    const bPt = d.snapEnd ? { x: d.snapEnd.x, y: d.snapEnd.y }
              : d.snapEndEdge ? { x: d.snapEndEdge.x, y: d.snapEndEdge.y }
              : (d.snapStart || d.snapStartEdge)
                    ? snapAxisAligned(aPt, d.cursorWorld)
                    : snapToGrid(d.cursorWorld.x, d.cursorWorld.y);
    if (!bPt) return;

    const startOk = !!(d.snapStart || d.snapStartEdge);
    const endAnchored = !!(d.snapEnd || d.snapEndEdge);
    const wouldCross = !d.isBridge && startOk && lineWouldCross(aPt, bPt, d);
    const invalid = !startOk || wouldCross;

    const pA = w2s(aPt.x, aPt.y);
    const pB = w2s(bPt.x, bPt.y);

    const glow = invalid ? 'rgba(194, 74, 61, 0.45)'
               : d.isBridge ? 'rgba(160, 101, 195, 0.55)'
               : 'rgba(219, 109, 81, 0.55)';
    const inner = invalid ? '#c24a3d'
                : d.isBridge ? '#a065c3'
                : '#db6d51';

    ctx.strokeStyle = glow;
    ctx.lineWidth = 28 * state.view.scale;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pA.sx, pA.sy); ctx.lineTo(pB.sx, pB.sy); ctx.stroke();

    ctx.strokeStyle = inner;
    ctx.lineWidth = 18 * state.view.scale;
    if (invalid) ctx.setLineDash([12 * state.view.scale, 10 * state.view.scale]);
    ctx.beginPath(); ctx.moveTo(pA.sx, pA.sy); ctx.lineTo(pB.sx, pB.sy); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = inner;
    ctx.strokeStyle = inner;
    ctx.lineWidth = 2;
    if (startOk) {
      ctx.beginPath();
      ctx.arc(pA.sx, pA.sy, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (endAnchored) {
      // Filled dot — the end snapped onto something.
      ctx.beginPath();
      ctx.arc(pB.sx, pB.sy, 6, 0, Math.PI * 2); ctx.fill();
    } else if (startOk) {
      // Hollow ring — the end is a dead-end in open space.
      ctx.fillStyle = '#f4ead5';
      ctx.beginPath();
      ctx.arc(pB.sx, pB.sy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.stroke();
    }

    // Game-mode live cost preview — draws "$N" near the drag end so the
    // player sees what this drag will cost before committing.
    if (isGameMode() && startOk) {
      const lenPx = Math.hypot(bPt.x - aPt.x, bPt.y - aPt.y);
      const cost = roadCost(lenPx, !!d.isBridge);
      const affordable = state.money >= cost;
      const label = `$${cost}`;
      ctx.font = `bold 14px -apple-system, "SF Pro Rounded", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tx = pB.sx + 14, ty = pB.sy - 14;
      ctx.fillStyle = 'rgba(255, 250, 238, 0.92)';
      ctx.fillText(label, tx + 1, ty + 1);
      ctx.fillStyle = affordable ? '#2f8a4f' : '#c24a3d';
      ctx.fillText(label, tx, ty);
    }
  }

  // ================================================================
  // Interaction
  // ================================================================
  function setupInput() {
    window.addEventListener('resize', () => resizeCanvas());

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      // Snappier wheel zoom (was 1.0015) so a single scroll noticeably
      // changes the zoom — important for context-switching between the
      // overview and a jam spot.
      zoomAt(mx, my, Math.pow(1.0035, -e.deltaY));
    }, { passive: false });

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    document.querySelectorAll('.tool').forEach(btn => {
      if (!btn.dataset.tool) return;  // skip aux buttons like Undo
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });
    setTool('road');

    document.getElementById('btn-pause').addEventListener('click', togglePause);
    document.getElementById('btn-mute').addEventListener('click', () => {
      Audio.setMuted(!Audio.muted);
      syncMuteButton();
    });
    document.getElementById('btn-menu').addEventListener('click', backToMenu);

    // Collapse / expand the goals panel.
    const targetsToggle = document.getElementById('targets-toggle');
    if (targetsToggle) {
      targetsToggle.addEventListener('click', () => {
        state.targetsCollapsed = !state.targetsCollapsed;
        scheduleSave();
        renderTargets();
      });
    }

    // Hide / show toolbar — important on phone where the bar takes the
    // bottom strip. State is persisted per-mode.
    const hideBtn = document.getElementById('btn-hide-toolbar');
    const showBtn = document.getElementById('btn-show-toolbar');
    if (hideBtn) hideBtn.addEventListener('click', () => setToolbarHidden(true));
    if (showBtn) showBtn.addEventListener('click', () => setToolbarHidden(false));

    // Mode-pick on splash. Each mode has its own Continue / Start fresh
    // pair; clicking Start either resumes a saved city of that mode or
    // begins a fresh one.
    document.querySelectorAll('.mode-start').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode === 'game' ? MODE_GAME : MODE_SANDBOX;
        state.mode = mode;
        if (hasSavedCity(mode)) {
          try {
            const raw = localStorage.getItem(saveKeyFor(mode));
            const data = JSON.parse(raw);
            const ok = loadState(data);
            if (!ok) buildLevel();
            startGame({ fresh: !ok });
          } catch (err) {
            console.warn('restore failed:', err);
            buildLevel();
            startGame({ fresh: true });
          }
        } else {
          buildLevel();
          startGame({ fresh: true });
        }
      });
    });
    document.querySelectorAll('.mode-fresh').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode === 'game' ? MODE_GAME : MODE_SANDBOX;
        state.mode = mode;
        clearSavedCity(mode);
        buildLevel();
        startGame({ fresh: true });
      });
    });

    document.getElementById('btn-retry').addEventListener('click', restart);
    document.getElementById('btn-back-to-menu').addEventListener('click', backToMenu);
    document.getElementById('btn-undo').addEventListener('click', () => {
      const res = undoLast();
      if (!res.ok) return toast(res.reason || 'Nothing to undo');
      toast(res.what === 'road' ? 'Road undone' : 'Block undone');
    });

    const demandSlider = document.getElementById('demand-slider');
    const demandVal = document.getElementById('m-demand');
    const applyDemand = () => {
      const raw = parseInt(demandSlider.value, 10);
      state.demandMult = raw / 100;
      demandVal.textContent = state.demandMult.toFixed(1) + '×';
      scheduleSave();
    };
    demandSlider.addEventListener('input', applyDemand);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { togglePause(); e.preventDefault(); }
      if (e.key === 'Escape') state.dragging = null;
      if (e.key === '1') setTool('road');
      if (e.key === '2') setTool('bridge');
      if (e.key === '3') setTool('oneway');
      if (e.key === '4') setTool('roundabout');
      if (e.key === '5') setTool('house');
      if (e.key === '6') setTool('shop');
      if (e.key === '7') setTool('mall');
      if (e.key === '8') setTool('erase');
      if (e.key === '9') setTool('park');
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        document.getElementById('btn-undo').click();
        e.preventDefault();
      }
      if (e.key === 'm' || e.key === 'M') {
        document.getElementById('btn-mute').click();
      }
    });
  }

  function setTool(t) {
    state.tool = t;
    state.dragging = null;
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    const c = document.getElementById('stage');
    c.className = c.className.replace(/\btool-\S+\b/g, '').trim();
    c.classList.add('tool-' + t);
  }

  function zoomAt(mx, my, factor) {
    const before = s2w(mx, my);
    // Wider zoom range — min was 0.25 which still cropped the 1800×2340 map
    // on phone screens. 0.12 lets the player see the whole world at once,
    // critical for "see the whole city, then dive in to a jam spot."
    state.view.scale = Math.max(0.12, Math.min(4, state.view.scale * factor));
    const after = s2w(mx, my);
    state.view.originX += before.x - after.x;
    state.view.originY += before.y - after.y;
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    state.pointers.set(e.pointerId, { x: mx, y: my, startX: mx, startY: my, startedAt: performance.now(), moved: false });

    if (state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      state.pinch = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      };
      state.dragging = null;
      state.panActive = false;
      canvas.classList.remove('grabbing');
      return;
    }

    const world = s2w(mx, my);
    if (state.tool === 'road' || state.tool === 'bridge') {
      const sn = snapRadii();
      const nodeSnap = findNearestNode(world.x, world.y, sn.node);
      const edgeSnap = !nodeSnap ? findNearestEdgePoint(world.x, world.y, sn.edge) : null;
      state.dragging = {
        startWorld: world,
        snapStart: nodeSnap,
        snapStartEdge: edgeSnap,
        cursorWorld: world,
        snapEnd: null,
        snapEndEdge: null,
        isBridge: state.tool === 'bridge'
      };
    } else {
      // For non-road tools, hold pan in a "pending" state until the user
      // moves further than TAP_MOVE_THRESHOLD. Without this, any small
      // finger jitter during a tap would shift the camera AND set
      // p.moved=true, which silently disqualified the tap from placing
      // a building. This was the "I tap five times and finally one
      // works" bug.
      state.panActive = false;
      state.panPending = { mx, my, ox: state.view.originX, oy: state.view.originY };
    }
  }

  // Snap radii in world units, scaled so they stay roughly constant in pixels
  // at any zoom level (good for touch).
  function snapRadii() {
    const scale = Math.max(0.2, state.view.scale);
    return {
      node: 30 / scale,  // ≈30 screen px
      edge: 22 / scale   // ≈22 screen px
    };
  }

  // Tap forgiveness — touch input always has a few px of jitter even when
  // the user thinks they're holding still. The previous 4 px threshold
  // meant tiny finger drift was being read as a drag, killing every
  // building tap. 12 screen px matches what most native iOS UIs use.
  const TAP_MOVE_THRESHOLD = 12;
  // Held taps up to ~700 ms still count — the user may rest their finger
  // on the screen briefly to make sure they hit the right spot.
  const TAP_TIME_THRESHOLD_MS = 700;

  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const p = state.pointers.get(e.pointerId);
    if (p) {
      p.x = mx; p.y = my;
      if (Math.hypot(mx - p.startX, my - p.startY) > TAP_MOVE_THRESHOLD) p.moved = true;
    }

    if (state.pinch && state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const newMid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

      // Pinch zoom
      if (state.pinch.dist > 1) zoomAt(newMid.x, newMid.y, newDist / state.pinch.dist);

      // Two-finger pan: move origin by how much the midpoint moved.
      if (state.pinch.mid) {
        const dx = (newMid.x - state.pinch.mid.x) / state.view.scale;
        const dy = (newMid.y - state.pinch.mid.y) / state.view.scale;
        state.view.originX -= dx;
        state.view.originY -= dy;
      }

      state.pinch.dist = newDist;
      state.pinch.mid  = newMid;
      return;
    }

    const world = s2w(mx, my);
    if (state.dragging) {
      state.dragging.cursorWorld = world;
      // Prefer axis-aligned snap candidates so a drag from one row to a
      // parallel row produces a clean perpendicular line, not a slight
      // diagonal that snaps to wherever the cursor lands on the second
      // road. We project the cursor onto the start's row or column
      // (whichever matches the dominant axis) and look for snaps THERE
      // first. If nothing's at the aligned position, fall back to a
      // search at the raw cursor position — that's how diagonal
      // connections to roundabout ring nodes still work.
      const sn = snapRadii();
      const startA = state.dragging.snapStart
        ? { x: state.dragging.snapStart.x, y: state.dragging.snapStart.y }
        : state.dragging.snapStartEdge
          ? { x: state.dragging.snapStartEdge.x, y: state.dragging.snapStartEdge.y }
          : null;
      let aligned = world;
      if (startA) {
        const adx = Math.abs(world.x - startA.x);
        const ady = Math.abs(world.y - startA.y);
        aligned = adx >= ady
          ? { x: world.x, y: startA.y }
          : { x: startA.x, y: world.y };
      }
      let nodeSnap = findNearestNode(aligned.x, aligned.y, sn.node);
      let edgeSnap = !nodeSnap ? findNearestEdgePoint(aligned.x, aligned.y, sn.edge) : null;
      if (!nodeSnap && !edgeSnap) {
        nodeSnap = findNearestNode(world.x, world.y, sn.node);
        edgeSnap = !nodeSnap ? findNearestEdgePoint(world.x, world.y, sn.edge) : null;
      }
      state.dragging.snapEnd = nodeSnap;
      state.dragging.snapEndEdge = edgeSnap;
    } else if (state.panPending && !state.panActive && p) {
      // Promote pending → active only once the player has clearly moved.
      if (Math.hypot(mx - state.panPending.mx, my - state.panPending.my) > TAP_MOVE_THRESHOLD) {
        state.panActive = true;
        state.panFrom = state.panPending;
      }
    } else if (state.panActive && p) {
      const dx = (mx - state.panFrom.mx) / state.view.scale;
      const dy = (my - state.panFrom.my) / state.view.scale;
      state.view.originX = state.panFrom.ox - dx;
      state.view.originY = state.panFrom.oy - dy;
    } else {
      state.hover = { node: findNearestNode(world.x, world.y, 30) };
    }
  }

  function onPointerUp(e) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    const p = state.pointers.get(e.pointerId);
    state.pointers.delete(e.pointerId);
    if (state.pointers.size < 2) state.pinch = null;
    if (state.pointers.size === 0) {
      state.panActive = false;
      state.panPending = null;
    }

    if (!p) return;
    const dt = performance.now() - p.startedAt;
    const isTap = dt < TAP_TIME_THRESHOLD_MS && !p.moved && state.pointers.size === 0;

    if (state.dragging) {
      const d = state.dragging;
      state.dragging = null;
      // Start must be on the network. End can be anywhere — an open-space
      // endpoint creates a dead-end node you can continue building from.
      const startData = d.snapStart ? { node: d.snapStart }
                      : d.snapStartEdge ? { edgePoint: d.snapStartEdge }
                      : null;
      const startAnchor = d.snapStart ? { x: d.snapStart.x, y: d.snapStart.y }
                        : d.snapStartEdge ? { x: d.snapStartEdge.x, y: d.snapStartEdge.y }
                        : null;
      const endData   = d.snapEnd ? { node: d.snapEnd }
                      : d.snapEndEdge ? { edgePoint: d.snapEndEdge }
                      : { freePoint: startAnchor
                            ? snapAxisAligned(startAnchor, d.cursorWorld)
                            : snapToGrid(d.cursorWorld.x, d.cursorWorld.y) };
      if (!startData) { toast('Start at a building or on a road'); return; }
      const startPt = startData.node ? startData.node : startData.edgePoint;
      const endPt   = endData.node   ? endData.node
                    : endData.edgePoint ? endData.edgePoint
                    : endData.freePoint;
      if (Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) < 30 / state.view.scale) return;
      const res = addRoad(startData, endData, { isBridge: d.isBridge });
      if (res.ok) { toast(d.isBridge ? 'Bridge built' : 'Road built'); Audio.click(); }
      else toast(res.reason);
      return;
    }

    if (isTap && state.tool === 'erase') {
      const world = s2w(p.startX, p.startY);
      const edge = findNearestEdge(world.x, world.y, 24 / state.view.scale);
      if (!edge) return toast('Tap a road to erase');
      eraseEdgeById(edge);
      toast('Road erased');
    }

    if (isTap && state.tool === 'oneway') {
      const world = s2w(p.startX, p.startY);
      const edge = findNearestEdge(world.x, world.y, 24 / state.view.scale);
      if (!edge) return toast('Tap a road to toggle direction');
      const res = toggleOneWay(edge);
      toast(res.nowOneWay ? 'One-way on' : 'Two-way restored');
    }

    if (isTap && state.tool === 'roundabout') {
      const world = s2w(p.startX, p.startY);
      const node = findNearestNode(world.x, world.y, 38 / state.view.scale);
      if (!node) return toast('Tap a junction to convert');
      const res = makeRoundabout(node.id);
      if (!res.ok) return toast(res.reason);
      toast('Roundabout built');
    }

    if (isTap && (state.tool === 'house' || state.tool === 'shop' || state.tool === 'mall' || state.tool === 'park')) {
      const world = s2w(p.startX, p.startY);
      // v32 — road runs BY the building, not through it. The building's
      // routing node is anchored on the road; its drawn position is one
      // grid step perpendicular, on whichever side the player tapped.
      const blockedIds = new Set(state.blocks.map(b => b.nodeId));
      const nodeNear = findNearestNode(world.x, world.y, GRID);
      const usableNode = (nodeNear && !blockedIds.has(nodeNear.id) && !nodeNear.entry) ? nodeNear : null;
      const edgeNear = !usableNode ? findNearestEdgePoint(world.x, world.y, GRID) : null;

      // Park is decorative — it doesn't need a road. Keep the legacy
      // grid-snap-on-tap behaviour for it.
      if (state.tool === 'park') {
        const pt = snapToGrid(world.x, world.y);
        const res = placeBlock(pt.x, pt.y, 'park');
        if (!res.ok) return toast(res.reason);
        Audio.placeBuilding();
        toast(res.usedCivicCredit ? 'Free Park placed (civic credit)' : 'Park placed');
        return;
      }

      let roadX, roadY, roadDirX, roadDirY;
      if (usableNode) {
        roadX = usableNode.x; roadY = usableNode.y;
        // Take road direction from any edge attached to this node so the
        // offset is perpendicular to a real road, not just the tap vector.
        const out = state.adjacency.get(usableNode.id);
        if (out && out.length) {
          const e = out[0];
          roadDirX = e.shape[e.shape.length - 1].x - e.shape[0].x;
          roadDirY = e.shape[e.shape.length - 1].y - e.shape[0].y;
        }
      } else if (edgeNear) {
        const g = snapToGrid(edgeNear.x, edgeNear.y);
        roadX = g.x; roadY = g.y;
        const e = edgeNear.edge;
        roadDirX = e.shape[e.shape.length - 1].x - e.shape[0].x;
        roadDirY = e.shape[e.shape.length - 1].y - e.shape[0].y;
      } else {
        return toast('Place on or next to a road');
      }

      const visual = offsetVisualFromRoad(roadX, roadY, world.x, world.y, roadDirX, roadDirY);
      const res = placeBlock(roadX, roadY, state.tool, { visualPos: visual });
      if (!res.ok) return toast(res.reason);
      Audio.placeBuilding();
      const label = BUILDING_TYPES[state.tool].label;
      if (res.usedCivicCredit) toast(`Free ${label} placed (civic credit)`);
      else toast(`${label} placed`);
    }
  }

  let toastT = null;
  function toast(msg, ms = 1700) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ================================================================
  // Game state transitions
  // ================================================================
  function buildLevel() {
    state.nodes.clear();
    state.edges.length = 0;
    state.entries = [];
    state.blocks = [];
    state.cars = [];
    state.effects = [];
    state.undoStack = [];
    state.nextNodeId = 1;
    state.nextEdgeId = 1;
    state.nextBlockId = 1;
    state.visits = 0;
    state.score = 0;
    state.flowSamples = [];
    state.flowLastSampleAt = -1;
    state.flowLastCount = 0;
    state.flowPeak = 0;
    state.overloadTimer = 0;
    state._warnedHalf = false;
    // bestScore / bestMoney / bestSurvived intentionally preserved across resets.

    // Reset run-only economy fields. bests stay in localStorage via save load.
    state.money = STARTING_MONEY;
    state.totalEarned = 0;
    state.peakPeople = 0;
    state.targetTiers = {};
    state.earnSamples = [];
    state.earnLastSampleAt = -1;
    state.earnLastTotal = 0;
    state._incomeSustainSec = 0;
    state.civicCredits = 0;
    state.civicCreditsClaimed = 0;

    // Snapshot the records the player is starting this run with. The first
    // time the run pushes past either, fire a celebratory toast — that's the
    // "I beat my best!" feedback that turns the high-score loop into a hook.
    state._runBaselineScore = state.bestScore;
    state._runBaselineMoney = state.bestMoney;
    state._brokeScoreRecord = false;
    state._brokeMoneyRecord = false;

    for (const ep of LEVEL.entries) {
      const node = makeNode(ep.x, ep.y, { entry: ep.id });
      state.entries.push({ ...ep, nodeId: node.id, queue: [], timer: 0 });
    }

    for (const r of LEVEL.starterRoads) {
      const startNode = findNearestNode(r.a.x, r.a.y, 8);
      const endNode = findNearestNode(r.b.x, r.b.y, 8);
      if (startNode && endNode) makeEdge(startNode, endNode);
    }

    rebuildAdjacency();
  }

  function setToolbarHidden(hidden) {
    state.toolbarHidden = !!hidden;
    document.getElementById('toolbar')?.classList.toggle('collapsed', hidden);
    document.getElementById('btn-show-toolbar')?.classList.toggle('hidden', !hidden);
    scheduleSave();
  }

  // Switch the HUD between sandbox (Score) and game (Money) hero stats.
  function applyModeUI() {
    const game = isGameMode();
    document.querySelector('.stat.stat-money')?.classList.toggle('hidden', !game);
    document.querySelector('.stat.stat-score')?.classList.toggle('hidden', game);
    // Cost badges on every tool — visible in game mode only.
    document.querySelectorAll('.tool-cost').forEach(el => {
      el.classList.toggle('hidden', !game);
    });
    refreshToolCosts();
  }

  // High-score crossing detector. Each run snapshots the player's previous
  // bests in buildLevel(); the moment the current run climbs past them, we
  // pop a one-shot toast (per record per run, no spam). The "beat your last"
  // moment is what makes a high-score game compelling — without it the
  // player has no idea when they crossed.
  function checkRecordBreak() {
    if (!state.started) return;
    if (!isGameMode()) {
      if (!state._brokeScoreRecord && state._runBaselineScore > 0 && state.score > state._runBaselineScore) {
        state._brokeScoreRecord = true;
        toast(`🏆 New best score! Beating ${state._runBaselineScore}`, 2600);
      }
    } else {
      if (!state._brokeMoneyRecord && state._runBaselineMoney > 0 && state.totalEarned > state._runBaselineMoney) {
        state._brokeMoneyRecord = true;
        toast(`🏆 New best earnings! Past $${state._runBaselineMoney}`, 2600);
      }
    }
  }

  // Civic-credit issuer — call after any income event in game mode. Issues
  // a credit for every CIVIC_CREDIT_INTERVAL of cumulative earnings reached.
  function checkCivicCredits() {
    if (!isGameMode()) return;
    const earned = Math.floor(state.totalEarned / CIVIC_CREDIT_INTERVAL);
    if (earned > state.civicCreditsClaimed) {
      const fresh = earned - state.civicCreditsClaimed;
      state.civicCredits += fresh;
      state.civicCreditsClaimed = earned;
      toast(`🌳 Civic dividend! Free Park unlocked`, 2400);
      // Cash sparkle as a small celebration.
      state.effects.push({
        x: LOGICAL_W / 2, y: 220,
        startTime: state.time, kind: 'deliver'
      });
      scheduleSave();
    }
  }

  // Target progress + hit detection. Tiered — when you cross the current
  // tier's goal, the tier increments and the next goal slots in. Each tier
  // hit fires a toast + cash bonus + sparkle burst.
  function checkTargets() {
    for (const def of TARGET_DEFS) {
      const tier = state.targetTiers[def.id] || 0;
      if (targetMaxedOut(def, tier)) continue;
      const v = def.progress(state);
      const goal = targetActiveGoal(def, tier);
      if (v >= goal) {
        const newTier = tier + 1;
        state.targetTiers[def.id] = newTier;
        const bonus = TIER_BONUSES[Math.min(tier, TIER_BONUSES.length - 1)];
        state.money += bonus;
        state.totalEarned += bonus;
        // Sustain progress resets whenever the income tier bumps — the next
        // tier's threshold is higher so the current run no longer counts.
        if (def.isIncome) state._incomeSustainSec = 0;
        const label = def.labelTpl(targetActiveThreshold(def, tier));
        const maxed = targetMaxedOut(def, newTier);
        toast(maxed
          ? `✓ ${label} — maxed out! +$${bonus.toLocaleString()}`
          : `✓ ${label} — +$${bonus.toLocaleString()}`, 2800);
        // Sparkle burst at the screen centre. Six bursts, staggered.
        for (let i = 0; i < 6; i++) {
          state.effects.push({
            x: LOGICAL_W / 2 + (Math.random() - 0.5) * 200,
            y: LOGICAL_H / 2 + (Math.random() - 0.5) * 200,
            startTime: state.time + i * 0.05,
            kind: 'deliver'
          });
        }
        Audio.chime('mall');
        scheduleSave();
      }
    }
  }

  // Re-render the targets panel from current state. Tier-aware: each row
  // shows the *current* tier's label + progress; when a tier is maxed, the
  // row turns gold and reads "✓ Maxed".
  function renderTargets() {
    const panel = document.getElementById('targets');
    if (!panel) return;
    if (!isGameMode()) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    panel.classList.toggle('collapsed', !!state.targetsCollapsed);

    // Header summary — "Goals · 1/3 maxed" when there's at least one max.
    const hdr = panel.querySelector('.targets-summary');
    if (hdr) {
      const maxed = TARGET_DEFS.reduce(
        (n, d) => n + (targetMaxedOut(d, state.targetTiers[d.id] || 0) ? 1 : 0), 0);
      const ascended = TARGET_DEFS.reduce(
        (n, d) => n + Math.min(d.tiers.length, state.targetTiers[d.id] || 0), 0);
      hdr.textContent = ascended === 0
        ? '0 hit'
        : `${ascended} hit${maxed ? ` · ${maxed} maxed` : ''}`;
    }

    for (const def of TARGET_DEFS) {
      const row = panel.querySelector(`[data-target="${def.id}"]`);
      if (!row) continue;
      const tier = state.targetTiers[def.id] || 0;
      const maxed = targetMaxedOut(def, tier);
      const goal = maxed ? def.tiers[def.tiers.length - 1] : targetActiveGoal(def, tier);
      const threshold = maxed
        ? def.tiers[def.tiers.length - 1]
        : targetActiveThreshold(def, tier);
      const v = def.progress(state);
      const labelEl = row.querySelector('.target-label');
      const fill = row.querySelector('.target-fill');
      const txt = row.querySelector('.target-progress');
      const tierBadge = row.querySelector('.target-tier');
      if (labelEl) labelEl.textContent = def.labelTpl(threshold);
      if (tierBadge) tierBadge.textContent = maxed ? '★' : `T${tier + 1}`;
      if (maxed) {
        if (fill) fill.style.width = '100%';
        if (txt) txt.textContent = '✓ Maxed';
      } else {
        const pct = Math.min(100, (v / goal) * 100);
        if (fill) fill.style.width = pct.toFixed(0) + '%';
        if (txt) txt.textContent = def.format(v, goal);
      }
      row.classList.toggle('maxed', maxed);
    }
  }

  function refreshToolCosts() {
    if (!isGameMode()) return;
    // Per-instance scaling means each placeable's cost rises with how many of
    // its type the player has built. Toolbar label tracks the *next* cost so
    // the player sees the price of the building they're about to drop.
    const houseNext = buildingCostFor('house');
    const shopNext  = buildingCostFor('shop');
    const mallNext  = buildingCostFor('mall');
    const parkNext  = buildingCostFor('park');
    const parkLabel = state.civicCredits > 0 ? 'FREE' : `$${parkNext}`;
    const labels = {
      road:       `$${COSTS.road.base}+`,
      bridge:     `$${COSTS.bridge.base}+`,
      oneway:     `Free`,
      roundabout: `$${COSTS.roundabout}`,
      house:      `$${houseNext}`,
      shop:       `$${shopNext}`,
      mall:       `$${mallNext}`,
      park:       parkLabel,
      erase:      `Free`
    };
    document.querySelectorAll('.tool[data-tool]').forEach(btn => {
      const t = btn.dataset.tool;
      const costEl = btn.querySelector('.tool-cost');
      if (!costEl) return;
      costEl.textContent = labels[t] || '';
      // Mark unaffordable for fixed-cost tools (park bypasses if free).
      const fixed = (t === 'house') ? houseNext
                  : (t === 'shop')  ? shopNext
                  : (t === 'mall')  ? mallNext
                  : (t === 'roundabout') ? COSTS.roundabout
                  : (t === 'park')  ? (state.civicCredits > 0 ? 0 : parkNext)
                  : 0;
      btn.classList.toggle('unaffordable', fixed > 0 && state.money < fixed);
      // Civic-credit badge on the Park tool.
      if (t === 'park') {
        const badge = btn.querySelector('.tool-credit-badge');
        if (badge) {
          badge.textContent = state.civicCredits;
          badge.classList.toggle('hidden', state.civicCredits <= 0);
        }
      }
    });
  }

  function startGame(opts = {}) {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('toolbar').classList.remove('hidden');
    document.getElementById('paused-overlay').classList.remove('show');
    document.getElementById('btn-pause').textContent = '⏸';
    state.paused = false;
    state.started = true;
    state.over = false;
    applyModeUI();
    setToolbarHidden(state.toolbarHidden);
    // Start audio (lazy init needs a user gesture — the Start click IS one).
    try {
      const savedMute = localStorage.getItem('traffic-flow:muted') === '1';
      Audio.muted = savedMute;
    } catch (_) {}
    Audio.ensure();
    Audio.startPad();
    syncMuteButton();
    // Sync demand slider to state (restored or default).
    const slider = document.getElementById('demand-slider');
    if (slider) {
      slider.value = Math.round((state.demandMult || 1) * 100);
      const vEl = document.getElementById('m-demand');
      if (vEl) vEl.textContent = (state.demandMult || 1).toFixed(1) + '×';
    }
    // Seed only on a fresh start — a loaded city already has infrastructure.
    // Only seed gates that have network connections; otherwise disconnected
    // gates pile up queued cars instantly with nowhere to go.
    if (opts.fresh !== false) {
      for (let i = 0; i < 4; i++) {
        for (const e of state.entries) {
          if (gateHasNetwork(e)) e.queue.push({ waitingSince: 0 });
        }
      }
      for (let i = 0; i < 80; i++) stepSim(0.05);
    }
  }

  function restart() {
    document.getElementById('gameover').classList.add('hidden');
    buildLevel();
    state.time = 0;
    state.delivered = 0;
    state.jamMeter = 0;
    state.over = false;
    state.paused = false;
    startGame({ fresh: true });
  }

  function backToMenu() {
    // Pause and surface the splash for mode re-pick.
    state.paused = true;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('toolbar').classList.add('hidden');
    document.getElementById('targets')?.classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('btn-show-toolbar')?.classList.add('hidden');
    document.getElementById('paused-overlay').classList.remove('show');
    configureSplash();
    document.getElementById('splash').classList.remove('hidden');
  }

  function endGame() {
    if (state.over) return;
    state.over = true;
    state.paused = true;
    document.getElementById('go-score').textContent = state.delivered;
    document.getElementById('gameover').classList.remove('hidden');
  }

  // Game-mode crash — sustained jam at max for OVERLOAD_TIME seconds.
  function endGameCrash() {
    if (state.over) return;
    state.over = true;
    state.paused = true;

    if (state.totalEarned > state.bestMoney) state.bestMoney = state.totalEarned;
    if (state.time > state.bestSurvived) state.bestSurvived = state.time;
    scheduleSave();

    document.getElementById('go-title').textContent = 'City Collapsed!';
    document.getElementById('go-message').textContent = 'Traffic overwhelmed your city. Build smarter next time.';
    document.getElementById('go-score').textContent = '$' + state.totalEarned;
    document.getElementById('go-score-unit').textContent = 'earned';

    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60);
    const survived = `${mins}m ${secs.toString().padStart(2, '0')}s`;

    const stats = document.getElementById('go-stats');
    if (stats) {
      stats.innerHTML = `
        <li><span>Survived</span><b>${survived}</b></li>
        <li><span>Peak people</span><b>${state.peakPeople}</b></li>
        <li><span>Deliveries</span><b>${state.delivered}</b></li>
        <li><span>Visits</span><b>${state.visits}</b></li>
        <li><span>Best earned</span><b>$${state.bestMoney}</b></li>
        <li><span>Longest run</span><b>${Math.floor(state.bestSurvived/60)}m ${(Math.floor(state.bestSurvived)%60).toString().padStart(2,'0')}s</b></li>
      `;
    }
    document.getElementById('gameover').classList.remove('hidden');
  }
  function syncMuteButton() {
    const btn = document.getElementById('btn-mute');
    if (!btn) return;
    btn.textContent = Audio.muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', Audio.muted ? 'true' : 'false');
  }

  function togglePause() {
    if (!state.started || state.over) return;
    state.paused = !state.paused;
    document.getElementById('btn-pause').textContent = state.paused ? '▶' : '⏸';
    document.getElementById('paused-overlay').classList.toggle('show', state.paused);
  }

  let flowSparkCtx = null;
  function drawFlowSpark() {
    const canvas = document.getElementById('flow-spark');
    if (!canvas) return;
    if (!flowSparkCtx) flowSparkCtx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 110, H = canvas.clientHeight || 20;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr; canvas.height = H * dpr;
    }
    const c = flowSparkCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    const samples = state.flowSamples;
    if (samples.length < 2) return;
    const peak = state.flowPeak || 1;
    const yMax = Math.max(peak, 1);
    const last = samples[samples.length - 1];
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const goodColor = '#4fa16a', badColor = '#c24a3d';
    const col = last >= avg ? goodColor : badColor;

    // Peak line (faint horizontal).
    c.strokeStyle = 'rgba(219, 109, 81, 0.35)';
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(0, 2);
    c.lineTo(W, 2);
    c.stroke();
    c.setLineDash([]);

    // Area under line.
    c.beginPath();
    c.moveTo(0, H);
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (60 - 1)) * W;
      const y = H - (samples[i] / yMax) * (H - 3);
      if (i === 0) c.lineTo(x, y); else c.lineTo(x, y);
    }
    const lastX = ((n - 1) / 59) * W;
    c.lineTo(lastX, H);
    c.closePath();
    c.fillStyle = last >= avg ? 'rgba(79, 161, 106, 0.18)' : 'rgba(194, 74, 61, 0.18)';
    c.fill();

    // Line itself.
    c.strokeStyle = col;
    c.lineWidth = 1.6;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / 59) * W;
      const y = H - (samples[i] / yMax) * (H - 3);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();

    // Current-value dot at the right edge.
    const endY = H - (last / yMax) * (H - 3);
    c.fillStyle = col;
    c.beginPath();
    c.arc(lastX, endY, 2.4, 0, Math.PI * 2);
    c.fill();
  }

  function updateHud() {
    // Sandbox: Score is hero. Game: Money is hero, Score hidden.
    document.getElementById('m-score').textContent = state.score;
    const bestEl = document.getElementById('m-best');
    if (bestEl) {
      bestEl.textContent = state.bestScore > state.score
        ? `best ${state.bestScore}`
        : '';
    }
    if (isGameMode()) {
      const moneyEl = document.getElementById('m-money');
      if (moneyEl) moneyEl.textContent = state.money;
      const earnedEl = document.getElementById('m-money-earned');
      if (earnedEl) earnedEl.textContent = state.totalEarned > 0 ? `earned $${state.totalEarned}` : '';
      const stat = document.querySelector('.stat.stat-money');
      if (stat) stat.classList.toggle('broke', state.money < 5);
      // Refresh affordability (cheap — runs each frame but it's just classlist).
      refreshToolCosts();
    }
    const pop = state.blocks.reduce((n, b) => n + (b.type === 'house' ? 2 : 0), 0);
    document.getElementById('m-pop').textContent = pop;
    // Flow = average of the last 10 seconds of sparkline samples.
    const recent = state.flowSamples.slice(-10);
    const ratePerMin = recent.length
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : 0;
    document.getElementById('m-flow').innerHTML = `${Math.round(ratePerMin)}<span class="u">/min</span>`;
    drawFlowSpark();
    renderTargets();
    // Jam fill — when overloading in game mode, switch to angry pulsing red.
    const fill = document.getElementById('jam-fill');
    fill.style.width = (state.jamMeter * 100).toFixed(0) + '%';
    fill.classList.toggle('warn', state.jamMeter > 0.35 && state.jamMeter < 0.7);
    fill.classList.toggle('bad', state.jamMeter >= 0.7 && state.jamMeter < OVERLOAD_JAM);
    fill.classList.toggle('overload', state.jamMeter >= OVERLOAD_JAM);
  }

  let lastFrame = 0;
  function frame(ts) {
    const dt = Math.min(0.08, (ts - lastFrame) / 1000 || 0);
    lastFrame = ts;
    try { stepSim(dt); } catch (err) { console.error('stepSim error:', err); }
    try { render(); }     catch (err) { console.error('render error:', err); }
    try { updateHud(); }  catch (err) { console.error('updateHud error:', err); }
    requestAnimationFrame(frame);
  }

  // ================================================================
  // =============================================================
  // Audio — Web Audio API, lazy-init on first user gesture.
  // Ships Pass 1 of docs/research/sound.md: delivery chimes, ambient
  // pad, road-click, and a mute button. No audio files.
  // =============================================================
  const Audio = {
    ctx: null,
    master: null,
    muted: false,
    padStarted: false,
    PITCH: {
      house: 440.00,   // A4
      shop:  523.25,   // C5
      mall:  659.25,   // E5
      exit:  349.23    // F4 — lower, for edge-gate deliveries
    },
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (_) {} }
      return this.ctx;
    },
    setMuted(flag) {
      this.muted = !!flag;
      try { localStorage.setItem('traffic-flow:muted', flag ? '1' : '0'); } catch (_) {}
      if (this.master) this.master.gain.setTargetAtTime(flag ? 0 : 1, this.ctx.currentTime, 0.05);
    },
    chime(kind) {
      const ctx = this.ensure(); if (!ctx || this.muted) return;
      const freq = this.PITCH[kind] || 440;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.24);
    },
    click() {
      // Subtle high "tick" for road/bridge build — short and out of the way.
      const ctx = this.ensure(); if (!ctx || this.muted) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(380, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.11);
    },
    placeBuilding() {
      // Warm "thunk" for placing a house / shop / mall — like a wood block
      // being set down, distinct from the sharp road click.
      const ctx = this.ensure(); if (!ctx || this.muted) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.24);
    },
    startPad() {
      const ctx = this.ensure(); if (!ctx || this.padStarted) return;
      this.padStarted = true;

      // Soft chord pad — three sine waves on an A-major triad. Each note
      // has its own slow gain LFO at near-coprime frequencies, so the
      // chord very gently "breathes" instead of holding a static drone.
      // Replaces the v23 saw-bass drone, which read as eerie / intense.
      const padOut = ctx.createGain();
      padOut.gain.value = 0.06;
      const padLP = ctx.createBiquadFilter();
      padLP.type = 'lowpass';
      padLP.frequency.value = 1300;
      padLP.Q.value = 0.4;
      padOut.connect(padLP).connect(this.master);
      const NOTES = [220.00, 277.18, 329.63];      // A3, C#4, E4
      const LFO_RATES = [0.07, 0.09, 0.13];
      for (let i = 0; i < NOTES.length; i++) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = NOTES[i];
        const ng = ctx.createGain();
        ng.gain.value = 0.5;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = LFO_RATES[i];
        const lfoG = ctx.createGain();
        lfoG.gain.value = 0.4;
        lfo.connect(lfoG).connect(ng.gain);
        o.connect(ng).connect(padOut);
        o.start();
        lfo.start();
      }

      // Soft breeze — white noise through a bandpass with a slow filter
      // sweep. Quiet but present, gives the pad a "park" / outdoors feel.
      try {
        const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const ch = noiseBuf.getChannelData(0);
        for (let j = 0; j < ch.length; j++) ch[j] = (Math.random() * 2 - 1) * 0.5;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        noise.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 700;
        bp.Q.value = 0.6;
        const bpLfo = ctx.createOscillator();
        bpLfo.frequency.value = 0.08;
        const bpLfoG = ctx.createGain();
        bpLfoG.gain.value = 250;
        bpLfo.connect(bpLfoG).connect(bp.frequency);
        const ng = ctx.createGain();
        ng.gain.value = 0.018;
        noise.connect(bp).connect(ng).connect(this.master);
        noise.start();
        bpLfo.start();
      } catch (_) { /* old browsers */ }

      // Wind-chime scheduler — every 7-14s a single soft pentatonic tone
      // with a long bell-like decay, scattering across A pentatonic.
      this._scheduleChime();
    },
    _scheduleChime() {
      if (this._chimeTimer) clearTimeout(this._chimeTimer);
      const PENTATONIC = [440.00, 554.37, 659.25, 739.99, 880.00];   // A4, C#5, E5, F#5, A5
      const fire = () => {
        if (!this.ctx) return;
        if (!this.muted) {
          const ctx = this.ctx;
          const t = ctx.currentTime;
          const freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
          const o = ctx.createOscillator();
          const og = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          og.gain.setValueAtTime(0.0001, t);
          og.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
          og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
          o.connect(og).connect(this.master);
          o.start(t);
          o.stop(t + 1.7);
        }
        const nextDelay = 7000 + Math.random() * 7000;
        this._chimeTimer = setTimeout(fire, nextDelay);
      };
      this._chimeTimer = setTimeout(fire, 5000);
    }
  };

  // ================================================================
  // Boot
  // ================================================================
  function configureSplash() {
    // Each mode card shows Continue / Start fresh independently based on
    // whether a save exists for that mode.
    [MODE_SANDBOX, MODE_GAME].forEach(mode => {
      const has = hasSavedCity(mode);
      const startBtn = document.querySelector(`.mode-start[data-mode="${mode}"]`);
      const freshBtn = document.querySelector(`.mode-fresh[data-mode="${mode}"]`);
      if (startBtn) startBtn.textContent = has ? 'Continue' : 'Start';
      if (freshBtn) freshBtn.classList.toggle('hidden', !has);
    });
  }

  (() => {
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    buildLevel();
    generateDecor();
    generateStars();
    configureSplash();
    setupInput();
    // Version pill — single source of truth is the JS VERSION constant.
    const vpill = document.getElementById('version-pill');
    if (vpill) vpill.textContent = VERSION;
    requestAnimationFrame(frame);
  })();
})();
