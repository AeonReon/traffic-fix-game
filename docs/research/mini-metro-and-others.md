# Mini Metro, Cities Skylines, SimCity, Tropico — ideas to steal

## TL;DR — what to pull in, ranked

1. **Mini Metro's pressure-timer on stations** — a *visual* fullness
   ring around any overloaded building. The ring fills over ~30s;
   when full the building briefly stops accepting cars (but nothing
   fails). Best single idea from Mini Metro — it communicates
   "bottleneck here" in one glance.
2. **Cities Skylines' through-road roundabout** — a roundabout with a
   straight through-road crossing it via tunnel/overpass. Huge
   capacity gain over plain roundabouts. Good depth upgrade for late
   game.
3. **Cities Skylines' one-way road as a primary tool**, not an afterthought
   — the single most-recommended anti-congestion move in the whole CS
   community. We should ship one-way roads in the first major
   infrastructure update.
4. **SimCity's "avenues are arteries" hierarchy** — three visible road
   tiers (lane, avenue, highway) with different capacities and join
   rules. Gives the player a visible language of "main route" vs
   "side street" without extra UI.
5. **Tropico's "lay streets first, buildings align to them"** workflow
   — exactly what an orderly-designer player wants. Reinforces our
   grid-snap placement by making roads-first the canonical flow.

Explicitly **not** stealing: Mini Metro's line-colour puzzle, Cities
Skylines' agent simulation depth, SimCity's RCI demand model.

---

## Mini Metro

**What it is:** Minimalist subway designer. Stations of different
shapes spawn on the map; the player draws coloured lines connecting
them. Commuters travel to matching-shape stations. If any station
overflows, a timer runs down; if the timer completes, game over.

### Mechanics worth studying

- **Weekly upgrade draft.** Every Sunday, two upgrade choices: new
  line, more trains, passenger carriages, interchange, bridge, etc.
  Exact pattern we already want to adopt from MM.
- **Station pressure ring.** When a station exceeds capacity, a ring
  around it starts filling (visible, not a number). If it fills, game
  over. *Incredibly* readable as a signal.
