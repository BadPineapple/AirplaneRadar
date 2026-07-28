/* ──────────────────────────────  Background.js  ─────────────────────────── */
const fs    = require("fs");
const PATHS = require("./Paths");
const { getOpenSkyToken } = require("./OpenSkyAuth");
const { log, warn, error } = require("./Logger");

const cacheFile = PATHS.cache;
const PLANESPOTTERS_API = "https://api.planespotters.net/pub/photos/hex/";
const OPENSKY_STATES    = "https://opensky-network.org/api/states/all";
// A OpenSky desativou o endpoint /api/metadata/aircraft/icao/ (retorna 410 Gone).
// Metadados de aeronave (modelo/registro/operador) agora vêm de APIs públicas alternativas.
const ADSBDB_METADATA = "https://api.adsbdb.com/v0/aircraft/";
const HEXDB_METADATA  = "https://hexdb.io/api/v1/aircraft/";
// Rota (origem/destino) por callsign — mesma dupla de fontes, sem autenticação.
const ADSBDB_CALLSIGN = "https://api.adsbdb.com/v0/callsign/";
const HEXDB_ROUTE     = "https://hexdb.io/api/v1/route/icao/";
const fetch = globalThis.fetch;

const DEFAULT_MAX_RESULTS = 5;
const MIN_MAX_RESULTS     = 1;
const MAX_MAX_RESULTS     = 20;
const FETCH_TIMEOUT       = 8000;

// Banco técnico — resolvido via Paths (repo em dev, resourcesPath em produção)
let aircraftDatabase = {};
try {
    aircraftDatabase = JSON.parse(fs.readFileSync(PATHS.techData, "utf8"));
} catch (e) {
    error("[TECH] Falha ao carregar TechnicalData.json:", e.message);
}

/* ─────────────────────────────  CACHE  ─────────────────────────────────── */
const CACHE_TTL      = 24 * 60 * 60 * 1000;
const CACHE_MAX_KEYS = 2000;

let aircraftCache = {};
let cacheDirty    = false;
let cacheChain    = Promise.resolve();

try {
    if (fs.existsSync(cacheFile)) {
        aircraftCache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        pruneCache();
    }
} catch (e) {
    warn("[CACHE] Cache inválido, iniciando vazio.");
    aircraftCache = {};
}

function pruneCache() {
    const now = Date.now();
    let entries = Object.entries(aircraftCache)
        .filter(([, v]) => v?.fetchedAt && (now - new Date(v.fetchedAt).getTime()) < CACHE_TTL);

    if (entries.length > CACHE_MAX_KEYS) {
        entries.sort((a, b) => new Date(b[1].fetchedAt) - new Date(a[1].fetchedAt));
        entries = entries.slice(0, CACHE_MAX_KEYS);
    }

    const before = Object.keys(aircraftCache).length;
    aircraftCache = Object.fromEntries(entries);
    if (before !== entries.length) log(`[CACHE] Purga: ${before} -> ${entries.length}`);
}

function persistCache() {
    if (!cacheDirty) return cacheChain;
    cacheDirty = false;

    const snapshot = JSON.stringify(aircraftCache);
    cacheChain = cacheChain.then(async () => {
        const tmp = `${cacheFile}.tmp`;
        try {
            await fs.promises.writeFile(tmp, snapshot, "utf8");
            await fs.promises.rename(tmp, cacheFile);
        } catch (e) {
            error("[CACHE] Falha ao persistir:", e.message);
            try { await fs.promises.unlink(tmp); } catch {}
        }
    });
    return cacheChain;
}

