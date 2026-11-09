// Wheelchair-accessible places nearby, from OpenStreetMap's own search (Nominatim: free, no key; one request per
// question, as its usage policy asks). Only the area name and the kind of place leave the PC. OSM's wheelchair tag
// is trusted as it is: an untagged place is "unknown", never "accessible". (The Overpass servers were tried first
// but timed out from here on 2026-11-09; Nominatim answered in about a second with the same tags.)

/** Kinds of place: the words searched for, and the OSM category/type a real result must have. */
export const KINDS = {
  hospital: ['hospital', 'amenity', /^hospital$/],
  clinic: ['clinic', 'amenity', /^(clinic|doctors)$/],
  pharmacy: ['pharmacy', 'amenity', /^pharmacy$/],
  toilets: ['toilets', 'amenity', /^toilets$/],
  restaurant: ['restaurant', 'amenity', /^restaurant$/],
  cafe: ['cafe', 'amenity', /^cafe$/],
  atm: ['atm', 'amenity', /^atm$/],
  bank: ['bank', 'amenity', /^bank$/],
  bus_stop: ['bus stop', 'highway', /^bus_stop$/],
  train_station: ['railway station', 'railway', /^(station|halt)$/],
  supermarket: ['supermarket', 'shop', /^supermarket$/],
  police: ['police', 'amenity', /^police$/],
  park: ['park', 'leisure', /^park$/],
};

const RANK = { yes: 0, limited: 1, unknown: 2 };
const HEADERS = { 'User-Agent': 'Maya-assistant (accessible places)' };

/** Nominatim search for one kind of place in a box radiusKm around a point. Exported for tests. */
export function searchUrl(kind, lat, lon, radiusKm) {
  if (!KINDS[kind]) throw new Error(`Unknown kind of place "${kind}". Use one of: ${Object.keys(KINDS).join(', ')}.`);
  const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const box = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((n) => n.toFixed(5)).join(',');
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&addressdetails=1&limit=40&bounded=1&viewbox=${box}&q=${encodeURIComponent(KINDS[kind][0])}`;
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Real places of this kind within radiusKm, wheelchair access first (yes, limited, unknown), nearest first.
 * "no", nameless results and look-alikes (a street called "Pharmacy Road") are left out. Exported for tests.
 */
export function rankPlaces(results, origin, kind, radiusKm, limit = 8) {
  const [, category, type] = KINDS[kind];
  return results
    .filter((r) => r.name && r.category === category && type.test(r.type) && r.extratags?.wheelchair !== 'no')
    .map((r) => {
      const t = r.extratags || {}, a = r.address || {}, at = { latitude: Number(r.lat), longitude: Number(r.lon) };
      const address = [a.house_number, a.road].filter(Boolean).join(' ') || a.suburb || '';
      return {
        name: r.name, wheelchair: RANK[t.wheelchair] === undefined ? 'unknown' : t.wheelchair,
        distance_km: Math.round(distanceKm(origin, at) * 100) / 100,
        ...(address && { address }), ...(t.phone && { phone: t.phone }), ...(t.opening_hours && { opening_hours: t.opening_hours }),
        map: `https://www.openstreetmap.org/?mlat=${at.latitude}&mlon=${at.longitude}#map=18/${at.latitude}/${at.longitude}`,
      };
    })
    .filter((p) => p.distance_km <= radiusKm)
    .sort((a, b) => RANK[a.wheelchair] - RANK[b.wheelchair] || a.distance_km - b.distance_km)
    .slice(0, limit);
}

const plural = (w) => (w === 'police' ? 'police stations' : /s$/.test(w) ? w : w.endsWith('y') ? `${w.slice(0, -1)}ies` : `${w}s`);
const named = (list) => list.map((p) => `${p.name} (${p.distance_km} km)`).join(', ');

/**
 * What the data says, in plain words, for Maya to read out. The small model once "remembered" a famous hospital
 * with step-free access that the map did not have, so the answer is built here, from the results only. Exported for tests.
 */
export function placesSummary(places, kind, where, radiusKm) {
  const pl = plural(KINDS[kind][0]);
  if (!places.length) return `No ${pl} found within ${radiusKm} km of ${where} on OpenStreetMap. Offer a bigger radius.`;
  const yes = places.filter((p) => p.wheelchair === 'yes'), part = places.filter((p) => p.wheelchair === 'limited');
  let s = `Found ${places.length} ${places.length === 1 ? KINDS[kind][0] : pl} within ${radiusKm} km of ${where}.`;
  if (yes.length) s += ` ${yes.length} ${yes.length === 1 ? 'has' : 'have'} step-free (wheelchair) access recorded: ${named(yes)}.`;
  if (part.length) s += ` ${named(part)} ${part.length === 1 ? 'is' : 'are'} partly accessible.`;
  if (!yes.length && !part.length) return `${s} None has wheelchair access recorded in OpenStreetMap, so call ahead to check. Nearest: ${named(places.slice(0, 3))}.`;
  return yes.length + part.length < places.length ? `${s} The others have no access information: call ahead.` : s;
}

/** Up to 8 places of this kind near a named place, wheelchair-accessible ones first. */
export async function findAccessible({ kind, near, radiusKm = 3 }, { fetchFn = fetch } = {}) {
  const geo = await (await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(near)}`, { signal: AbortSignal.timeout(15_000) })).json();
  const spot = geo.results?.[0];
  if (!spot) throw new Error(`Couldn't find the place "${near}". Ask the user for a nearby town or city name.`);
  const radius = Math.min(Math.max(Number(radiusKm) || 3, 0.5), 10);
  const res = await fetchFn(searchUrl(kind, spot.latitude, spot.longitude, radius), { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`The map service is busy (error ${res.status}). Try again in a minute.`);
  const places = rankPlaces(await res.json(), spot, kind, radius);
  const where = [spot.name, spot.admin1].filter(Boolean).join(', ');
  return {
    summary: placesSummary(places, kind, where, radius), places,
    how: 'Answer from "summary" only. Never add a place that is not in "places", even one you know; never call a place (or a list) "wheelchair-accessible" unless its wheelchair is "yes", even if the user asked for accessible ones. Distances are straight-line; "unknown" access = call ahead.',
  };
}
