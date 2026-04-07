/* ──────────────────────────────  Background.js  ─────────────────────────── */
const path  = require("path");
const fs    = require("fs");
const { getOpenSkyToken } = require("../../config/OpenSkyAuth");
const { log, warn, error } = require("./Logger");

const cacheFile = path.join(__dirname, '../../config/aircraft_cache.json');
const PLANESPOTTERS_API = "https://api.planespotters.net/pub/photos/hex/";
const aircraftDatabase = require('../../config/TechnicalData.json');
const fetch = globalThis.fetch;

// --- SISTEMA DE CACHE ÚNICO ---
let aircraftCache = {};
try {
    if (fs.existsSync(cacheFile)) {
        aircraftCache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    }
} catch (e) {
    warn("[CACHE] Erro ao carregar arquivo de cache.");
}

function persistCache() {
    try {
        fs.writeFileSync(cacheFile, JSON.stringify(aircraftCache, null, 2), "utf8");
    } catch (e) {
        error("[CACHE] Falha ao persistir dados.");
    }
}

// --- UTILITÁRIOS ---
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
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
function calculateAge(year) {
    return year ? new Date().getFullYear() - year : "N/A";
}

function getTechSpecsByModel(model) {
    if (!model || model === "Desconhecido") return {};

    const modelUpper = model.toUpperCase();
    
    const keys = Object.keys(aircraftDatabase);
    const matchedKey = keys.find(key => modelUpper.includes(key));

    if (matchedKey) return aircraftDatabase[matchedKey];
    if (modelUpper.includes("HELICOPTER") || modelUpper.includes("H1")) return { engines_type: "Turboshaft", plane_class: "H" };

    return {};
}

// --- BUSCA DE DETALHES COMPLETOS (AGORA PARAMETRIZADA) ---

// Adicionado o parâmetro 'requiresPhoto' (padrão falso)
async function getAircraftFullDetails(icao24, config, requiresPhoto = false) {
    const fallbackData = {
        model: "Desconhecido",
        icaoCode: icao24 ? icao24.toUpperCase() : "N/A",
        photo: null,
        registration_number: "N/A",
        plane_owner: "Particular",
        hasCheckedPhoto: false
    };

    if (!icao24) return fallbackData;

    // 1. Check Cache (24h)
    const entry = aircraftCache[icao24];
    if (entry && (Date.now() - new Date(entry.fetchedAt).getTime() < 86400000)) {
        return entry.fullData;
    }

    let fullData = {
        model: "Desconhecido",
        icaoCode: icao24 ? icao24.toUpperCase() : "N/A",
        Production_line: "N/A",
        Plane_Status: "Ativo",
        registration_date: "N/A",
        rollout_date: "N/A",
        registration_number: "N/A",
        plane_owner: "Particular",
        countryOfOrigin: "N/A",
        plane_series: "N/A",
        engines_count: "---",
        engines_type: "---",
        plane_age: "N/A",
        plane_class: "---",
        delivery_date: "N/A",
        max_range: "---",
        max_speed: "---",
        length: "---",
        wingspan: "---",
        height: "---",
        photo: null
    };

        try {
            const token = await getOpenSkyToken(config);
            if (token) {
                const res = await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const os = await res.json();
                    fullData.model = os.model || fullData.model;
                    fullData.registration_number = os.registration || "N/A";
                    fullData.plane_owner = os.operator || "Particular";
                    fullData.countryOfOrigin = os.owner || "N/A";
                    fullData.plane_series = os.typeShort || "N/A";
                    fullData.plane_age = calculateAge(os.built);
                }
            }
            // Injetar specs técnicas do banco local
            Object.assign(fullData, getTechSpecsByModel(fullData.model));
            needsCacheSave = true;
        } catch (e) {
            warn(`[DETAILS] Erro OpenSky ${icao24}:`, e.message);
        }

    // 3. Busca de Imagem Condicional (O Pulo do Gato)
    if (requiresPhoto && !fullData.hasCheckedPhoto) {
        try {
            // O Planespotters EXIGE um User-Agent, senão bloqueia a requisição (Erro 403)
            const resPhoto = await fetch(`${PLANESPOTTERS_API}${icao24}`, {
                headers: { 'User-Agent': 'TelemetriaApp/1.5' }
            });
            
            if (resPhoto.ok) {
                const ps = await resPhoto.json();
                if (ps.photos?.length > 0) {
                    fullData.photo = ps.photos[0].thumbnail_large.src;
                    fullData.Production_line = ps.photos[0].airline?.name || "N/A";
                }
            }
            fullData.hasCheckedPhoto = true; // Marca que já tentou baixar a foto
            needsCacheSave = true;
        } catch (e) {
            warn(`[DETAILS] Erro Planespotters ${icao24}:`, e.message);
        }
    }

    // Salvar no disco apenas se algo mudou
    if (needsCacheSave) {
        aircraftCache[icao24] = { fullData, fetchedAt: new Date().toISOString() };
        persistCache();
    }

    return fullData;
}

// --- CORE: BUSCA DE AVIÕES PRÓXIMOS ---
async function checkNearbyPlanes(userLocation, config) {
    try {
        const { lat, lon } = userLocation;
        const radiusKm = config?.search?.radius || 50;
        const delta = radiusKm / 111; 
        const lamin = lat - delta, lamax = lat + delta;
        const lomin = lon - delta, lomax = lon + delta;

        const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
        const resp = await fetch(url);
        
        if (!resp.ok) throw new Error(`OpenSky Off: ${resp.status}`);

        const data = await resp.json();
        if (!data.states) return [];

        const planePromises = data.states.map(async (state) => {
            try {
                const [icao24, callsign, country, , , longitude, latitude, baro_alt, , , heading, , , , squawk, spi] = state;

                if (!latitude || !longitude) return null;

                const distance = calculateDistanceKm(lat, lon, latitude, longitude);
                if (distance > radiusKm) return null;

                const type = getAircraftType(callsign);
                
                // CHAMA SEM FOTO: O radar precisa ser rápido! Passamos 'false'
                const details = await getAircraftFullDetails(icao24, config, false);

                return {
                    ...details,
                    callsign: callsign?.trim() || "N/A",
                    country,
                    lat: latitude,
                    lon: longitude,
                    altitude: Math.round(baro_alt || 0),
                    distance: Math.round(distance * 10) / 10,
                    direction: getDirection(lat, lon, latitude, longitude),
                    emergencia: ["7500", "7600", "7700"].includes(squawk) || !!spi,
                    heading: heading || 0,
                    type: type,
                    title: `Voo ${callsign?.trim() || icao24}`,
                    body: `${details.model} • ${Math.round(distance)}km • ${country}`
                };
            } catch (errInner) {
                error("[PLANE_PROCESS] Erro ao processar avião:", errInner.message);
                return null; 
            }
        });

        const results = await Promise.all(planePromises);
        return results
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

    } catch (e) {
        error("[BACKGROUND] Falha na busca:", e.message);
        return [];
    }
}

module.exports = { checkNearbyPlanes, getAircraftFullDetails };