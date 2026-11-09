import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-places-'));
const { openStore } = await import('../src/main/store.js');
const places = await import('../src/main/services/places.js');
const { searchUrl, rankPlaces, findAccessible, KINDS } = places;
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

const CHENNAI = { latitude: 13.0827, longitude: 80.2707 };
// Nominatim (jsonv2 + extratags + addressdetails) results.
const hit = (name, wheelchair, lat, lon, extra = {}, type = 'pharmacy', category = 'amenity') =>
  ({ name, category, type, lat: String(lat), lon: String(lon), extratags: { ...(wheelchair ? { wheelchair } : {}), ...extra.tags }, address: extra.address || {} });
const RESULTS = [
  hit('Far Accessible Pharmacy', 'yes', 13.10, 80.27),
  hit('Near Unknown Pharmacy', null, 13.0830, 80.2710),
  hit('Steps Only Pharmacy', 'no', 13.0828, 80.2708),
  hit('Near Accessible Pharmacy', 'yes', 13.0840, 80.2720, { tags: { phone: '+91 44 1234', opening_hours: '24/7' }, address: { house_number: '12', road: 'Anna Salai' } }),
  hit('Ramp Pharmacy', 'limited', 13.0835, 80.2715),
  hit('Pharmacy Road', null, 13.0829, 80.2709, {}, 'residential', 'highway'), // a street named "pharmacy", not a pharmacy
  hit('', null, 13.083, 80.271), // no name: useless to the user
  hit('Out Of Range Pharmacy', 'yes', 13.20, 80.27), // inside the square box, beyond the radius
];

test('the search asks for that kind of place in a box around the point', () => {
  const u = new URL(searchUrl('pharmacy', 13.08, 80.27, 3));
  assert.equal(u.host, 'nominatim.openstreetmap.org');
  assert.equal(u.searchParams.get('q'), 'pharmacy');
  assert.equal(u.searchParams.get('bounded'), '1');
  assert.equal(u.searchParams.get('extratags'), '1');
  const [w, n, e, s] = u.searchParams.get('viewbox').split(',').map(Number);
  assert.ok(w < 80.27 && e > 80.27 && s < 13.08 && n > 13.08);
  assert.ok(Math.abs(n - 13.08 - 3 / 111) < 0.001, 'about 3 km north');
  assert.equal(new URL(searchUrl('bus_stop', 1, 2, 1)).searchParams.get('q'), 'bus stop');
  assert.throws(() => searchUrl('casino', 1, 2, 1), /kind/);
  for (const k of ['hospital', 'pharmacy', 'toilets', 'restaurant', 'train_station']) assert.ok(KINDS[k], k);
});

test('wheelchair access first, then distance; wrong kinds, inaccessible, nameless and far places are left out', () => {
  const ranked = rankPlaces(RESULTS, CHENNAI, 'pharmacy', 3);
  assert.deepEqual(ranked.map((p) => p.name), ['Near Accessible Pharmacy', 'Far Accessible Pharmacy', 'Ramp Pharmacy', 'Near Unknown Pharmacy']);
  assert.deepEqual(ranked.map((p) => p.wheelchair), ['yes', 'yes', 'limited', 'unknown']);
  const top = ranked[0];
  assert.equal(top.address, '12 Anna Salai');
  assert.equal(top.phone, '+91 44 1234');
  assert.equal(top.opening_hours, '24/7');
  assert.ok(top.distance_km > 0 && top.distance_km < 1, String(top.distance_km));
  assert.match(top.map, /^https:\/\/www\.openstreetmap\.org\/\?mlat=/);
  assert.equal(rankPlaces(Array.from({ length: 20 }, (_, i) => hit(`P${i}`, 'yes', 13.08 + i / 1000, 80.27)), CHENNAI, 'pharmacy', 3).length, 8);
});

test('finds places through the geocoder and the map search', async () => {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push(String(url));
    if (String(url).includes('geocoding')) return { ok: true, json: async () => ({ results: [{ name: 'Chennai', admin1: 'Tamil Nadu', ...CHENNAI }] }) };
    assert.match(opts.headers?.['User-Agent'] || '', /Maya/, 'OpenStreetMap asks apps to name themselves');
    return { ok: true, json: async () => RESULTS };
  };
  const r = await findAccessible({ kind: 'pharmacy', near: 'Chennai', radiusKm: 3 }, { fetchFn });
  assert.match(r.summary, /within 3 km of Chennai, Tamil Nadu/);
  assert.equal(r.places[0].name, 'Near Accessible Pharmacy');
  assert.match(r.how, /never add a place/i);
  assert.equal(calls.length, 2);
  const nowhere = async () => ({ ok: true, json: async () => ({ results: [] }) });
  await assert.rejects(findAccessible({ kind: 'pharmacy', near: 'Qwxzzy' }, { fetchFn: nowhere }), /Couldn't find the place "Qwxzzy"/);
  const down = async (url) => (String(url).includes('geocoding') ? { ok: true, json: async () => ({ results: [CHENNAI] }) } : { ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(findAccessible({ kind: 'pharmacy', near: 'Chennai' }, { fetchFn: down }), /map service is busy/);
});

test('the summary says plainly what is known, so Maya cannot invent an accessible place', () => {
  const { placesSummary } = places;
  const ranked = rankPlaces(RESULTS, CHENNAI, 'pharmacy', 3);
  const s = placesSummary(ranked, 'pharmacy', 'Chennai, Tamil Nadu', 3);
  assert.match(s, /^Found 4 pharmacies within 3 km of Chennai, Tamil Nadu\./);
  assert.match(s, /2 have step-free \(wheelchair\) access recorded: Near Accessible Pharmacy \(0\.\d+ km\), Far Accessible Pharmacy/);
  assert.match(s, /Ramp Pharmacy .* partly accessible/);
  const none = placesSummary(rankPlaces(RESULTS.filter((r) => !r.extratags.wheelchair), CHENNAI, 'pharmacy', 3), 'pharmacy', 'Chennai', 3);
  assert.match(none, /None has wheelchair access recorded/);
  assert.match(none, /Nearest: Near Unknown Pharmacy \(0\.\d+ km\)/);
  assert.match(none, /call ahead/);
  assert.match(placesSummary([], 'hospital', 'Ooty', 2), /^No hospitals found within 2 km of Ooty/);
});

test('the tool asks for a place when it knows none, and uses the saved city otherwise', async () => {
  const tool = allTools.find((t) => t.name === 'places_accessible');
  assert.ok(tool, 'places_accessible is registered');
  const store = openStore(':memory:');
  const r = await tool.run({ kind: 'hospital' }, { store, services: {} });
  assert.match(r.ask_user, /which town or area/i);
  store.setSetting('city', 'Qwxzzy');
  const seen = [];
  const fetchFn = async (url) => { seen.push(String(url)); return { ok: true, json: async () => ({ results: [] }) }; };
  await assert.rejects(tool.run({ kind: 'hospital' }, { store, services: { fetch: fetchFn } }), /Qwxzzy/);
  assert.match(seen[0], /Qwxzzy/);
});

test('accessibility and "near me" requests reach the tool', () => {
  const names = (t) => selectTools(allTools, t).map((x) => x.name);
  for (const t of ['find a wheelchair accessible pharmacy near me', 'nearest hospital', 'accessible toilets in Chennai', 'is there a cafe nearby with a ramp'])
    assert.ok(names(t).includes('places_accessible'), t);
  assert.ok(!names('what is an API?').includes('places_accessible'));
});
