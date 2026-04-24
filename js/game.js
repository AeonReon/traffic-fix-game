// Traffic Flow — v3
// Ultra-simple Mini-Motorways-style sandbox.
// Hand-placed houses and shops in pixel space. No map data. No confetti.
// Core loop: watch cars flow, drag to add roads, watch new flow emerge.

(() => {
  // ================================================================
  // Level — pure pixel coords, fits into a logical 1200×800 space.
  // The renderer scales this to whatever screen it's on.
  // ================================================================
  // Portrait, with lots of vertical room to build around the W-E starter road.
  const LOGICAL_W = 1200;
  const LOGICAL_H = 1560;
  const GRID = 60;           // grid spacing in world units

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
  // All positions sit on grid points (multiples of GRID=60) so the starter
  // network matches the grid the player is building against.
  const LEVEL = {
    entries: [
      { id: 'N', x:  600, y:   60, side: 'N', label: 'N' },
      { id: 'S', x:  600, y: 1500, side: 'S', label: 'S' },
      { id: 'W', x:   60, y:  780, side: 'W', label: 'W' },
      { id: 'E', x: 1140, y:  780, side: 'E', label: 'E' }
    ],
    starterRoads: [
      { a: { x: 60, y: 780 }, b: { x: 1140, y: 780 } }
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
  // a car visits this type of building.
  const BUILDING_TYPES = {
    house: { dwell: 2.6, size: 1, label: 'House', points: 1 },
    shop:  { dwell: 2.0, size: 1, label: 'Shop',  points: 2 },
    mall:  { dwell: 4.0, size: 2, label: 'Mall',  points: 3 }
  };
  const DELIVERY_POINTS = 1;   // car reaches an exit gate

  // Save / load
  const SAVE_KEY = 'traffic-flow:v1';
  const SAVE_VERSION = 1;

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
  function serializeState() {
    return {
      v: SAVE_VERSION,
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
      flowPeak: state.flowPeak
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
      state.time = 0;
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
        localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState()));
      } catch (err) {
        console.warn('save failed:', err);
      }
    }, 600);
  }

  function hasSavedCity() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (_) { return false; }
  }

  function clearSavedCity() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }

  function snapToGrid(x, y) {
    return {
      x: Math.round(x / GRID) * GRID,
      y: Math.round(y / GRID) * GRID
    };
  }

  // Snap a drag end point axis-aligned relative to the start. If the drag is
  // clearly horizontal or vertical (one axis > 1.4× the other) force the
  // dominant axis only so roads come out perfectly straight. Otherwise snap
  // to a 45° diagonal with a whole-grid step count. Keeps OCD-minded
  // players happy and avoids the "slightly angled" road bug.
  function snapAxisAligned(startPt, endPt) {
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx > ady * 1.4) {
      return { x: Math.round(endPt.x / GRID) * GRID, y: startPt.y };
    }
    if (ady > adx * 1.4) {
      return { x: startPt.x, y: Math.round(endPt.y / GRID) * GRID };
    }
    // Diagonal — 45° locked to grid steps.
    const steps = Math.max(1, Math.round(Math.max(adx, ady) / GRID));
    return {
      x: startPt.x + (Math.sign(dx) || 1) * steps * GRID,
      y: startPt.y + (Math.sign(dy) || 1) * steps * GRID
    };
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
    }

    const [fwd, rev] = makeEdge(startNode, endNode, { custom: true, bridge: isBridge, shape });
    rebuildAdjacency();
    state.undoStack.push({ type: 'road', edgeIds: [fwd.id, rev.id] });
    scheduleSave();
    return { ok: true };
  }

  // Place a building. `type` is one of BUILDING_TYPES keys.
  function placeBlock(wx, wy, type = 'shop') {
    const spec = BUILDING_TYPES[type] || BUILDING_TYPES.shop;
    const sn = snapRadii();
    const nodeSnap = findNearestNode(wx, wy, sn.node * 1.3);
    const edgeSnap = !nodeSnap ? findNearestEdgePoint(wx, wy, sn.edge * 1.3) : null;

    let node;
    if (nodeSnap) node = nodeSnap;
    else if (edgeSnap) node = splitEdgeAtPoint(edgeSnap.edge, edgeSnap.x, edgeSnap.y);
    else node = makeNode(wx, wy);

    if (node.entry) return { ok: false, reason: 'Can\'t place on a gate' };
    if (state.blocks.some(b => b.nodeId === node.id)) return { ok: false, reason: 'Building already here' };

    const block = {
      id: state.nextBlockId++,
      type,
      x: node.x, y: node.y,
      nodeId: node.id,
      visits: 0,
      dwell: spec.dwell,
      size: spec.size
    };
    state.blocks.push(block);
    rebuildAdjacency();
    state.undoStack.push({ type: 'block', blockId: block.id, nodeId: node.id });
    scheduleSave();
    return { ok: true };
  }

  function undoLast() {
    const action = state.undoStack.pop();
    if (!action) return { ok: false, reason: 'Nothing to undo' };
    if (action.type === 'road') {
      const gone = new Set(action.edgeIds);
      state.edges = state.edges.filter(e => !gone.has(e.id));
      state.cars = state.cars.filter(c => !c.path.some(e => gone.has(e.id)));
      rebuildAdjacency();
      scheduleSave();
      return { ok: true, what: 'road' };
    }
    if (action.type === 'block') {
      state.blocks = state.blocks.filter(b => b.id !== action.blockId);
      state.cars = state.cars.filter(c => c.blockId !== action.blockId);
      scheduleSave();
      return { ok: true, what: 'block' };
    }
    return { ok: false };
  }

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function makeRoundabout(nodeId, radius = 50) {
    const node = state.nodes.get(nodeId);
    if (!node) return { ok: false, reason: 'no node' };

    // Collect edges touching this node (both directions).
    const touching = state.edges.filter(e => e.from === nodeId || e.to === nodeId);
    if (touching.length < 3) return { ok: false, reason: 'need 3+ roads' };

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

    // Group by bearing (a pair of twin edges shares the same direction).
    const BUCKET = 0.35;
    const groups = [];
    for (const e of touching) {
      const d = dirAway(e);
      const bearing = Math.atan2(d.dy, d.dx);
      let g = groups.find(g => Math.abs(angleDiff(g.bearing, bearing)) < BUCKET);
      if (!g) { g = { bearing, dx: d.dx, dy: d.dy, edges: [] }; groups.push(g); }
      g.edges.push(e);
    }
    if (groups.length < 3) return { ok: false, reason: 'approaches too close together' };

    // Create one ring node per approach direction.
    const ringNodes = groups.map(g => {
      const rx = node.x + radius * g.dx;
      const ry = node.y + radius * g.dy;
      const rn = makeNode(rx, ry);
      return { node: rn, bearing: g.bearing, edges: g.edges };
    });

    // Rewire the approach edges so they end at the ring node instead of the centre.
    for (const rn of ringNodes) {
      for (const e of rn.edges) {
        if (e.from === nodeId) {
          e.from = rn.node.id;
          e.shape[0] = { x: rn.node.x, y: rn.node.y };
        } else {
          e.to = rn.node.id;
          e.shape[e.shape.length - 1] = { x: rn.node.x, y: rn.node.y };
        }
        e.length = polyLen(e.shape);
      }
    }

    // Counterclockwise on a y-down screen = descending bearing order.
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
      const steps = 6;
      const shape = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const ang = angA + delta * t;
        shape.push({ x: node.x + radius * Math.cos(ang), y: node.y + radius * Math.sin(ang) });
      }
      // One-way arc (no reverse twin — that's what makes it a roundabout).
      state.edges.push({
        id: state.nextEdgeId++,
        from: a.id, to: b.id,
        shape, length: polyLen(shape),
        bridge: false, custom: true
      });
    }

    // Remove the original centre node.
    state.nodes.delete(nodeId);
    // Kick any car whose route goes through the modified edges — rebuild fresh.
    const modifiedIds = new Set(touching.map(e => e.id));
    state.cars = state.cars.filter(c => !c.path.some(e => modifiedIds.has(e.id)));
    rebuildAdjacency();
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
    return BASE_SPAWN_INTERVAL / m;
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
      while (e.timer >= interval) {
        e.timer -= interval;
        if (e.queue.length < 12) e.queue.push({ waitingSince: state.time });
      }
      tryDispatchFromQueue(e);
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

    // Move cars.
    const byEdge = new Map();
    for (const c of state.cars) {
      const e = c.path[c.pathIdx];
      if (!byEdge.has(e.id)) byEdge.set(e.id, []);
      byEdge.get(e.id).push(c);
    }
    for (const arr of byEdge.values()) arr.sort((a, b) => a.pos - b.pos);

    const toRemove = [];
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
      const list = byEdge.get(e.id) || [];
      const myIdx = list.indexOf(car);
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
          const block = state.blocks.find(b => b.id === car.blockId);
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
            state.effects.push({ x: block.x, y: block.y, startTime: state.time, kind: 'points', points: pts });
            Audio.chime(block.type);
          }
          state.visits++;
          if (state.score > state.bestScore) state.bestScore = state.score;
        } else {
          state.delivered++;
          state.score += DELIVERY_POINTS;
          if (state.score > state.bestScore) state.bestScore = state.score;
          const exit = state.entries.find(ee => ee.id === car.sinkEntryId);
          if (exit) {
            state.effects.push({ x: exit.x, y: exit.y, startTime: state.time, kind: 'deliver' });
            state.effects.push({ x: exit.x, y: exit.y, startTime: state.time, kind: 'points', points: DELIVERY_POINTS });
            Audio.chime('exit');
          }
          toRemove.push(car);
        }
      }
      if (car.stuckTime > 180) toRemove.push(car);
    }
    if (toRemove.length) state.cars = state.cars.filter(c => !toRemove.includes(c));

    // Recompute per-building "incoming" car count for pressure-ring render.
    // An incoming car is one whose current destination is this block and it
    // hasn't arrived yet. Cheap — one pass through cars.
    for (const b of state.blocks) b.incoming = 0;
    for (const c of state.cars) {
      if (c.destKind !== 'block' || c.hasVisited) continue;
      const b = state.blocks.find(x => x.id === c.blockId);
      if (b) b.incoming++;
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

    // Jam meter: fills when any entry queue is too long.
    let jamPressure = 0;
    for (const e of state.entries) {
      if (e.queue.length >= QUEUE_FAIL_SIZE) jamPressure += (e.queue.length - QUEUE_FAIL_SIZE + 1);
    }
    if (jamPressure > 0) state.jamMeter = Math.min(JAM_FAIL, state.jamMeter + JAM_FILL_RATE * dt * Math.max(1, jamPressure / 3));
    else state.jamMeter = Math.max(0, state.jamMeter - JAM_DRAIN_RATE * dt);
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
    const pad = 40;
    const sx = (state.view.w - pad * 2) / LOGICAL_W;
    const sy = (state.view.h - pad * 2) / LOGICAL_H;
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
    // Paper-warm radial gradient — lighter near centre, slightly richer at
    // the corners. Gives the bg depth without competing with game elements.
    const cw = canvas.width, ch = canvas.height;
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0,
                                          cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    grad.addColorStop(0.0, '#faf0d9');
    grad.addColorStop(0.55, '#f2e3c1');
    grad.addColorStop(1.0, '#e8d6ae');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    ctx.scale(state.view.dpr, state.view.dpr);

    drawGrid();
    drawDecor();
    drawRoads();
    drawBlocks();
    drawEntries();
    drawCars();
    drawEffects();
    drawDragPreview();

    ctx.restore();
  }

  function drawRoads() {
    // Dedupe to one render per pair.
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
      const w = (e.bridge ? 20 : 22) * state.view.scale;
      drawPolyline(e.shape, w + 4 * state.view.scale, e.bridge ? 'rgba(30,35,50,0.25)' : '#1b1f2b');
    }
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
      const w = (e.bridge ? 20 : 22) * state.view.scale;
      drawPolyline(e.shape, w, e.bridge ? '#4a5164' : '#2d3242');
    }
    // Dashed centre stripe — only on two-way roads (with a reverse twin).
    ctx.save();
    ctx.setLineDash([10 * state.view.scale, 12 * state.view.scale]);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255, 239, 210, 0.7)';
    ctx.lineWidth = Math.max(1, 1.2 * state.view.scale);
    for (const e of state.edges) {
      if (e.id % 2 === 0) continue;
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
  function generateDecor() {
    state.decor = [];
    let seed = 1337;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let x = GRID; x < LOGICAL_W; x += GRID) {
      for (let y = GRID; y < LOGICAL_H; y += GRID) {
        if (rand() > 0.14) continue;
        const r = rand();
        const kind = r < 0.32 ? 'tree' : r < 0.72 ? 'grass' : 'flower';
        state.decor.push({
          x: x + (rand() - 0.5) * 28,
          y: y + (rand() - 0.5) * 28,
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

  function drawDecor() {
    if (!state.decor) return;
    const s = state.view.scale;
    for (const d of state.decor) {
      const p = w2s(d.x, d.y);
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
    for (const b of state.blocks) {
      const p = w2s(b.x, b.y);
      const s = state.view.scale;
      const type = b.type || 'shop';
      const sizeMul = b.size === 2 ? 1.5 : 1;

      // Pressure ring — Mini Metro-style arc behind the building. Fills up
      // based on how many cars are heading here right now.
      const incoming = b.incoming || 0;
      const capacity = b.size === 2 ? 5 : 3;   // Mall handles more load
      const pressure = Math.min(1, incoming / capacity);
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

      // Shadow common to all types.
      ctx.fillStyle = 'rgba(30, 35, 50, 0.18)';
      ctx.beginPath();
      ctx.ellipse(p.sx + 2, p.sy + 5 * s, 26 * s * sizeMul, 10 * s * sizeMul, 0, 0, Math.PI * 2);
      ctx.fill();

      if (type === 'house') drawHouse(p.sx, p.sy, s, b.id);
      else if (type === 'mall') drawMall(p.sx, p.sy, s);
      else drawShop(p.sx, p.sy, s, b.id);
    }
  }

  const HOUSE_BODY = ['#f0dbb2', '#ecd1a7', '#e9c899', '#eed7b3', '#e2c29a', '#f2e0ba'];
  const HOUSE_ROOF = ['#8a5c3e', '#7d4f2f', '#94633e', '#80513a', '#a06846'];
  const SHOP_AWNING = ['#db6d51', '#c74a3d', '#d6a05a', '#4fa16a', '#5987c2'];

  function drawHouse(cx, cy, s, seed = 0) {
    const w = 40 * s, h = 34 * s;
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.55)';
    ctx.lineWidth = 1.5;
    // Body
    ctx.fillStyle = HOUSE_BODY[seed % HOUSE_BODY.length];
    ctx.beginPath();
    roundedRect(cx - w / 2, cy - h / 2 + 6 * s, w, h - 6 * s, 3 * s);
    ctx.fill(); ctx.stroke();
    // Pitched roof triangle
    ctx.fillStyle = HOUSE_ROOF[seed % HOUSE_ROOF.length];
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 3 * s, cy - h / 2 + 6 * s);
    ctx.lineTo(cx, cy - h / 2 - 8 * s);
    ctx.lineTo(cx + w / 2 + 3 * s, cy - h / 2 + 6 * s);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Door
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(cx - 4 * s, cy + 2 * s, 8 * s, 12 * s);
    // Window
    ctx.fillStyle = 'rgba(255, 250, 238, 0.85)';
    ctx.fillRect(cx - 14 * s, cy + 2 * s, 7 * s, 7 * s);
    ctx.fillRect(cx + 7 * s,  cy + 2 * s, 7 * s, 7 * s);
  }

  function drawShop(cx, cy, s, seed = 0) {
    const w = 42 * s, h = 38 * s;
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.55)';
    ctx.lineWidth = 1.5;
    // Body
    ctx.fillStyle = '#c7a88c';
    ctx.beginPath();
    roundedRect(cx - w / 2, cy - h / 2, w, h, 5 * s);
    ctx.fill(); ctx.stroke();
    // Roof strip
    ctx.fillStyle = 'rgba(30, 35, 50, 0.32)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, 7 * s);
    // Awning across the front — colour varies per shop
    const awning = SHOP_AWNING[seed % SHOP_AWNING.length];
    ctx.fillStyle = awning;
    const ay = cy - 2 * s, ah = 6 * s;
    ctx.fillRect(cx - w / 2, ay, w, ah);
    // Zigzag edge under awning (same awning colour)
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, ay + ah);
    for (let i = 0; i < 8; i++) {
      const x = cx - w / 2 + (w / 8) * (i + 0.5);
      ctx.lineTo(x, ay + ah + 3 * s);
      ctx.lineTo(cx - w / 2 + (w / 8) * (i + 1), ay + ah);
    }
    ctx.fillStyle = awning;
    ctx.fill();
    // Display window
    ctx.fillStyle = 'rgba(255, 250, 238, 0.85)';
    ctx.fillRect(cx - w / 2 + 5 * s, cy + 6 * s, w - 10 * s, h / 2 - 8 * s);
  }

  function drawMall(cx, cy, s) {
    const w = 64 * s, h = 42 * s;
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.55)';
    ctx.lineWidth = 1.5;
    // Main body
    ctx.fillStyle = '#b0b8c4';
    ctx.beginPath();
    roundedRect(cx - w / 2, cy - h / 2, w, h, 4 * s);
    ctx.fill(); ctx.stroke();
    // Darker roof slab
    ctx.fillStyle = 'rgba(30, 35, 50, 0.28)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, 8 * s);
    // Big glass front
    ctx.fillStyle = 'rgba(210, 230, 245, 0.88)';
    ctx.fillRect(cx - w / 2 + 5 * s, cy - h / 2 + 12 * s, w - 10 * s, h - 18 * s);
    // Mullions (vertical dividers)
    ctx.strokeStyle = 'rgba(30, 35, 50, 0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) {
      const x = cx - w / 2 + (w / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, cy - h / 2 + 12 * s);
      ctx.lineTo(x, cy + h / 2 - 6 * s);
      ctx.stroke();
    }
    // "M" glyph
    ctx.fillStyle = '#2a2f3c';
    ctx.font = `bold ${Math.max(10, 14 * s)}px -apple-system, "SF Pro Rounded", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', cx, cy - h / 2 + 4 * s);
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

    for (const car of state.cars) {
      const e = car.path[car.pathIdx];
      const p = sampleEdge(e, car.pos);
      const s = w2s(p.x, p.y);
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
        // Soft shadow for legibility on busy backgrounds
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
      zoomAt(mx, my, Math.pow(1.0015, -e.deltaY));
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
    document.getElementById('btn-start').addEventListener('click', () => {
      if (hasSavedCity()) {
        try {
          const raw = localStorage.getItem(SAVE_KEY);
          const data = JSON.parse(raw);
          const ok = loadState(data);
          startGame({ fresh: !ok });  // if restore failed, seed as fresh
        } catch (err) {
          console.warn('restore failed:', err);
          buildLevel();
          startGame({ fresh: true });
        }
      } else {
        startGame({ fresh: true });
      }
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
      clearSavedCity();
      buildLevel();
      startGame({ fresh: true });
    });
    document.getElementById('btn-retry').addEventListener('click', restart);
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
    state.view.scale = Math.max(0.25, Math.min(4, state.view.scale * factor));
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
      state.panActive = true;
      state.panFrom = { mx, my, ox: state.view.originX, oy: state.view.originY };
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

  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const p = state.pointers.get(e.pointerId);
    if (p) {
      p.x = mx; p.y = my;
      if (Math.hypot(mx - p.startX, my - p.startY) > 4) p.moved = true;
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
      const sn = snapRadii();
      const nodeSnap = findNearestNode(world.x, world.y, sn.node);
      const edgeSnap = !nodeSnap ? findNearestEdgePoint(world.x, world.y, sn.edge) : null;
      state.dragging.snapEnd = nodeSnap;
      state.dragging.snapEndEdge = edgeSnap;
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
    if (state.pointers.size === 0) state.panActive = false;

    if (!p) return;
    const dt = performance.now() - p.startedAt;
    const isTap = dt < 400 && !p.moved && state.pointers.size === 0;

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

    if (isTap && (state.tool === 'house' || state.tool === 'shop' || state.tool === 'mall')) {
      const world = s2w(p.startX, p.startY);
      // If not snapping to existing network, fall back to the nearest grid point.
      const sn = snapRadii();
      const nodeHit = findNearestNode(world.x, world.y, sn.node * 1.3);
      const edgeHit = !nodeHit ? findNearestEdgePoint(world.x, world.y, sn.edge * 1.3) : null;
      const pt = (nodeHit || edgeHit) ? world : snapToGrid(world.x, world.y);
      const res = placeBlock(pt.x, pt.y, state.tool);
      if (!res.ok) return toast(res.reason);
      const label = BUILDING_TYPES[state.tool].label;
      toast(`${label} placed`);
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
    // bestScore intentionally preserved across resets.

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

  function startGame(opts = {}) {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('toolbar').classList.remove('hidden');
    document.getElementById('paused-overlay').classList.remove('show');
    document.getElementById('btn-pause').textContent = '⏸';
    state.paused = false;
    state.started = true;
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
    if (opts.fresh !== false) {
      for (let i = 0; i < 4; i++) {
        for (const e of state.entries) e.queue.push({ waitingSince: 0 });
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
    startGame();
  }
  function endGame() {
    if (state.over) return;
    state.over = true;
    state.paused = true;
    document.getElementById('go-score').textContent = state.delivered;
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
    document.getElementById('m-score').textContent = state.score;
    const bestEl = document.getElementById('m-best');
    if (bestEl) {
      bestEl.textContent = state.bestScore > state.score
        ? `best ${state.bestScore}`
        : '';
    }
    const pop = state.blocks.reduce((n, b) => n + (b.type === 'house' ? 2 : 0), 0);
    document.getElementById('m-pop').textContent = pop;
    const ratePerMin = state.time > 0 ? (state.delivered / state.time) * 60 : 0;
    document.getElementById('m-flow').innerHTML = `${Math.round(ratePerMin)}<span class="u">/min</span>`;
    drawFlowSpark();
    // Demand label updated by slider handler, not here.
    const fill = document.getElementById('jam-fill');
    fill.style.width = (state.jamMeter * 100).toFixed(0) + '%';
    fill.classList.toggle('warn', state.jamMeter > 0.35 && state.jamMeter < 0.7);
    fill.classList.toggle('bad', state.jamMeter >= 0.7);
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
      const ctx = this.ensure(); if (!ctx || this.muted) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(240, t + 0.07);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.09);
    },
    startPad() {
      const ctx = this.ensure(); if (!ctx || this.padStarted) return;
      this.padStarted = true;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = o2.type = 'sawtooth';
      o1.frequency.value = 110;
      o2.frequency.value = 110 * Math.pow(2, 7 / 1200);  // +7 cents
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
      lp.connect(g).connect(this.master);
      [o1, o2, lfo].forEach(n => n.start());
    }
  };

  // ================================================================
  // Boot
  // ================================================================
  function configureSplash() {
    const saved = hasSavedCity();
    const btnStart = document.getElementById('btn-start');
    const btnReset = document.getElementById('btn-reset');
    if (saved) {
      btnStart.textContent = 'Continue';
      btnReset.classList.remove('hidden');
    } else {
      btnStart.textContent = 'Start';
      btnReset.classList.add('hidden');
    }
  }

  (() => {
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    buildLevel();
    generateDecor();
    configureSplash();
    setupInput();
    requestAnimationFrame(frame);
  })();
})();
