#!/usr/bin/env node
// prep.js — one-shot: fetch Fuengirola OSM, simplify, bake to data/fuengirola.json
// Run from project root:  node scripts/prep.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const CENTER = { lat: 36.5490, lon: -4.6350 };
const RADIUS = 450;
const USE_CACHED = process.env.USE_CACHED === '1';

// Keep the "real" traffic-carrying roads; drop residential/service so the
// baseline scene is legible and leaves room for the player to draw new links.
const HW_KEEP = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'motorway_link', 'trunk_link', 'primary_link',
  'secondary_link', 'tertiary_link'
]);

const HW_RANK = {
  motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2,
  unclassified: 1, residential: 1, living_street: 1,
  motorway_link: 4, trunk_link: 4, primary_link: 3, secondary_link: 3, tertiary_link: 2
};

const SPEED_DEFAULTS = {
  motorway: 110, trunk: 90, primary: 70, secondary: 60, tertiary: 50,
  unclassified: 40, residential: 30, living_street: 20,
  motorway_link: 70, trunk_link: 60, primary_link: 50,
  secondary_link: 50, tertiary_link: 40
};

const DEG_LAT_M = 110540;
const DEG_LON_M = 111320;

function project(lat, lon) {
  const x = (lon - CENTER.lon) * DEG_LON_M * Math.cos(CENTER.lat * Math.PI / 180);
  const y = -(lat - CENTER.lat) * DEG_LAT_M;
  return { x, y };
}

function overpassQuery() {
  const dLat = RADIUS / DEG_LAT_M;
  const dLon = RADIUS / (DEG_LON_M * Math.cos(CENTER.lat * Math.PI / 180));
  const s = CENTER.lat - dLat, n = CENTER.lat + dLat;
  const w = CENTER.lon - dLon, e = CENTER.lon + dLon;
  const hwFilter = [...HW_KEEP].join('|');
  return `
    [out:json][timeout:25];
    (
      way["highway"~"^(${hwFilter})$"](${s},${w},${n},${e});
    );
    (._;>;);
    out;
  `;
}

