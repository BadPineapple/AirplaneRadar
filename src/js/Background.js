/* ──────────────────────────────  Background.js  ─────────────────────────── */
const path  = require("path");
const fs    = require("fs");
const fetch = require("node-fetch");           // v2
const { getOpenSkyToken } = require("../../config/OpenSkyAuth");
const { log, warn, error } = require("./Logger");

/* ───────────────────────  Cache de modelos  (24h)  ──────────────────────── */
const cacheFile = path.join(__dirname, '../../config/aircraft_cache.json');

// --- SISTEMA DE CACHE ---
let modelCache = {};
try {
    if (fs.existsSync(cacheFile)) {
        modelCache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    }
} catch (e) {
    warn("[CACHE] Erro ao carregar:", e);
}

function persistCache() {
    try {
        fs.writeFileSync(cacheFile, JSON.stringify(modelCache, null, 2), "utf8");
    } catch (e) {
        error("[CACHE] Erro ao salvar:", e);
    }
}

// --- UTILITÁRIOS MATEMÁTICOS ---
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDirection(lat1, lon1, lat2, lon2) {
    const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
    const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
              Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
              Math.cos(((lon2 - lon1) * Math.PI) / 180);
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    
    if (deg < 22.5 || deg >= 337.5) return "Norte";
    if (deg < 67.5) return "Nordeste";
    if (deg < 112.5) return "Leste";
    if (deg < 157.5) return "Sudeste";
    if (deg < 202.5) return "Sul";
    if (deg < 247.5) return "Sudoeste";
    if (deg < 292.5) return "Oeste";
    return "Noroeste";
}

function getAircraftType(callsign) {
    const cs = callsign?.trim().toUpperCase() || "";
    if (/^(AF|FAB|MIL|RCH)/.test(cs)) return "militar";
    if (cs.includes("HEL") || cs.startsWith("H")) return "helicoptero";
    if (cs.length <= 4 && cs !== "") return "privado";
    return "comercial";
}

// --- BUSCA DE MODELO (Otimizada) ---
async function getAircraftModel(icao24, config) {
    if (!icao24) return "Modelo Desconhecido";

    // Verifica cache válido (24h)
    const entry = modelCache[icao24];
    if (entry && (Date.now() - new Date(entry.fetchedAt).getTime() < 86400000)) {
        return entry.model;
    }

    // Se não está no cache, buscar na API (apenas se tivermos credenciais)
    const token = await getOpenSkyToken(config);
    if (!token) return "Avião Privado";

    try {
        const res = await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 429) {
            warn("[OpenSky] Rate limit atingido ao buscar modelo.");
            return "Limitado (API)";
        }
        
        const data = await res.json();
        const modelName = data.model || "Desconhecido";
        
        modelCache[icao24] = { model: modelName, fetchedAt: new Date().toISOString() };
        persistCache();
        return modelName;
    } catch (e) {
        return "Info indisponível";
    }
}

// --- CORE: BUSCA DE AVIÕES PRÓXIMOS ---
async function checkNearbyPlanes(userLocation, config) {
    try {
        const { lat, lon } = userLocation;
        const radiusKm = config?.search?.radius || 50;
        
        // Bounding box aproximado
        const delta = radiusKm / 111; 
        const lamin = lat - delta, lamax = lat + delta;
        const lomin = lon - delta, lomax = lon + delta;

        const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
        const resp = await fetch(url);
        
        if (!resp.ok) throw new Error(`OpenSky Off: ${resp.status}`);

        const data = await resp.json();
        if (!data.states) return [];

        // Processamento paralelo dos estados
        const planePromises = data.states.map(async (state) => {
            const [icao24, callsign, country, , , longitude, latitude, baro_alt, , , heading, , , , squawk, spi] = state;

            if (!latitude || !longitude) return null;

            const distance = calculateDistanceKm(lat, lon, latitude, longitude);
            if (distance > radiusKm) return null;

            const type = getAircraftType(callsign);
            const model = await getAircraftModel(icao24, config);

            return {
                icao24,
                callsign: callsign?.trim() || "N/A",
                country,
                lat: latitude,
                lon: longitude,
                altitude: Math.round(baro_alt || 0),
                distance: Math.round(distance * 10) / 10,
                direction: getDirection(lat, lon, latitude, longitude),
                emergencia: ["7500", "7600", "7700"].includes(squawk) || !!spi,
                heading: heading || 0,
                model,
                type,
                title: `Voo ${callsign?.trim() || icao24}`,
                body: `${model} • ${Math.round(distance)}km • ${country}`
            };
        });

        const results = await Promise.all(planePromises);
        return results
            .filter(Boolean)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5); // Retorna os 5 mais próximos

    } catch (e) {
        error("[BACKGROUND] Falha na busca:", e.message);
        return [];
    }
}

module.exports = { checkNearbyPlanes };