- **Minimal audio.** Each station chime has a subtle pitch — the whole
  map becomes a gentle soundscape. Music emerges from play.
  ([whatNerd Mini Metro review](https://whatnerd.com/game-review-mini-metro/))
- **Automated play.** Trains run themselves. Player only edits the
  network. The "work" is planning, not babysitting. This is also
  us — our cars drive themselves.
- **Growth is gentle then ramps.** Same pacing curve as MM.

### What we steal

- ✅ **Pressure ring** (ranked #1 above). Keep it sandbox — fill the
  ring visibly, pulse red when full, but *don't* fail; accept a
  temporary "this building isn't accepting new cars" state until
  pressure drops.
- ✅ **Weekly cadence for the meta-beat** — we already want this from
  MM.
- ✅ **Quiet, emergent soundscape.** See `sound.md` — tiny
  building-specific chimes on delivery, tuned to a consonant scale.

### What we don't steal

- ❌ Shape-matching puzzle. Same reasoning as Mini Motorways colour-match.

Sources:
- [Mini Metro on Steam](https://store.steampowered.com/app/287980/Mini_Metro/)
- [Mini Metro Wiki — Gameplay](https://mini-metro.fandom.com/wiki/Category:Gameplay)
- [Android Central review](https://www.androidcentral.com/mini-metro-retro-review)
- [Steam — Extensive Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=313791555)

---

## Cities: Skylines

**What it is:** Full-scale city builder. The community spent a decade
figuring out traffic. Their lessons translate almost directly to our
small-scale game because our sim uses the same simplified routing
model.

### Mechanics worth studying

- **Road hierarchy: street / avenue / highway.** Different speeds,
  capacities, intersection rules. Big roads for arteries, small for
  neighbourhoods. Without a hierarchy, the player has no tool for
  "this is a main road".
- **Roundabouts vs intersections.** Community consensus is exactly
  what MM's internal math says: roundabouts beat lights almost
  everywhere. Four-way intersections with lights back traffic up
  fast. ([Dedoimedo](https://www.dedoimedo.com/games/cities-skylines-traffic.html))
- **Through-road roundabouts.** Add a straight crossing via tunnel or
  overpass. Doubles capacity for the dominant direction while keeping
  the circular flow for turners. ([A Guide to Roundabouts](https://guidestrats.com/cities-skylines-roundabouts/))
- **One-way roads as anti-congestion.** Turn a two-way into two
  parallel one-ways and intersection complexity drops massively.
  ([TheGamer — Traffic Flow Guide](https://www.thegamer.com/cities-skylines-traffic-flow-management-guide/))
- **Remove pedestrian crossings on high-flow routes.** Every crossing
  is a stop. Ours doesn't have pedestrians yet, but the principle
  ("every place cars can stop is a bottleneck") is pure gold.

### What we steal

- ✅ **Road hierarchy** (ranked #4 above). Start with 2 tiers: road
  (current) + highway/arterial (new in the Stage-C infrastructure
  update). Add more later.
- ✅ **Through-road roundabout** (ranked #2) — our existing roundabout
  tool + a new "upgrade roundabout to bypass" option that adds a
  straight overpass through the ring.
- ✅ **One-way roads as a first-class tool** (ranked #3). The feature
  that produces the biggest "aha" for the player. Ship early.

### What we don't steal

- ❌ Simulated agents with day-night jobs. Too heavy.
- ❌ Budget economy. We don't need money.
- ❌ Zoning by density. Buildings are individual placements in ours.

Sources:
- [Love Cities: Skylines — Traffic Management Guide](https://www.lovecitiesskylines.com/traffic-management-guide/)
- [Guide Strats — Traffic in Cities: Skylines](https://guidestrats.com/cities-skylines-traffic-guide/)
- [Guide Strats — Roundabouts](https://guidestrats.com/cities-skylines-roundabouts/)
- [Beyond Video Gaming — Managing Traffic in Cities: Skylines](https://www.beyondvideogaming.com/en/guides/managing-traffic-in-cities-skylines/)
- [TheGamer — Beginner's Guide to Traffic Flow](https://www.thegamer.com/cities-skylines-traffic-flow-management-guide/)
- [Dedoimedo — It's all in the roundabout](https://www.dedoimedo.com/games/cities-skylines-traffic.html)
- [Steam — Roundabout Analysis](https://steamcommunity.com/sharedfiles/filedetails/?id=464205329)

---

## SimCity (2000 / 4)

**What it is:** The granddaddy. Zone-based city sim. Traffic is a
second-order consequence of zoning and road density.

### Mechanics worth studying

- **Avenues as arteries.** The whole design language of the series is
  "thin streets for houses, wide avenues for movement, highways for
  inter-district". We already know this is right from first
  principles; SimCity shows that it *reads* visually.
- **Grid city + strategic breaks.** Pure grids have the best traffic
  numbers in SC4, but boring aesthetics. Experienced players break the
  grid strategically — diagonal avenues, radial routes — to create
  character without killing flow.
  ([SimCity 4 Traffic Layouts](https://community.simtropolis.com/omnibus/simcity-4/tutorials/simcity-4-traffic-layouts-r231/))
- **Minimise stoplight-heavy intersections.** Exact same lesson as MM
  and CS. It's the universal rule.
- **Traffic simulator finds nearest road, routes within max-distance.**
  Simple model. We already have one just like it.
- **Control your city's movement.** Setting up areas so that cars
  flow through specific chokepoints (rather than anywhere-to-
  everywhere) gives the player control over congestion.
  ([SimCity Planning Guide](https://www.simcityplanningguide.com/2013/10/traffic-and-rci-tips.html))

### What we steal

- ✅ **Road hierarchy** (already noted above — SimCity reinforces the
  Cities Skylines lesson).
- ✅ **Chokepoint design.** Our game should reward the player for
  *intentional* chokepoints rather than punish them. An upgraded
  highway or roundabout at a chokepoint = the city's "main junction"
  = satisfying to plan.

### What we don't steal

- ❌ Zoning. We have explicit building placement; zoning would be
  redundant.
- ❌ RCI demand model. Our demand is external (edge entries) + local
  (house → shop); no zone-type demand.

Sources:
- [Simtropolis — SimCity 4 Traffic Layouts](https://community.simtropolis.com/omnibus/simcity-4/tutorials/simcity-4-traffic-layouts-r231/)
- [SC4 Devotion — Tutorial: Understanding the Traffic Simulator](https://wiki.sc4devotion.com/index.php?title=Tutorial:Understanding_the_Traffic_Simulator)
- [SimCity Planning Guide — Traffic and RCI Tips](https://www.simcityplanningguide.com/2013/10/traffic-and-rci-tips.html)
- [Zen and the Art of SimCity 2000](http://www.ibiblio.org/GameBytes/issue18/misc/zen.html)

---

## Tropico

**What it is:** Banana-republic city-builder. Smaller in scope than
SimCity / CS. Roads can be curved, buildings align to them.

### Mechanics worth studying

- **"Streets first, buildings align to them."** Players are *encouraged*
  to lay out roads and then place buildings along them. Matches an
  orderly-designer mentality exactly. Tropico 7 adds free-shape curved
  roads and roundabouts.
  ([Tropico Wiki — Road and Bridges](https://tropico.fandom.com/wiki/Road))
- **Not every building needs a road.** Small walking paths connect
  buildings to nearby roads. (Interesting idea, but probably not ours.)
- **Community blocks.** Cluster housing + services (clinic, church)
  per neighbourhood, each its own little cell. Reduces traffic.
- **Shortest-route pathfinding that ignores jams.** Same as MM, same
  as ours. Tropicos also *don't* reroute mid-trip.

### What we steal

- ✅ **"Streets first" workflow** (ranked #5 above). Implicit in our
  current UI but we should reinforce it: when a player selects the
  Building tool, faintly highlight *nearby road segments* where it
  would snap — this nudges them to build the road first.
- ✅ **Community-block placement patterns** as a design lesson for
  tutorial/hint overlays, once we add those.

### What we don't steal

- ❌ Politics, edicts, elections — wrong game entirely.
- ❌ Garages / cars-with-routes-to-driveways — adds work, doesn't add
  fun for our scale.

Sources:
- [Tropico Wiki — Road and Bridges](https://tropico.fandom.com/wiki/Road)
- [Steam — Tropico 5 City Layout ideas](https://steamcommunity.com/app/245620/discussions/0/540744475582150073/)
- [Steam — Tropico 6 Traffic guide](https://steamcommunity.com/app/492720/discussions/0/600774870011271431/)
- [GameFAQs — Tropico 3 building placement](https://gamefaqs.gamespot.com/boards/955046-tropico-3/51987975)

---

## Cross-game patterns

These show up in every game above:

1. **Intersections are the enemy.** Every game's core bottleneck.
   Roundabouts/overpasses/motorways are all attempts to skip them.
2. **Hierarchy is load-bearing.** Small roads + big roads gives the
   player a visible language without tutorial.
3. **Visible pressure > numeric pressure.** Pins / rings / queues
   beat "demand: 73%" every time.
4. **Weekly cadence is a meta-beat.** Gives the player a pause to
   zoom out and replan, and a reason to look forward to the next
   session. Applies to both MM and Mini Metro.
5. **No reroute mid-trip.** Every game committed to the same trade-off
   — deterministic cars, no bounce-backwards bugs, simpler sim.

Our game already has #5. The rest are our next targets.