function persistCacheSync() {
    if (!cacheDirty) return;
    try {
        const tmp = `${cacheFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(aircraftCache), "utf8");
        fs.renameSync(tmp, cacheFile);
        cacheDirty = false;
    } catch (e) {
        error("[CACHE] Falha no salvamento final:", e.message);
    }
}

function writeCache(icao24, fullData) {
    aircraftCache[icao24] = { fullData, fetchedAt: new Date().toISOString() };
    cacheDirty = true;
}

/* ───────────────────────────  UTILITÁRIOS  ─────────────────────────────── */
function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

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
    if (deg < 67.5)  return "Nordeste";
    if (deg < 112.5) return "Leste";
    if (deg < 157.5) return "Sudeste";
    if (deg < 202.5) return "Sul";
    if (deg < 247.5) return "Sudoeste";
    if (deg < 292.5) return "Oeste";
    return "Noroeste";
}

/**
 * Heurística de tipo. A regra antiga `cs.startsWith("H")` classificava como
 * helicóptero qualquer callsign iniciado em H — incluindo prefixos húngaros (HA-),
 * suíços (HB-) e a Hawaiian (HAL). Com o filtro do item 3 ativo, isso ESCONDIA
 * voos comerciais legítimos da lista.
 */
function getAircraftType(callsign) {
    const cs = (callsign || "").trim().toUpperCase();
    if (!cs) return "outros";

    if (/^(FAB|RCH|CFC|ASY|BRS|AF[0-9]|MIL)/.test(cs)) return "militar";
    if (/^(PP|PR|PS|PT|PU|N[0-9])/.test(cs) && cs.length <= 6) return "privado";
    if (/^(HEL|LIF|RESC|SAMU)/.test(cs)) return "helicoptero";
    if (/^[A-Z]{3}[0-9]{1,4}$/.test(cs)) return "comercial";
    if (cs.length <= 4) return "privado";
    return "comercial";
}

function getTechSpecsByModel(model) {
    if (!model || model === "Desconhecido") return {};
    const key = String(model).trim().toUpperCase();

    let entry = aircraftDatabase[key];
    if (!entry) {
        const found = Object.keys(aircraftDatabase)
            .find(k => key.includes(k.toUpperCase()) || k.toUpperCase().includes(key));
        if (found) entry = aircraftDatabase[found];
    }
    return entry || {};
}

/* ────────────────────  DETALHES DE UMA AERONAVE  ───────────────────────── */
function baseData(icao24) {
    return {
        model: "Desconhecido",
        icaoCode: icao24.toUpperCase(),
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
        photo: null,
        hasCheckedPhoto: false
    };
}

async function fetchPhoto(icao24, target) {
    try {
        // Planespotters agora exige uma URL/e-mail de contato no User-Agent
        // (formato "Nome/versão (+contato)"); sem isso, responde 403.
        const res = await fetchWithTimeout(`${PLANESPOTTERS_API}${icao24}`, {
            headers: { "User-Agent": "AirplaneRadarWidget/1.4 (+https://github.com/BadPineapple/AirplaneRadar)" }
        });
        if (res.ok) {
            const ps = await res.json();
            if (ps.photos?.length > 0) {
                target.photo = ps.photos[0].thumbnail_large?.src || null;
                target.Production_line = ps.photos[0].airline?.name || target.Production_line;
            }
        }
        target.hasCheckedPhoto = true;
        return true;
    } catch (e) {
        warn(`[PHOTO] Falha para ${icao24}:`, e.message);
        return false;
    }
}

/**
 * Metadados (modelo, registro, operador, país) via APIs públicas sem chave.
 * adsbdb.com é a fonte principal (dados mais completos, inclui país do
 * proprietário); hexdb.io cobre aeronaves ausentes na primeira (fallback).
 */
async function fetchAircraftMetadata(icao24) {
    try {
        const res = await fetchWithTimeout(`${ADSBDB_METADATA}${icao24}`);
        if (res.ok) {
            const ac = (await res.json())?.response?.aircraft;
            if (ac) {
                return {
                    model:        [ac.manufacturer, ac.type].filter(Boolean).join(" ") || null,
                    typeCode:     ac.icao_type || null,
                    registration: ac.registration || null,
                    owner:        ac.registered_owner || null,
                    country:      ac.registered_owner_country_name || null
                };
            }
        }
    } catch (e) {
        warn(`[DETAILS] adsbdb falhou para ${icao24}:`, e.message);
    }

    try {
        const res = await fetchWithTimeout(`${HEXDB_METADATA}${icao24}`);
        if (res.ok) {
            const json = await res.json();
            if (json?.ModeS) {
                return {
                    model:        [json.Manufacturer, json.Type].filter(Boolean).join(" ") || null,
                    typeCode:     json.ICAOTypeCode || null,
                    registration: json.Registration || null,
                    owner:        json.RegisteredOwners || null,
                    country:      null
                };
            }
        }
    } catch (e) {
        warn(`[DETAILS] hexdb falhou para ${icao24}:`, e.message);
    }

    return null;
}

/**
 * Rota (origem/destino) por callsign de voo. Em memória apenas — diferente
 * do cache de aeronave, não precisa sobreviver a reinícios: é barato refazer
 * e o app já refaz a busca de aviões a cada 30s de qualquer forma.
 */
const ROUTE_CACHE_TTL = 24 * 60 * 60 * 1000;
const routeCache = new Map();

function airportInfo(a) {
    if (!a) return null;
    return {
        icao: a.icao_code || null,
        iata: a.iata_code || null,
        city: a.municipality || null,
        name: a.name || null
    };
}

async function fetchFlightRoute(callsign) {
    const cs = String(callsign || "").trim().toUpperCase();
    if (!cs) return null;

    const cached = routeCache.get(cs);
    if (cached && (Date.now() - cached.fetchedAt) < ROUTE_CACHE_TTL) return cached.data;

    let route = null;
    try {
        const res = await fetchWithTimeout(`${ADSBDB_CALLSIGN}${cs}`);
        if (res.ok) {
            const fr = (await res.json())?.response?.flightroute;
            if (fr) route = { origin: airportInfo(fr.origin), destination: airportInfo(fr.destination) };
        }
    } catch (e) {
        warn(`[ROUTE] adsbdb falhou para ${cs}:`, e.message);
    }

    if (!route) {
        try {
            const res = await fetchWithTimeout(`${HEXDB_ROUTE}${cs}`);
            if (res.ok) {
                const json = await res.json();
                const [from, to] = String(json?.route || "").split("-");
                if (from && to) {
                    route = {
                        origin:      { icao: from, iata: null, city: null, name: null },
                        destination: { icao: to,   iata: null, city: null, name: null }
                    };
                }
            }
        } catch (e) {
            warn(`[ROUTE] hexdb falhou para ${cs}:`, e.message);
        }
    }

    routeCache.set(cs, { data: route, fetchedAt: Date.now() });
    return route;
}

async function withRoute(data, callsign) {
    if (!callsign || !data) return data;
    const route = await fetchFlightRoute(callsign);
    return route ? { ...data, route } : data;
}

async function getAircraftFullDetails(icao24, config, requiresPhoto = false, callsign = null) {
    icao24 = String(icao24 || "").trim().toLowerCase();
    if (!icao24) return null;

    const entry = aircraftCache[icao24];
    const fresh = entry && (Date.now() - new Date(entry.fetchedAt).getTime() < CACHE_TTL);

    /* BUG CORRIGIDO: o cache hit retornava ANTES de avaliar requiresPhoto.
       Como o radar popula o cache com `false` a cada 30s, ao abrir os detalhes
       (`true`) a entrada já existia e o Planespotters NUNCA era chamado —
       a foto ficava eternamente em "SEM IMAGEM REGISTRADA".
       Agora, no cache hit sem foto verificada, buscamos SÓ a foto. */
    if (fresh) {
        const cached = entry.fullData;
        if (!requiresPhoto || cached.hasCheckedPhoto) return withRoute(cached, callsign);

        if (await fetchPhoto(icao24, cached)) {
            writeCache(icao24, cached);
            persistCache();
        }
        return withRoute(cached, callsign);
    }

    const fullData = baseData(icao24);
    let changed = false;
    let typeCode = null;

    try {
        const meta = await fetchAircraftMetadata(icao24);
        if (meta) {
            fullData.model               = meta.model || fullData.model;
            fullData.registration_number = meta.registration || "N/A";
            fullData.plane_owner         = meta.owner || "Particular";
            fullData.countryOfOrigin     = meta.country || "N/A";
            fullData.plane_series        = meta.typeCode || "N/A";
            typeCode = meta.typeCode;
        }
        changed = true;   // cacheia o resultado (ou a ausência dele) por 24h
    } catch (e) {
        warn(`[DETAILS] Erro ao buscar metadados ${icao24}:`, e.message);
    }

    Object.assign(fullData, getTechSpecsByModel(typeCode || fullData.model));

    if (requiresPhoto) {
        if (await fetchPhoto(icao24, fullData)) changed = true;
    }

    if (changed) writeCache(icao24, fullData);
    return withRoute(fullData, callsign);
}

/* ───────────────────  CORE: BUSCA DE AVIÕES PRÓXIMOS  ──────────────────── */
async function checkNearbyPlanes(userLocation, config) {
    try {
        const { lat, lon } = userLocation;
        const radiusKm = config?.search?.radius || 50;
        const maxResults = Math.min(
            MAX_MAX_RESULTS,
            Math.max(MIN_MAX_RESULTS, config?.search?.maxResults || DEFAULT_MAX_RESULTS)
        );
        const favorites = new Set(config?.favorites || []);

        /* BBOX CORRIGIDO: a versão antiga usava radius/111 também na longitude.
           Um grau de longitude encolhe com cos(lat) — em Goiânia (-16.7°) a caixa
           saía ~4% estreita; no Rio (-22.9°), ~8%. Aeronaves a leste/oeste
           dentro do raio simplesmente não apareciam. */
        const deltaLat = radiusKm / 111;
        const cosLat   = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
        const deltaLon = radiusKm / (111 * cosLat);

        const params = new URLSearchParams({
            lamin: lat - deltaLat, lamax: lat + deltaLat,
            lomin: lon - deltaLon, lomax: lon + deltaLon
        });

        // Requisição autenticada quando possível: eleva a quota diária da OpenSky
        // de 400 para 4000 créditos e reduz o intervalo mínimo entre chamadas.
        const token = await getOpenSkyToken(config);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const resp = await fetchWithTimeout(`${OPENSKY_STATES}?${params}`, { headers });
        if (!resp.ok) throw new Error(`OpenSky respondeu ${resp.status}`);

        const data = await resp.json();
        if (!Array.isArray(data.states)) return [];

        /* ETAPA 1 — Triagem local, ZERO rede.
           Distância e tipo saem do próprio state vector. */
        const allowed = config?.search?.filters;
        const hasFilter = Array.isArray(allowed) && allowed.length > 0;
        const seen = new Set();
        const candidates = [];

        for (const state of data.states) {
            const [icao24, callsign, country, , , longitude, latitude,
                   baro_alt, on_ground, velocity, heading, , , , squawk, spi] = state;

            if (!icao24 || latitude == null || longitude == null) continue;

            const id = String(icao24).trim().toLowerCase();
            if (seen.has(id)) continue;
            seen.add(id);

            const distance = calculateDistanceKm(lat, lon, latitude, longitude);
            if (distance > radiusKm) continue;

            const type = getAircraftType(callsign);
            if (hasFilter && !allowed.includes(type)) continue;

            candidates.push({
                icao24: id, callsign, country, latitude, longitude,
                baro_alt, on_ground, velocity, heading, squawk, spi, distance, type,
                favorite: favorites.has(id)
            });
        }

        /* ETAPA 2 — Ordena e CORTA antes de qualquer I/O.
           Favoritas sempre primeiro; dentro de cada grupo, as mais próximas.
           Só os finalistas (limite configurável) geram requisição. */
        candidates.sort((a, b) => (b.favorite - a.favorite) || (a.distance - b.distance));
        const finalists = candidates.slice(0, maxResults);

        log(`[RADAR] ${data.states.length} no bbox -> ${candidates.length} no raio -> ${finalists.length} detalhados`);

        /* ETAPA 3 — Detalhes apenas dos finalistas (sem foto: o radar é rápido) */
        const results = await Promise.all(finalists.map(async c => {
            let details;
            try {
                details = await getAircraftFullDetails(c.icao24, config, false, c.callsign);
            } catch (e) {
                warn("[RADAR] Detalhe indisponível para", c.icao24);
            }
            if (!details) details = baseData(c.icao24);

            return {
                ...details,
                icao24: c.icao24,
                callsign: c.callsign?.trim() || "N/A",
                country: c.country,
                lat: c.latitude,
                lon: c.longitude,
                altitude: Math.round(c.baro_alt || 0),
                speed: c.velocity ? Math.round(c.velocity * 3.6) : null,
                onGround: !!c.on_ground,
                distance: Math.round(c.distance * 10) / 10,
                direction: getDirection(lat, lon, c.latitude, c.longitude),
                emergencia: ["7500", "7600", "7700"].includes(c.squawk) || !!c.spi,
                squawk: c.squawk || null,
                heading: c.heading || 0,
                type: c.type,
                favorite: c.favorite,
                title: `Voo ${c.callsign?.trim() || c.icao24}`,
                body: `${details.model} • ${Math.round(c.distance)}km • ${c.country}`
            };
        }));

        persistCache();   // uma única gravação por ciclo, não uma por aeronave
        return results;

    } catch (e) {
        error("[RADAR] Falha na busca:", e.message);
        return [];
    }
}

module.exports = { 
    checkNearbyPlanes, 
    getAircraftFullDetails, 
    persistCache,
    persistCacheSync 
};