// Traffic Flow — Fuengirola
// Single-file game: sim + render + interact + loop.
// Style: Mini-Motorways-ish. Real Fuengirola road skeleton as the baseline.

(() => {
  // ================================================================
  // Tuning
  // ================================================================
  const CAR_LEN = 4.5;          // metres
  const MIN_GAP = 2.0;
  const TIME_HEADWAY = 1.3;
  const ACCEL_MAX = 2.0;
  const BRAKE_COMF = 2.5;
  const BRAKE_HARD = 7.0;
  const IDM_DELTA = 4;
  const LANE_WIDTH_M = 3.5;

  const SIGNAL_GREEN = 14;
  const SIGNAL_YELLOW = 2.5;

  const DEMAND_START = 0.55;          // cars/second at game start (noticeable trickle)
  const DEMAND_RAMP_PER_SEC = 0.010;  // demand grows steadily
  const DEMAND_MAX = 3.0;

  const JAM_QUEUE_THRESHOLD = 70;     // queued cars beyond this = bad
  const JAM_FILL_RATE = 0.10;         // per second of jam, fill meter
  const JAM_DRAIN_RATE = 0.05;        // per second of no jam, drain meter
  const JAM_FAIL_AT = 1.0;

  const CAR_COLORS = ['#db6d51', '#3b82a8', '#e8a13a', '#4fa16a', '#a065c3', '#c24a3d', '#5a86c9'];

  // ================================================================
  // State
  // ================================================================
  const state = {
    net: null,             // { nodes: Map<id, node>, edges: [edge], origin, bbox }
    cars: [],
    nextCarId: 1,
    time: 0,
    paused: true,
    started: false,
    over: false,
    demand: DEMAND_START,
    spawnAccum: 0,
    completed: 0,
    throughputLog: [],
    jamMeter: 0,
    signalState: new Map(),
    approaches: new Map(),

    // Camera
    view: {
      scale: 1.6,
      originX: 0, originY: 0,
      dpr: window.devicePixelRatio || 1
    },

    // Interaction
    tool: 'road',
    pointers: new Map(),
    pinch: null,
    dragging: null,       // { startWorld, snapStartNode, cursorWorld, snapEndNode, isBridge }
    hover: null,          // { node?, edge? }
    panActive: false,
    panFrom: null
  };

  // ================================================================
  // Geometry helpers
  // ================================================================
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
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-4;
      if (acc + L >= d) {
        const t = (d - acc) / L;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          hx: (b.x - a.x) / L,
          hy: (b.y - a.y) / L
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
    // Return [t, u] where hit is a + t*(b-a) = c + u*(d-c), both in (0,1). null if none.
    const d1x = b.x - a.x, d1y = b.y - a.y;
    const d2x = d.x - c.x, d2y = d.y - c.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-6) return null;
    const t = ((c.x - a.x) * d2y - (c.y - a.y) * d2x) / denom;
    const u = ((c.x - a.x) * d1y - (c.y - a.y) * d1x) / denom;
    if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
    return { t, u, x: a.x + t * d1x, y: a.y + t * d1y };
  }

  // ================================================================
  // Network loading + rebuilding
  // ================================================================
  async function loadData() {
    const res = await fetch('data/fuengirola.json');
    const raw = await res.json();
    const nodes = new Map();
    for (const id in raw.nodes) {
      const n = raw.nodes[id];
      nodes.set(Number(id), {
        id: Number(id), x: n.x, y: n.y, junction: !!n.junction, degree: n.degree || 0,
        ctrl: 'none', bridge: false, custom: false
      });
    }
    const edges = raw.edges.map(e => ({ ...e, bridge: false, custom: false }));
    state.net = {
      nodes, edges,
      adjacency: new Map(), incoming: new Map(),
      sources: [], sinks: [],
      bbox: raw.bbox, origin: raw.origin
    };
    rebuildAdjacency();
    rebuildBoundaries();
    rebuildApproaches();
  }

  function rebuildAdjacency() {
    const adj = new Map(), inc = new Map();
    for (const e of state.net.edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e);
      if (!inc.has(e.to)) inc.set(e.to, []);
      inc.get(e.to).push(e);
    }
    state.net.adjacency = adj;
    state.net.incoming = inc;
  }

  function rebuildBoundaries() {
    // Boundary = degree-1 nodes of the ORIGINAL baked map. Player-added nodes
    // don't become sources.
    state.net.sources = [];
    state.net.sinks = [];
    for (const [id, n] of state.net.nodes) {
      if (n.custom) continue;
      if ((n.degree || 0) === 1) {
        const outs = state.net.adjacency.get(id) || [];
        const ins = state.net.incoming.get(id) || [];
        for (const e of outs) state.net.sources.push(e);
        for (const e of ins) state.net.sinks.push(e);
      }
    }
  }

  function rebuildApproaches() {
    state.approaches.clear();
    for (const [id, n] of state.net.nodes) {
      const incoming = state.net.incoming.get(id) || [];
      if (incoming.length < 2) continue;
      const list = incoming.map(e => {
        const pts = e.shape;
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        return { edge: e, bearing: Math.atan2(b.y - a.y, b.x - a.x), rank: e.rank || 0 };
      });
      list.sort((a, b) => a.bearing - b.bearing);
      state.approaches.set(id, list);
    }
  }

  function nextNodeId() {
    let max = 0;
    for (const id of state.net.nodes.keys()) if (id > max) max = id;
    return max + 1;
  }
  function nextEdgeId() {
    let max = 0;
    for (const e of state.net.edges) if (e.id > max) max = e.id;
    return max + 1;
  }

  function findNearestNode(wx, wy, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const n of state.net.nodes.values()) {
      const d = (n.x - wx) * (n.x - wx) + (n.y - wy) * (n.y - wy);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function findNearestEdge(wx, wy, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const e of state.net.edges) {
      const pts = e.shape;
      for (let i = 1; i < pts.length; i++) {
        const d = distPointSeg2(wx, wy, pts[i - 1], pts[i]);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    return best;
  }

  // ================================================================
  // Adding + erasing roads
  // ================================================================
  function findOrCreateNodeAt(wx, wy, snap) {
    const existing = findNearestNode(wx, wy, snap);
    if (existing) return existing;
    const id = nextNodeId();
    const n = {
      id, x: wx, y: wy, junction: false, degree: 0,
      ctrl: 'none', bridge: false, custom: true
    };
    state.net.nodes.set(id, n);
    return n;
  }

  // Split an existing edge at a given point (on the edge), inserting a new node.
  function splitEdgeAtPoint(edge, px, py) {
    // Find segment i and parameter t where the point lies
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

    // Build split node
    const newNode = findOrCreateNodeAt(px, py, 3);

    // Shape halves
    const a = pts[bestI - 1], b = pts[bestI];
    const splitPt = { x: a.x + (b.x - a.x) * bestT, y: a.y + (b.y - a.y) * bestT };

    const shapeA = pts.slice(0, bestI).concat([splitPt]);
    const shapeB = [splitPt].concat(pts.slice(bestI));

    // Replace `edge` with two edges
    const originalFrom = edge.from, originalTo = edge.to;
    edge.to = newNode.id;
    edge.shape = shapeA;
    edge.length = polyLen(shapeA);

    const tail = {
      ...edge,
      id: nextEdgeId(),
      from: newNode.id, to: originalTo,
      shape: shapeB,
      length: polyLen(shapeB)
    };
    state.net.edges.push(tail);

    // Also check for any twin (reverse) edge that needs splitting
    const twin = state.net.edges.find(x =>
      x !== edge && x !== tail &&
      x.from === originalTo && x.to === originalFrom &&
      Math.abs(x.length - (edge.length + tail.length)) < 3
    );
    if (twin) {
      // Split twin too — but mirrored: from originalTo back to originalFrom
      const tpts = twin.shape;
      // Find the closest point in twin's shape to splitPt
      // Since twin shape is the reverse shape, the split point is the same location.
      const tshapeA = [];
      for (const p of tpts) {
        tshapeA.push(p);
        if (Math.hypot(p.x - splitPt.x, p.y - splitPt.y) < 2) break;
      }
      // Use the cleanest approach: twin goes originalTo -> originalFrom,
      // so the first half (originalTo -> newNode) is the reverse of our shapeB.
      const thalfA = shapeB.slice().reverse();
      const thalfB = shapeA.slice().reverse();
      const twinOrigFrom = twin.from;
      twin.to = newNode.id;
      twin.shape = thalfA;
      twin.length = polyLen(thalfA);
      state.net.edges.push({
        ...twin,
        id: nextEdgeId(),
        from: newNode.id, to: twinOrigFrom,
        shape: thalfB,
        length: polyLen(thalfB)
      });
    }

    // Mark as junction
    newNode.junction = true;
    return newNode;
  }

  function addRoad(startWorld, endWorld, opts = {}) {
    const isBridge = !!opts.isBridge;
    const SNAP = 14;

    // Find or create start/end nodes
    let startNode = findOrCreateNodeAt(startWorld.x, startWorld.y, SNAP);
    let endNode = findOrCreateNodeAt(endWorld.x, endWorld.y, SNAP);
    if (startNode.id === endNode.id) return { ok: false, reason: 'start==end' };

    const shape = [
      { x: startNode.x, y: startNode.y },
      { x: endNode.x, y: endNode.y }
    ];
    const length = polyLen(shape);
    if (length < 6) return { ok: false, reason: 'too short' };

    // Intersection handling: for regular roads, any crossing with an existing
    // non-bridge edge becomes a junction. Bridges skip this — they pass over.
    if (!isBridge) {
      const crossings = [];
      for (const e of state.net.edges) {
        if (e.bridge) continue;   // can't form junction on a bridge
        const pts = e.shape;
        for (let i = 1; i < pts.length; i++) {
          const hit = segIntersect(shape[0], shape[1], pts[i - 1], pts[i]);
          if (hit) crossings.push({ edge: e, hit });
        }
      }
      // Sort crossings by t (along the new road) ascending
      crossings.sort((a, b) => a.hit.t - b.hit.t);
      // Split each crossed edge at the hit point, and use the new node as an
      // intermediate waypoint on our new road.
      const waypoints = [];
      for (const cr of crossings) {
        const newNode = splitEdgeAtPoint(cr.edge, cr.hit.x, cr.hit.y);
        waypoints.push(newNode);
      }
      // Build our new road as a chain of edges connecting startNode -> waypoints -> endNode.
      const chain = [startNode, ...waypoints, endNode];
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i], b = chain[i + 1];
        const s = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
        const newEdge = {
          id: nextEdgeId(), from: a.id, to: b.id,
          shape: s, length: polyLen(s),
          lanes: 1, oneway: false,
          maxspeed: 40, hw: 'unclassified', rank: 1,
          bridge: false, custom: true
        };
        state.net.edges.push(newEdge);
        // Reverse for two-way travel
        state.net.edges.push({
          ...newEdge, id: nextEdgeId(),
          from: b.id, to: a.id, shape: s.slice().reverse()
        });
      }
    } else {
      // Bridge: single straight edge, no intersection with anything.
      const newEdge = {
        id: nextEdgeId(), from: startNode.id, to: endNode.id,
        shape, length,
        lanes: 1, oneway: false,
        maxspeed: 50, hw: 'unclassified', rank: 2,
        bridge: true, custom: true
      };
      state.net.edges.push(newEdge);
      state.net.edges.push({
        ...newEdge, id: nextEdgeId(),
        from: endNode.id, to: startNode.id, shape: shape.slice().reverse()
      });
    }

    recomputeDegrees();
    rebuildAdjacency();
    rebuildApproaches();
    return { ok: true };
  }

  function eraseEdge(edge) {
    // Remove edge + its twin. Drop any cars whose path uses them.
    const twin = state.net.edges.find(x =>
      x !== edge && x.from === edge.to && x.to === edge.from &&
      Math.abs(x.length - edge.length) < 1
    );
    const gone = new Set([edge.id]); if (twin) gone.add(twin.id);
    state.net.edges = state.net.edges.filter(e => !gone.has(e.id));
    state.cars = state.cars.filter(c => !c.path.some(e => gone.has(e.id)));
    recomputeDegrees();
    rebuildAdjacency();
    rebuildApproaches();
  }

  function recomputeDegrees() {
    const neigh = new Map();
    for (const e of state.net.edges) {
      if (!neigh.has(e.from)) neigh.set(e.from, new Set());
      if (!neigh.has(e.to)) neigh.set(e.to, new Set());
      neigh.get(e.from).add(e.to);
      neigh.get(e.to).add(e.from);
    }
    for (const [id, n] of state.net.nodes) {
      const deg = (neigh.get(id) || new Set()).size;
      n.degree = deg;
      n.junction = deg >= 3;
    }
    // Prune unreachable nodes (degree 0) added previously but never connected
    for (const [id, n] of [...state.net.nodes]) {
      if (n.degree === 0 && n.custom) state.net.nodes.delete(id);
    }
  }

  function makeRoundabout(nodeId, radiusM = 12) {
    const node = state.net.nodes.get(nodeId);
    if (!node) return { ok: false, reason: 'no node' };
    const touching = state.net.edges.filter(e => e.from === nodeId || e.to === nodeId);
    if (touching.length < 3) return { ok: false, reason: 'need 3+ roads' };

    function dirFrom(e) {
      let dx, dy;
      if (e.from === nodeId) {
        const p0 = e.shape[0], p1 = e.shape[1];
        dx = p1.x - p0.x; dy = p1.y - p0.y;
      } else {
        const n = e.shape.length;
        const pn = e.shape[n - 1], pn1 = e.shape[n - 2];
        dx = pn1.x - pn.x; dy = pn1.y - pn.y;
      }
      const L = Math.hypot(dx, dy) || 1;
      return { dx: dx / L, dy: dy / L };
    }
    // Group edges by bearing bucket.
    const groups = [];
    for (const e of touching) {
      const d = dirFrom(e);
      const bearing = Math.atan2(d.dy, d.dx);
      let g = groups.find(g => Math.abs(angleDiff(g.bearing, bearing)) < 0.35);
      if (!g) { g = { bearing, dx: d.dx, dy: d.dy, edges: [] }; groups.push(g); }
      g.edges.push(e);
    }
    if (groups.length < 3) return { ok: false, reason: 'approaches too close' };

    // Ring nodes
    const ringNodes = groups.map(g => {
      const rx = node.x + radiusM * g.dx;
      const ry = node.y + radiusM * g.dy;
      const rn = {
        id: nextNodeId(), x: rx, y: ry,
        junction: true, degree: 3,
        ctrl: 'none', bridge: false, custom: true
      };
      state.net.nodes.set(rn.id, rn);
      return { node: rn, bearing: g.bearing, edges: g.edges };
    });

    // Rewire touching edges.
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

    // Counterclockwise when viewed from above (y-flipped). With our y-down
    // projection, that means sort by bearing DESCENDING.
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
      const steps = 5;
      const shape = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const ang = angA + delta * t;
        shape.push({ x: node.x + radiusM * Math.cos(ang), y: node.y + radiusM * Math.sin(ang) });
      }
      state.net.edges.push({
        id: nextEdgeId(), from: a.id, to: b.id,
        shape, length: polyLen(shape),
        lanes: 1, oneway: true,
        maxspeed: 25, hw: 'tertiary', rank: 2,
        bridge: false, custom: true
      });
    }

    // Remove the original node. Any existing cars with the old node's edges
    // keep working because we mutated the same edge objects in place — their
    // shape endpoints are now the ring nodes.
    state.net.nodes.delete(nodeId);
    // Drop any cars whose path straddled the removed junction (their routes
    // may be invalid across the modified edges).
    const memberIds = new Set(touching.map(e => e.id));
    state.cars = state.cars.filter(c => !c.path.some(e => memberIds.has(e.id)));

    recomputeDegrees();
    rebuildAdjacency();
    rebuildApproaches();
    return { ok: true };
  }

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function setSignal(nodeId, on) {
    const n = state.net.nodes.get(nodeId);
    if (!n) return;
    if (on && (n.degree || 0) < 3) return;
    n.ctrl = on ? 'signal' : 'none';
    if (!on) state.signalState.delete(nodeId);
    else ensureSignalState(nodeId);
  }

  function ensureSignalState(nodeId) {
    if (state.signalState.has(nodeId)) return state.signalState.get(nodeId);
    const approaches = state.approaches.get(nodeId) || [];
    if (approaches.length === 0) return null;
    const groups = [[], []];
    for (const ap of approaches) {
      const b = ((ap.bearing + Math.PI * 2) % Math.PI);
      const idx = (b < Math.PI / 4 || b >= 3 * Math.PI / 4) ? 0 : 1;
      groups[idx].push(ap.edge.id);
    }
    if (groups[0].length === 0) { groups[0] = groups[1]; groups[1] = []; }
    const s = { phase: 0, tPhase: 0, yellow: false, groups };
    state.signalState.set(nodeId, s);
    return s;
  }

  // ================================================================
  // Routing
  // ================================================================
  function route(startEdge, goalEdge) {
    if (!startEdge || !goalEdge) return null;
    if (startEdge.id === goalEdge.id) return [startEdge];
    const target = goalEdge.from;
    const dist = new Map();
    const prev = new Map();
    const visited = new Set();
    const q = [[0, startEdge.to]];
    dist.set(startEdge.to, 0);
    prev.set(startEdge.to, startEdge);
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, u] = q.shift();
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === target) break;
      const outs = state.net.adjacency.get(u) || [];
      for (const e of outs) {
        if (e.id === startEdge.id) continue;
        const w = e.length / Math.max(5, e.maxspeed * 1000 / 3600);
        const nd = d + w;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd); prev.set(e.to, e);
          q.push([nd, e.to]);
        }
      }
    }
    if (!prev.has(target)) return null;
    const chain = [];
    let cur = target;
    while (cur !== startEdge.to && prev.has(cur)) {
      const e = prev.get(cur);
      chain.push(e);
      cur = e.from;
    }
    chain.reverse();
    return [startEdge, ...chain, goalEdge];
  }

  // ================================================================
  // Simulation step
  // ================================================================
  function spawnCar() {
    const { sources, sinks } = state.net;
    if (!sources.length || !sinks.length) return null;
    const source = sources[Math.floor(Math.random() * sources.length)];
    for (const c of state.cars) {
      if (c.path[c.pathIdx] === source && c.pos < CAR_LEN + MIN_GAP + 1) return null;
    }
    let path = null;
    for (let k = 0; k < 8; k++) {
      const sink = sinks[Math.floor(Math.random() * sinks.length)];
      if (sink.from === source.to) continue;
      path = route(source, sink);
      if (path) break;
    }
    if (!path) return null;
    const baseTime = path.reduce((s, e) => s + e.length / Math.max(5, e.maxspeed * 1000 / 3600), 0);
    const car = {
      id: state.nextCarId++,
      path, pathIdx: 0, pos: 0,
      speed: Math.min(source.maxspeed * 1000 / 3600 * 0.55, 7),
      maxSpeed: Math.min(source.maxspeed * 1000 / 3600, 18),
      length: CAR_LEN,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      spawnedAt: state.time,
      baseTime,
      stuckTime: 0
    };
    state.cars.push(car);
    return car;
  }

  function stepSim(dt) {
    if (state.paused || state.over) return;
    state.time += dt;

    // Demand ramps over time.
    state.demand = Math.min(DEMAND_MAX, DEMAND_START + state.time * DEMAND_RAMP_PER_SEC);

    // Spawn
    state.spawnAccum += state.demand * dt;
    while (state.spawnAccum >= 1) { state.spawnAccum -= 1; spawnCar(); }

    // Signals
    for (const [nid, s] of state.signalState) {
      s.tPhase += dt;
      if (!s.yellow && s.tPhase >= SIGNAL_GREEN) { s.yellow = true; s.tPhase = 0; }
      else if (s.yellow && s.tPhase >= SIGNAL_YELLOW) {
        s.yellow = false; s.tPhase = 0;
        s.phase = (s.phase + 1) % s.groups.length;
        let g = 0;
        while (s.groups[s.phase].length === 0 && g++ < 4) s.phase = (s.phase + 1) % s.groups.length;
      }
    }

    // Cars per edge, sorted by pos
    const byEdge = new Map();
    for (const c of state.cars) {
      const e = c.path[c.pathIdx];
      if (!byEdge.has(e.id)) byEdge.set(e.id, []);
      byEdge.get(e.id).push(c);
    }
    for (const arr of byEdge.values()) arr.sort((a, b) => a.pos - b.pos);

    // Move
    const toRemove = [];
    for (const car of state.cars) {
      const e = car.path[car.pathIdx];
      const list = byEdge.get(e.id) || [];
      const myIdx = list.indexOf(car);
      const leader = myIdx >= 0 ? list[myIdx + 1] : null;
      let gap = Infinity, dv = 0;
      if (leader) {
        gap = leader.pos - car.pos - leader.length;
        dv = car.speed - leader.speed;
      } else {
        const remaining = e.length - car.pos;
        if (remaining < 30 && car.path[car.pathIdx + 1]) {
          const nextE = car.path[car.pathIdx + 1];
          const nlist = byEdge.get(nextE.id) || [];
          if (nlist.length && nlist[0].pos < 20) {
            gap = remaining + nlist[0].pos - nlist[0].length;
            dv = car.speed - nlist[0].speed;
          }
        }
      }

      // Junction obstacle
      const remaining = e.length - car.pos;
      if (remaining < 35 && car.path[car.pathIdx + 1]) {
        const node = state.net.nodes.get(e.to);
        if (node && junctionBlocks(node, e, car, remaining)) {
          const jgap = Math.max(0, remaining - 2.5);
          if (jgap < gap) { gap = jgap; dv = car.speed; }
        }
      }

      // IDM
      const v = car.speed;
      const v0 = Math.min(car.maxSpeed, e.maxspeed * 1000 / 3600);
      const laneFactor = 1 / Math.sqrt(Math.max(1, e.lanes || 1));
      const effMinGap = MIN_GAP * Math.max(0.5, laneFactor);
      const effHeadway = TIME_HEADWAY * Math.max(0.6, laneFactor);
      let accel;
      if (gap === Infinity) {
        accel = ACCEL_MAX * (1 - Math.pow(v / Math.max(0.5, v0), IDM_DELTA));
      } else {
        const sStar = effMinGap + Math.max(0, v * effHeadway + (v * dv) / (2 * Math.sqrt(ACCEL_MAX * BRAKE_COMF)));
        const s = Math.max(0.15, gap);
        accel = ACCEL_MAX * (1 - Math.pow(v / Math.max(0.5, v0), IDM_DELTA) - Math.pow(sStar / s, 2));
        if (accel < -BRAKE_HARD) accel = -BRAKE_HARD;
      }
      car.speed = Math.max(0, car.speed + accel * dt);
      car.pos += car.speed * dt;
      if (car.speed < 0.25) car.stuckTime += dt; else car.stuckTime = 0;

      let curE = e;
      while (car.pos >= curE.length && car.pathIdx < car.path.length - 1) {
        car.pos -= curE.length;
        car.pathIdx++;
        curE = car.path[car.pathIdx];
      }
      if (car.pathIdx >= car.path.length - 1 && car.pos >= car.path[car.path.length - 1].length) {
        state.completed++;
        state.throughputLog.push(state.time);
        toRemove.push(car);
      }
      if (car.stuckTime > 180) toRemove.push(car);
    }
    if (toRemove.length) state.cars = state.cars.filter(c => !toRemove.includes(c));

    // Jam meter: queued slow cars past threshold = bad
    const stuck = state.cars.filter(c => c.speed < 1.5).length;
    if (stuck > JAM_QUEUE_THRESHOLD) {
      const severity = (stuck - JAM_QUEUE_THRESHOLD) / JAM_QUEUE_THRESHOLD;
      state.jamMeter = Math.min(JAM_FAIL_AT, state.jamMeter + JAM_FILL_RATE * dt * (1 + severity));
    } else {
      state.jamMeter = Math.max(0, state.jamMeter - JAM_DRAIN_RATE * dt);
    }
    if (state.jamMeter >= JAM_FAIL_AT) endGame();

    // Trim throughput log
    const cutoff = state.time - 60;
    while (state.throughputLog.length && state.throughputLog[0] < cutoff) state.throughputLog.shift();
  }

  function junctionBlocks(node, edge, car, remaining) {
    if ((node.degree || 0) < 3 && node.ctrl === 'none') return false;
    if (node.ctrl === 'signal') {
      const s = state.signalState.get(node.id);
      if (!s) return false;
      if (s.yellow) return true;
      const g = s.groups[s.phase];
      if (!g.includes(edge.id)) return true;
      return false;
    }
    // Default priority-by-rank
    const approaches = state.approaches.get(node.id);
    if (!approaches || approaches.length <= 1) return false;
    const maxRank = Math.max(...approaches.map(a => a.rank));
    if ((edge.rank || 0) >= maxRank) return false;
    return approachHasConflict(node, edge, 3.2);
  }

  function approachHasConflict(node, myEdge, minGap) {
    const incoming = state.net.incoming.get(node.id) || [];
    for (const e of incoming) {
      if (e.id === myEdge.id) continue;
      for (const c of state.cars) {
        if (c.path[c.pathIdx] !== e) continue;
        const rem = e.length - c.pos;
        if (rem < 0) continue;
        const v = Math.max(1.5, c.speed);
        if (rem / v < minGap) return true;
      }
    }
    return false;
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
  }

  function fitToNetwork(pad = 40) {
    // Fit to the interesting part of the network rather than the entire bbox.
    // The A-7 stretches ~1.5 km N-S which is too elongated for a phone view.
    // Focus on a ±280 m window around origin (the interchange itself).
    const CORE = 280;
    const w = CORE * 2, h = CORE * 2.2;
    const sx = (state.view.w - pad * 2) / w;
    const sy = (state.view.h - pad * 2) / h;
    state.view.scale = Math.min(sx, sy);
    state.view.originX = 40;       // a hair east to center on the interchange
    state.view.originY = 120;      // a hair south: pulls the A-7 entrance exit junctions on screen
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

  // Background texture — cheap procedural parcels for visual interest.
  let bgCache = null;
  function ensureBgCache() {
    if (bgCache) return bgCache;
    // Seed-generate block patches between roads. For MVP: flat bg.
    bgCache = { ready: true };
    return bgCache;
  }

  function render() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f4ead5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.scale(state.view.dpr, state.view.dpr);

    drawBackgroundDecor();
    drawRoads();
    drawJunctions();
    drawCars();
    drawDragPreview();

    ctx.restore();
  }

  function drawBackgroundDecor() {
    // Soft random blobs for "buildings" / "greenery" between roads.
    // Use a seeded pseudo-random so it's consistent across frames.
    if (!state._bgBlobs) {
      const blobs = [];
      const { minX, minY, maxX, maxY } = state.net.bbox;
      let seed = 1337;
      const rand = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      const palette = ['#efe1c2', '#e8d5a8', '#d9c794', '#cfe0c0', '#dceac7'];
      const bhf = ['#e5d6b0', '#eadcab', '#d9c794'];
      for (let i = 0; i < 120; i++) {
        const x = minX + rand() * (maxX - minX);
        const y = minY + rand() * (maxY - minY);
        // Skip if close to a road.
        const e = findNearestEdge(x, y, 16);
        if (e) continue;
        const r = 8 + rand() * 22;
        const col = palette[Math.floor(rand() * palette.length)];
        blobs.push({ x, y, r, col, rot: rand() * Math.PI });
      }
      // A pool near the AquaMijas coordinate (bottom-right of bbox)
      blobs.push({
        x: state.net.bbox.maxX - 70,
        y: state.net.bbox.maxY - 260,
        r: 55,
        col: '#b7d7e0',
        rot: 0, pool: true
      });
      state._bgBlobs = blobs;
    }
    for (const b of state._bgBlobs) {
      const s = w2s(b.x, b.y);
      const rr = b.r * state.view.scale;
      ctx.save();
      ctx.translate(s.sx, s.sy);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.col;
      if (b.pool) {
        ctx.beginPath();
        ctx.ellipse(0, 0, rr, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-rr * 0.8, -rr * 0.55, rr * 1.6, rr * 1.1);
      }
      ctx.restore();
    }
  }

  function drawRoads() {
    // Two passes for clean casing: dark outline first, road fill second.
    for (const e of state.net.edges) {
      const w = laneWidth(e) * state.view.scale + 4;
      drawPolyline(e.shape, w, e.bridge ? 'rgba(42,47,60,0.25)' : '#1b1f2b');
    }
    for (const e of state.net.edges) {
      const w = laneWidth(e) * state.view.scale;
      const col = e.bridge ? '#4a5164' : roadFillColor(e);
      drawPolyline(e.shape, w, col);
      // Bridge: show parallel dashed deck edges for depth cue
      if (e.bridge) {
        drawBridgeDeck(e, w);
      }
    }
    // Center dashes on 2-lane or bigger roads.
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = Math.max(1, 0.5 * state.view.scale);
    ctx.strokeStyle = 'rgba(255, 239, 210, 0.6)';
    for (const e of state.net.edges) {
      if (e.lanes < 2 || e.bridge) continue;
      drawPolyline(e.shape, 0, null, true);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function laneWidth(e) {
    return Math.max(5, (e.lanes || 1) * LANE_WIDTH_M * 1.1);
  }

  function roadFillColor(e) {
    if (e.custom) return '#3c4256';
    const byHw = {
      motorway: '#353a4d',
      trunk: '#3a3f52',
      primary: '#404657',
      secondary: '#484d5e',
      tertiary: '#5a6070',
      unclassified: '#6b7180'
    };
    return byHw[e.hw] || '#5a6070';
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

  function drawBridgeDeck(e, w) {
    // Small lip on either side to hint elevation
    const pts = e.shape;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * (w / (2 * state.view.scale) + 0.5);
      const ny = dx / L * (w / (2 * state.view.scale) + 0.5);
      const pA = w2s(a.x + nx, a.y + ny), pB = w2s(b.x + nx, b.y + ny);
      const pC = w2s(a.x - nx, a.y - ny), pD = w2s(b.x - nx, b.y - ny);
      ctx.beginPath();
      ctx.moveTo(pA.sx, pA.sy); ctx.lineTo(pB.sx, pB.sy);
      ctx.moveTo(pC.sx, pC.sy); ctx.lineTo(pD.sx, pD.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawJunctions() {
    for (const n of state.net.nodes.values()) {
      if (n.degree <= 2 && n.ctrl === 'none') continue;
      const p = w2s(n.x, n.y);
      const r = Math.max(3.5, state.view.scale * 1.6);
      let fill = null;
      if (n.ctrl === 'signal') {
        const s = state.signalState.get(n.id);
        fill = !s ? '#6b7180' : (s.yellow ? '#e8a13a' : '#4fa16a');
      } else if (n.junction) {
        fill = 'rgba(255, 250, 238, 0.85)';
      }
      if (fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20, 25, 40, 0.45)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }

    // Hover highlight
    if (state.hover && state.hover.node) {
      const p = w2s(state.hover.node.x, state.hover.node.y);
      ctx.strokeStyle = 'rgba(219, 109, 81, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, Math.max(7, state.view.scale * 3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawCars() {
    // On small screens, force cars to a visible minimum. Without this, at a
    // fit-to-network zoom on a phone, a 4.5 m car is about 2 px long.
    const MIN_CAR_LEN = Math.max(10, Math.min(16, state.view.w / 40));
    const MIN_CAR_WID = MIN_CAR_LEN * 0.5;
    for (const car of state.cars) {
      const e = car.path[car.pathIdx];
      const p = sampleEdge(e, car.pos);
      const s = w2s(p.x, p.y);
      const ang = Math.atan2(p.hy, p.hx);
      const len = Math.max(MIN_CAR_LEN, car.length * state.view.scale * 1.3);
      const wid = Math.max(MIN_CAR_WID, 2.3 * state.view.scale);
      ctx.save();
      ctx.translate(s.sx, s.sy);
      ctx.rotate(ang);
      // Shadow
      ctx.fillStyle = 'rgba(20, 25, 40, 0.18)';
      ctx.beginPath();
      roundedRect(-len * 0.5 + 0.8, -wid * 0.5 + 1.3, len, wid, Math.min(wid * 0.45, 3));
      ctx.fill();
      // Body
      ctx.fillStyle = car.color;
      ctx.beginPath();
      roundedRect(-len * 0.5, -wid * 0.5, len, wid, Math.min(wid * 0.45, 3));
      ctx.fill();
      // Windscreen
      ctx.fillStyle = 'rgba(20, 25, 40, 0.45)';
      ctx.fillRect(len * 0.03, -wid * 0.36, len * 0.22, wid * 0.72);
      ctx.restore();
    }
  }

  function drawDragPreview() {
    if (!state.dragging) return;
    const a = state.dragging.snapStartNode
      ? { x: state.dragging.snapStartNode.x, y: state.dragging.snapStartNode.y }
      : state.dragging.startWorld;
    const b = state.dragging.snapEndNode
      ? { x: state.dragging.snapEndNode.x, y: state.dragging.snapEndNode.y }
      : state.dragging.cursorWorld;
    if (!b) return;
    const pA = w2s(a.x, a.y);
    const pB = w2s(b.x, b.y);
    const isBridge = state.dragging.isBridge;
    // Glow casing
    ctx.strokeStyle = isBridge ? 'rgba(160, 101, 195, 0.6)' : 'rgba(219, 109, 81, 0.6)';
    ctx.lineWidth = Math.max(6, LANE_WIDTH_M * 1.2 * state.view.scale + 4);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pA.sx, pA.sy); ctx.lineTo(pB.sx, pB.sy); ctx.stroke();
    // Inner line
    ctx.strokeStyle = isBridge ? '#a065c3' : '#db6d51';
    ctx.lineWidth = Math.max(3, LANE_WIDTH_M * state.view.scale);
    ctx.beginPath(); ctx.moveTo(pA.sx, pA.sy); ctx.lineTo(pB.sx, pB.sy); ctx.stroke();
    // Snap dots
    ctx.fillStyle = isBridge ? '#a065c3' : '#db6d51';
    ctx.beginPath();
    ctx.arc(pA.sx, pA.sy, 5, 0, Math.PI * 2); ctx.fill();
    if (state.dragging.snapEndNode) {
      ctx.beginPath();
      ctx.arc(pB.sx, pB.sy, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function roundedRect(x, y, w, h, r) {
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

  // ================================================================
  // Interaction
  // ================================================================
  function setupInput() {
    window.addEventListener('resize', () => { resizeCanvas(); });

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

    // Toolbar
    document.querySelectorAll('.tool').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });
    setTool('road');

    // HUD
    document.getElementById('btn-pause').addEventListener('click', togglePause);
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', restart);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { togglePause(); e.preventDefault(); }
      if (e.key === 'Escape') state.dragging = null;
      if (e.key === '1') setTool('road');
      if (e.key === '2') setTool('bridge');
      if (e.key === '3') setTool('roundabout');
      if (e.key === '4') setTool('light');
      if (e.key === '5') setTool('erase');
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
    state.view.scale = Math.max(0.4, Math.min(12, state.view.scale * factor));
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
      state.pinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
      state.dragging = null;
      state.panActive = false;
      return;
    }

    const world = s2w(mx, my);
    const isBuildTool = state.tool === 'road' || state.tool === 'bridge';
    if (isBuildTool) {
      // Start a drag-build
      const snap = findNearestNode(world.x, world.y, 16);
      state.dragging = {
        startWorld: world,
        snapStartNode: snap,
        cursorWorld: world,
        snapEndNode: null,
        isBridge: state.tool === 'bridge'
      };
    } else {
      state.panActive = true;
      state.panFrom = { mx, my, ox: state.view.originX, oy: state.view.originY };
      canvas.classList.add('grabbing');
    }
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
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (state.pinch.dist > 1) zoomAt(mid.x, mid.y, newDist / state.pinch.dist);
      state.pinch.dist = newDist;
      return;
    }

    const world = s2w(mx, my);
    if (state.dragging) {
      state.dragging.cursorWorld = world;
      state.dragging.snapEndNode = findNearestNode(world.x, world.y, 16);
    } else if (state.panActive && p) {
      const dx = (mx - state.panFrom.mx) / state.view.scale;
      const dy = (my - state.panFrom.my) / state.view.scale;
      state.view.originX = state.panFrom.ox - dx;
      state.view.originY = state.panFrom.oy - dy;
    } else {
      state.hover = { node: findNearestNode(world.x, world.y, 14) };
    }
  }

  function onPointerUp(e) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    const p = state.pointers.get(e.pointerId);
    state.pointers.delete(e.pointerId);
    if (state.pointers.size < 2) state.pinch = null;
    if (state.pointers.size === 0) {
      state.panActive = false;
      canvas.classList.remove('grabbing');
    }

    if (!p) return;
    const dt = performance.now() - p.startedAt;
    const isTap = dt < 400 && !p.moved && state.pointers.size === 0;

    if (state.dragging) {
      const d = state.dragging;
      const endWorld = d.snapEndNode
        ? { x: d.snapEndNode.x, y: d.snapEndNode.y }
        : d.cursorWorld;
      const startWorld = d.snapStartNode
        ? { x: d.snapStartNode.x, y: d.snapStartNode.y }
        : d.startWorld;
      state.dragging = null;
      const dist = Math.hypot(endWorld.x - startWorld.x, endWorld.y - startWorld.y);
      if (dist < 15) {
        // too-short drag = treat as tap on build tool, no-op
      } else {
        const res = addRoad(startWorld, endWorld, { isBridge: d.isBridge });
        if (res.ok) toast(d.isBridge ? 'Bridge built.' : 'Road added.');
        else toast(res.reason);
      }
      return;
    }

    if (isTap) {
      const world = s2w(p.startX, p.startY);
      handleTap(world);
    }
  }

  function handleTap(world) {
    if (state.tool === 'roundabout') {
      const node = findNearestNode(world.x, world.y, 18);
      if (!node) return toast('Tap a junction.');
      const res = makeRoundabout(node.id);
      if (!res.ok) toast(res.reason);
      else toast('Roundabout built.');
    } else if (state.tool === 'light') {
      const node = findNearestNode(world.x, world.y, 18);
      if (!node) return toast('Tap a junction.');
      if (!node.junction) return toast('Only junctions can have signals.');
      const on = node.ctrl !== 'signal';
      setSignal(node.id, on);
      toast(on ? 'Signal added.' : 'Signal removed.');
    } else if (state.tool === 'erase') {
      const edge = findNearestEdge(world.x, world.y, 16);
      if (!edge) return toast('Tap a road to erase.');
      if (!edge.custom) return toast('Can only erase roads you added.');
      eraseEdge(edge);
      toast('Road erased.');
    }
  }

  let toastT = null;
  function toast(msg, ms = 2000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ================================================================
  // Game loop + state transitions
  // ================================================================
  function startGame() {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('toolbar').classList.remove('hidden');
    state.paused = false;
    state.started = true;
    // Seed the scene with a handful of cars so it's immediately alive.
    for (let i = 0; i < 12; i++) spawnCar();
    // Advance a couple of sim seconds so the seeded cars aren't all bunched at pos 0.
    for (let i = 0; i < 80; i++) stepSim(0.05);
  }
  function restart() {
    document.getElementById('gameover').classList.add('hidden');
    state.cars = [];
    state.completed = 0;
    state.throughputLog = [];
    state.jamMeter = 0;
    state.demand = DEMAND_START;
    state.time = 0;
    state.over = false;
    state.paused = false;
    // Rebuild from baked data to undo any player edits? Keep edits for now —
    // it's their design.
  }
  function endGame() {
    if (state.over) return;
    state.over = true;
    state.paused = true;
    document.getElementById('go-score').textContent = state.completed;
    const el = document.getElementById('gameover');
    el.classList.remove('hidden');
  }

  function togglePause() {
    if (!state.started || state.over) return;
    state.paused = !state.paused;
    document.getElementById('btn-pause').textContent = state.paused ? '▶' : '⏸';
  }

  function updateHud() {
    document.getElementById('m-done').textContent = state.completed;
    const tpWin = Math.min(60, state.time);
    const tp = tpWin > 0 ? (state.throughputLog.length / tpWin) * 60 : 0;
    document.getElementById('m-flow').innerHTML = `${Math.round(tp)}<span class="u">/min</span>`;
    const dmul = (state.demand / DEMAND_START).toFixed(1);
    document.getElementById('m-demand').innerHTML = `${dmul}<span class="u">×</span>`;
    const fill = document.getElementById('jam-fill');
    fill.style.width = (state.jamMeter * 100).toFixed(0) + '%';
    fill.classList.toggle('warn', state.jamMeter > 0.35 && state.jamMeter < 0.7);
    fill.classList.toggle('bad', state.jamMeter >= 0.7);
  }

  let lastFrame = 0;
  function frame(ts) {
    const dt = Math.min(0.08, (ts - lastFrame) / 1000 || 0);
    lastFrame = ts;
    stepSim(dt);
    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  // ================================================================
  // Boot
  // ================================================================
  (async () => {
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    try {
      await loadData();
    } catch (err) {
      toast('Failed to load map.');
      console.error(err);
      return;
    }
    fitToNetwork(50);
    ensureBgCache();
    setupInput();
    requestAnimationFrame(frame);
  })();
})();