function fetchOverpass() {
  return new Promise((resolve, reject) => {
    const data = 'data=' + encodeURIComponent(overpassQuery());
    const req = https.request({
      hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Douglas-Peucker: drop shape points within `tol` metres of the line.
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const sq = tol * tol;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  function rec(i, j) {
    let maxD = 0, maxIdx = -1;
    const a = pts[i], b = pts[j];
    for (let k = i + 1; k < j; k++) {
      const d = perpDist2(pts[k], a, b);
      if (d > maxD) { maxD = d; maxIdx = k; }
    }
    if (maxD > sq && maxIdx !== -1) {
      keep[maxIdx] = true;
      rec(i, maxIdx);
      rec(maxIdx, j);
    }
  }
  rec(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}

function perpDist2(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-6;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const qx = a.x + dx * t, qy = a.y + dy * t;
  return (p.x - qx) ** 2 + (p.y - qy) ** 2;
}

function buildNetwork(overpass) {
  const rawNodes = new Map();
  const ways = [];
  for (const el of overpass.elements) {
    if (el.type === 'node') rawNodes.set(el.id, { lat: el.lat, lon: el.lon });
    else if (el.type === 'way' && el.tags && HW_KEEP.has(el.tags.highway)) {
      if (el.tags.access === 'no' || el.tags.area === 'yes') continue;
      ways.push({ id: el.id, nodeIds: el.nodes, tags: el.tags });
    }
  }

  const useCount = new Map();
  for (const w of ways) for (const nid of w.nodeIds) {
    useCount.set(nid, (useCount.get(nid) || 0) + 1);
  }

  const nodes = new Map();
  for (const w of ways) for (const nid of w.nodeIds) {
    if (nodes.has(nid)) continue;
    const r = rawNodes.get(nid); if (!r) continue;
    const p = project(r.lat, r.lon);
    nodes.set(nid, { id: nid, x: p.x, y: p.y, junction: false });
  }

  const edges = [];
  let edgeId = 1;
  for (const w of ways) {
    const tags = w.tags;
    const onewayRaw = tags.oneway || '';
    const oneway = onewayRaw === 'yes' || onewayRaw === '1' || onewayRaw === 'true' || tags.junction === 'roundabout';
    const reverseOW = onewayRaw === '-1' || onewayRaw === 'reverse';
    let lanes = parseInt(tags.lanes || '', 10);
    if (!Number.isFinite(lanes)) lanes = (oneway || reverseOW) ? 1 : 2;
    lanes = Math.max(1, Math.min(4, lanes));
    const maxspeed = SPEED_DEFAULTS[tags.highway] || 40;
    const hw = tags.highway;
    const ids = w.nodeIds;
    if (ids.length < 2) continue;

    let segStart = 0;
    for (let i = 1; i < ids.length; i++) {
      const isEnd = i === ids.length - 1;
      const isJunction = (useCount.get(ids[i]) || 0) > 1;
      if (isEnd || isJunction) {
        const shapeIds = ids.slice(segStart, i + 1);
        let shape = [];
        for (const sid of shapeIds) {
          const n = nodes.get(sid); if (n) shape.push({ x: n.x, y: n.y });
        }
        if (shape.length >= 2) {
          // Simplify shape at 3m tolerance — keeps the curve, drops clutter.
          shape = simplify(shape, 3);
          const length = polyLen(shape);
          if (length > 3) {
            const fromId = shapeIds[0];
            const toId = shapeIds[shapeIds.length - 1];
            const base = {
              id: edgeId++, from: fromId, to: toId,
              shape, length, lanes, oneway: true,
              maxspeed, hw, rank: HW_RANK[hw] || 0
            };
            if (reverseOW) {
              base.from = toId; base.to = fromId;
              base.shape = shape.slice().reverse();
            }
            edges.push(base);
            if (!oneway && !reverseOW) {
              edges.push({
                ...base, id: edgeId++,
                from: base.to, to: base.from,
                shape: base.shape.slice().reverse()
              });
            }
          }
        }
        segStart = i;
      }
    }
  }

  // Recompute degrees and drop nodes not used by any edge.
  const neigh = new Map();
  for (const e of edges) {
    if (!neigh.has(e.from)) neigh.set(e.from, new Set());
    if (!neigh.has(e.to)) neigh.set(e.to, new Set());
    neigh.get(e.from).add(e.to);
    neigh.get(e.to).add(e.from);
  }
  const prunedNodes = {};
  for (const [id, n] of nodes) {
    if (!neigh.has(id)) continue;
    n.degree = neigh.get(id).size;
    n.junction = n.degree >= 3;
    prunedNodes[id] = { id, x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10, junction: n.junction, degree: n.degree };
  }

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id in prunedNodes) {
    const n = prunedNodes[id];
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  // Compact edges: round shape coords too
  for (const e of edges) {
    e.shape = e.shape.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
    e.length = Math.round(e.length * 10) / 10;
  }

  return {
    origin: CENTER,
    bbox: { minX, minY, maxX, maxY },
    nodes: prunedNodes,
    edges
  };
}

function polyLen(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}

(async () => {
  let overpass;
  const cachePath = path.join(__dirname, '..', 'data', 'fuengirola_raw.json');
  if (USE_CACHED && fs.existsSync(cachePath)) {
    console.error(`Using cached ${cachePath}`);
    overpass = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } else {
    console.error(`Fetching OSM within ${RADIUS}m of ${CENTER.lat},${CENTER.lon}…`);
    overpass = await fetchOverpass();
    fs.writeFileSync(cachePath, JSON.stringify(overpass));
  }
  console.error(`Got ${overpass.elements.length} elements.`);
  const net = buildNetwork(overpass);
  const outPath = path.join(__dirname, '..', 'data', 'fuengirola.json');
  fs.writeFileSync(outPath, JSON.stringify(net));
  const stats = fs.statSync(outPath);
  console.error(`Wrote ${outPath} (${stats.size} bytes): ${Object.keys(net.nodes).length} nodes, ${net.edges.length} edges`);
})();
