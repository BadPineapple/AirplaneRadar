/* ──────────────────────────────  Background.js  ─────────────────────────── */
/* eslint-disable no-console */
const path  = require("path");
const fs    = require("fs");
const fetch = require("node-fetch");           // v2
const { getOpenSkyToken } = require("../../config/OpenSkyAuth");
const { log, warn, error } = require("./Logger"); // <<  Logger global

/* ───────────────────────  Cache de modelos  (24h)  ──────────────────────── */
const cacheFile = path.join(__dirname, '../../config/aircraft_cache.json');

function loadDiskCache() {
  try {
    if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch (e) { warn("[CACHE] Falha ao ler cache:", e); }
  return {};
}
const modelCache = loadDiskCache();                 // vive na memória

function persistCache() {
  try { fs.writeFileSync(cacheFile, JSON.stringify(modelCache, null, 2), "utf8"); }
  catch (e) { error("[CACHE] Falha ao salvar cache:", e); }
}
/* ─────────────────────────────────────────────────────────────────────────── */

/* ---------- utilidades ---------------------------------------------------- */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDirection(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return deg < 45 || deg >= 315 ? "Norte" : deg < 135 ? "Leste" : deg < 225 ? "Sul" : "Oeste";
}

function getAircraftType(state) {
  const cs = state[1]?.trim().toUpperCase() || "";
  if (cs.startsWith("AF") || cs.startsWith("FAB") || cs.includes("MIL")) return "militar";
  if (cs.includes("HEL")) return "helicoptero";
  if (cs.includes("PRIV") || cs.includes("EXEC")) return "privado";
  if (cs.includes("B") || cs.includes("A") || cs.includes("VOO")) return "comercial";
  return "outros";
}

/* ----------  getAircraftModel com cache ----------------------------------- */
async function getAircraftModel(icao24, config) {
  if (!icao24) return null;

  const entry = modelCache[icao24];
  if (entry && Date.now() - new Date(entry.fetchedAt).getTime() < 24 * 3600_000) {
    return entry.model;                       // cache hit
  }

  const token = await getOpenSkyToken(config);
  if (!token) { warn("[OpenSky] Sem token para", icao24); return null; }

  const url = `https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { warn("[OpenSky] HTTP", res.status, res.statusText); return null; }

    const { model = null } = await res.json();
    if (model) {
      modelCache[icao24] = { model, fetchedAt: new Date().toISOString() };
      persistCache();
    }
    return model;
  } catch (e) {
    error("[OpenSky] Erro ao buscar modelo:", e);
    return null;
  }
}

/* ────────────────────────  Busca aviões próximos  ───────────────────────── */
async function checkNearbyPlanes(userLocation, config) {
  try {
    const { lat, lon } = userLocation;
    const radiusKm = config?.search?.radius ?? 50;
    const allowed  = config?.search?.filters || ["comercial","privado","militar","helicoptero","outros"];

    const delta = radiusKm / 111;
    const lamin = lat - delta, lamax = lat + delta;
    const lomin = lon - delta, lomax = lon + delta;

    const url  = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} – ${resp.statusText}`);

    const data = await resp.json();
    if (!data.states) return [];

    const planes = (await Promise.all(data.states.map(async state => {
      const [ icao24, callsign, origin_country,, , longitude, latitude,
              baro_altitude, , , true_track, , , , squawk, spi ] = state;

      if (latitude == null || longitude == null) return null;

      const distance = calculateDistanceKm(lat, lon, latitude, longitude);
      if (distance > radiusKm) return null;

      const type = getAircraftType(state);
      if (!allowed.includes(type)) return null;

      const direction = getDirection(lat, lon, latitude, longitude);
      const model     = await getAircraftModel(icao24, config);

      return {
        icao24,
        callsign : callsign?.trim() || "Desconhecido",
        origin_country,
        lat : latitude,
        lon : longitude,
        altitude : Math.round(baro_altitude || 0),
        distance : Math.round(distance),
        direction,
        squawk   : squawk || null,
        spi      : !!spi,
        emergencia: ["7500","7600","7700"].includes(squawk) || !!spi,
        heading  : true_track || 0,
        model    : model || "none",
        type,
        title: `Voo ${callsign?.trim() || icao24}, ${model} (${Math.round(distance)} km)`,
        body : `${origin_country} - ${direction} - Alt: ${Math.round(baro_altitude || 0)} m`,
        userLat: lat,
        userLon: lon
      };
    }))).filter(Boolean).sort((a,b) => a.distance - b.distance);

    log("Aviões obtidos:", planes.length);
    return planes.slice(0,5);
  } catch (e) {
    error("Falha checkNearbyPlanes:", e);
    return [];
  }
}

module.exports = { checkNearbyPlanes };
