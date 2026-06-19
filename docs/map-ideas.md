# Map Feature Ideas (backlog)

> Captured for later. Most are **free** (OSM tiles + OSRM, already used for route-snapping). Only "Live traffic ETA" needs a paid provider.

## Live ops (dispatcher view)
- **Live worker markers with status colors** — en route (blue) / on-site (green) / idle (grey), avatar pins, last-seen time. _Free._
- **Marker clustering** — at city zoom, group nearby workers/tasks into a count bubble so it stays readable at scale. _Free._
- **"Nearest technician"** — when assigning a task, rank/highlight the closest available worker to the job pin. Huge for dispatch. _Free (haversine + OSRM for drive-time)._
- **Click a worker → mini card** — name, current task, ETA, battery/last-ping. _Free._

## Routes & navigation
- **Planned route + ETA**, not just the traveled path — draw the road route from worker → job and show distance/ETA. _Free with OSRM (already in use)._
- **Route playback** — a timeline scrubber that animates the technician's drive over time; detect **stops** (parked > N min). Great for reviewing a day. _Free._
- **Speed-colored route** — color segments by speed (red = slow/traffic, green = fast) so you see where time was lost. _Free._
- **"Navigate" deep-link** — button that opens the job in the phone's Google/Apple Maps for turn-by-turn. _Free._
- **Live traffic ETA** — only this one needs a paid provider (Google/Mapbox).

## Attendance / geofence
- **All geofences on one map** — see every space's clock-in circle at once; spot overlaps or gaps. _Free._
- **Clock-in pins vs geofence** — plot where each clock-in actually happened relative to the fence (was it inside? how far?). Catches GPS issues and "buddy punching." _Free._
- **Coverage / activity heatmap** — where workers actually spend time, or task density by area. _Free._

## Polish (quick wins)
- **Dark map tiles** in dark mode (CARTO dark tiles, free) so the map isn't a bright box.
- **Satellite/hybrid toggle** — helps place a pin on the exact building/entrance.
- **Fullscreen button** on the live map.

## Top picks (biggest impact)
1. **Live worker map** with status + clustering + click-card (the dispatcher's daily screen)
2. **Nearest-technician on assign** (real dispatch value, free)
3. **Route playback with stops** (review/accountability, free)
4. **Dark tiles + satellite toggle** (cheap polish, helps pin accuracy)

**Suggested starting point:** the **live worker map** or **nearest-technician** — both free and high-impact.
