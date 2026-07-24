/* ──────────────────────────────  Widget.js  ─────────────────────────────── */
const api = window.api;

/* ══════════════════════════════  ESTADO  ════════════════════════════════ */
let map           = null;
let mapReady      = false;   // evita gravar config durante o setView inicial
let userMarker    = null;
let config        = {};

const planeMarkers = new Map();
const planeTrails  = new Map();
const planeHistory = new Map();

const MAX_TRAIL_POINTS = 15;

let manualLocationMode = false;
let isFirstUpdate      = true;   // não toca o som no primeiro ciclo
let weatherTimer       = null;

/* ═════════════════════════════  UTILITÁRIOS  ════════════════════════════ */

function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

function toFileUrl(p) {
    return encodeURI("file:///" + String(p).replace(/\\/g, "/").replace(/^\/+/, ""));
}

function debounce(fn, delay) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

/* ═══════════════════════════════  ESTILO  ═══════════════════════════════ */
/* RECONSTRUÍDO — confira contra o applyStyles original */

function applyStyles(cfg) {
    const w = cfg?.widget || {};
    const root = document.documentElement.style;

    root.setProperty("--title-color", w.titlecolor   || "#ffd700");
    root.setProperty("--text-color",  w.textcolor    || "#ffffff");
    root.setProperty("--icon-color",  w.mapiconcolor || "#ffd700");

    // Cor de fundo com transparência aplicada via rgba
    const hex = (w.bgColor || "#1e1e1e").replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const opacity = w.bgOpacity ?? 0.6;

    root.setProperty("--bg-color", `rgba(${r}, ${g}, ${b}, ${opacity})`);

    // As trilhas já desenhadas precisam ser repintadas: o Leaflet grava a cor
    // no atributo `stroke` do SVG, que NÃO resolve var(--icon-color).
    const trailColor = w.mapiconcolor || "#ffd700";
    planeTrails.forEach(trail => trail.setStyle({ color: trailColor }));

    // Ícones são DivIcon com cor inline — força o redesenho
    planeMarkers.forEach((marker) => {
        const el = marker.getElement()?.querySelector(".plane-icon");
        if (el) el.style.color = trailColor;
    });
}

/* ═══════════════════════════════  ÍCONES  ═══════════════════════════════ */
/* RECONSTRUÍDO — o original tinha a mesma estrutura, confira o markup */

function getPlaneIcon(plane) {
    const rotation = plane.heading || 0;
    const color    = cssVar("--icon-color", "#ffd700");

    const faClass = plane.type === "helicoptero"
        ? "fa-helicopter"
        : "fa-plane-up";

    // O <i> interno é o alvo da rotação — atualizado depois via transform,
    // sem recriar o DivIcon (preserva a transição CSS).
    const html = `<div class="plane-icon" style="color:${color}; transform: rotate(${rotation}deg);">
                    <i class="fa-solid ${faClass}"></i>
                  </div>`;

    return L.divIcon({
        html,
        className: "plane-div-icon",
        iconSize:  [18, 18],
        iconAnchor: [9, 9]
    });
}

function getUserIcon() {
    return L.divIcon({
        html: `<div class="user-icon"><i class="fa-solid fa-location-crosshairs"></i></div>`,
        className: "user-div-icon",
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

/* ════════════════════════════════  MAPA  ════════════════════════════════ */

function initMap(cfg) {
    const center = [cfg.map?.lat ?? -16.6809, cfg.map?.lon ?? -49.2539];
    const zoom   = cfg.map?.zoom ?? 13;

    map = L.map("map", {
        zoomControl: false,
        attributionControl: true,   // exigido pela política de tiles do OSM
        preferCanvas: false
    }).setView(center, zoom);

    map.attributionControl.setPrefix("");

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap"
    }).addTo(map);

    // Marcador da base do radar (config.home), não do centro da viewport
    const home = [cfg.home?.lat ?? center[0], cfg.home?.lon ?? center[1]];
    userMarker = L.marker(home, { icon: getUserIcon(), interactive: false }).addTo(map);

    const saveViewport = debounce(() => {
        if (!mapReady) return;
        const c = map.getCenter();
        api.send("save-map-config", { lat: c.lat, lon: c.lng, zoom: map.getZoom() });
    }, 900);

    map.on("moveend", saveViewport);
    map.on("zoomend", saveViewport);

    map.on("click", e => {
        if (!manualLocationMode) return;
        manualLocationMode = false;
        map.getContainer().style.cursor = "";
        resetLocButton();

        const { lat, lng } = e.latlng;
        userMarker.setLatLng([lat, lng]);
        api.send("manual-location-changed", { lat, lon: lng });
        fetchWeather(lat, lng);
    });

    // Libera a gravação só depois do primeiro render
    setTimeout(() => { mapReady = true; }, 1200);
}

/* ════════════════════════════════  CLIMA  ═══════════════════════════════ */
/* RECONSTRUÍDO — confira o endpoint e os campos contra o fetchWeather original */

async function fetchWeather(lat, lon) {
    const el = document.getElementById("weather");
    if (!el) return;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
              + `&current=temperature_2m,relative_humidity_2m,wind_speed_10m`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const c = data.current || {};

        el.textContent = "";
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-cloud-sun";
        el.appendChild(icon);
        el.appendChild(document.createTextNode(
            ` ${Math.round(c.temperature_2m)}°C · ${c.relative_humidity_2m}% · ${Math.round(c.wind_speed_10m)} km/h`
        ));
    } catch (err) {
        console.warn("[WEATHER] Falha:", err.message);
        el.textContent = "Clima indisponível";
    }
}

/* ══════════════════════════════  AERONAVES  ═════════════════════════════ */

api.on("update-planes", (planes) => {
    if (!map) return;

    const currentIcaos = new Set(planes.map(p => p.icao24));
    let hasNewPlane = false;

    // 1. Remover aeronaves que saíram do radar
    for (const [icao, marker] of planeMarkers) {
        if (currentIcaos.has(icao)) continue;
        map.removeLayer(marker);
        planeMarkers.delete(icao);

        const trail = planeTrails.get(icao);
        if (trail) {
            map.removeLayer(trail);
            planeTrails.delete(icao);
        }
        planeHistory.delete(icao);
    }

    const trailColor = cssVar("--icon-color", "#ffd700");

    // 2. Atualizar ou adicionar
    planes.forEach(plane => {
        const coords = [plane.lat, plane.lon];

        if (!planeHistory.has(plane.icao24)) planeHistory.set(plane.icao24, []);
        const history = planeHistory.get(plane.icao24);
        history.push(coords);
        if (history.length > MAX_TRAIL_POINTS) history.shift();

        if (planeMarkers.has(plane.icao24)) {
            const marker = planeMarkers.get(plane.icao24);
            marker.setLatLng(coords);

            // Rotaciona o nó existente — não recria o DivIcon, preservando
            // a transição CSS e evitando churn de DOM a cada 30s.
            const el = marker.getElement()?.querySelector(".plane-icon");
            if (el) el.style.transform = `rotate(${plane.heading || 0}deg)`;
            else marker.setIcon(getPlaneIcon(plane));

        } else {
            const marker = L.marker(coords, { icon: getPlaneIcon(plane) }).addTo(map);

            // Popup montado por DOM: callsign e model vêm de API externa
            marker.bindPopup(() => {
                const div = document.createElement("div");
                const b = document.createElement("b");
                b.textContent = plane.callsign;
                div.appendChild(b);
                div.appendChild(document.createElement("br"));
                div.appendChild(document.createTextNode(plane.model || ""));
                return div;
            });

            planeMarkers.set(plane.icao24, marker);
            hasNewPlane = true;
        }

        if (planeTrails.has(plane.icao24)) {
            planeTrails.get(plane.icao24).setLatLngs(history);
        } else {
            // Cor resolvida em JS: o atributo `stroke` do SVG não aceita var()
            const trail = L.polyline(history, {
                color: trailColor,
                weight: 2,
                opacity: 0.5,
                dashArray: "5, 10"
            }).addTo(map);
            planeTrails.set(plane.icao24, trail);
        }
    });

    // 3. Som — uma vez por ciclo, e nunca no primeiro carregamento
    if (hasNewPlane && !isFirstUpdate) {
        const audio = document.getElementById("notifysound");
        if (audio?.src) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }
    isFirstUpdate = false;

    updatePlaneListUI(planes);
});

/* ═════════════════════════════  LISTA (DOM)  ════════════════════════════ */

function updatePlaneListUI(planes) {
    const listContainer = document.getElementById("list");
    listContainer.textContent = "";

    const header = document.createElement("b");
    header.textContent = "Aviões mais próximos:";
    listContainer.appendChild(header);

    if (!planes.length) {
        const empty = document.createElement("div");
        empty.className = "empty-msg";
        empty.textContent = "Céu limpo na região...";
        listContainer.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();

    planes.forEach((p, i) => {
        const item = document.createElement("div");
        item.className = "plane-item" + (p.emergencia ? " alert-blink" : "");
        item.dataset.icao = p.icao24;   // sem onclick inline: bloqueado pela CSP

        const info = document.createElement("div");
        info.className = "plane-info";

        const title = document.createElement("strong");
        title.textContent = `${i + 1}. ${p.callsign}`;
        info.appendChild(title);

        if (p.squawk) {
            const badge = document.createElement("span");
            badge.className = "badge";
            badge.textContent = `SQ ${p.squawk}`;
            info.appendChild(badge);
        }

        const model = document.createElement("span");
        model.textContent = p.model;   // texto, nunca markup
        info.appendChild(model);

        const meta = document.createElement("div");
        meta.className = "plane-meta";
        meta.textContent = `${p.distance} km • ${p.altitude} m • ${p.direction}`;

        item.append(info, meta);
        frag.appendChild(item);
    });

    listContainer.appendChild(frag);
}

// Delegação: um listener para a lista inteira, sobrevive à reconstrução
document.getElementById("list").addEventListener("click", (e) => {
    const item = e.target.closest(".plane-item");
    if (item?.dataset.icao) api.send("open-details-window", item.dataset.icao);
});

/* ═══════════════════════════════  BOTÕES  ═══════════════════════════════ */

function resetLocButton() {
    const btn = document.getElementById("setloc-btn");
    if (btn) btn.textContent = "Alterar Localização";
}

document.getElementById("setloc-btn").addEventListener("click", () => {
    manualLocationMode = true;
    map.getContainer().style.cursor = "crosshair";
    // `alert()` bloquearia o processo e trava o widget: feedback no próprio botão
    document.getElementById("setloc-btn").textContent = "Clique no mapa...";
    setTimeout(() => {
        if (manualLocationMode) {
            manualLocationMode = false;
            map.getContainer().style.cursor = "";
            resetLocButton();
        }
    }, 8000);
});

document.getElementById("zoomin").addEventListener("click",  () => map.zoomIn());
document.getElementById("zoomout").addEventListener("click", () => map.zoomOut());

document.getElementById("settingsbtn").addEventListener("click", () => api.send("open-settings"));
document.getElementById("minbtn").addEventListener("click",      () => api.send("minimize-to-bubble"));
document.getElementById("closebtn").addEventListener("click",    () => api.send("quit-app"));

/* ═════════════════════════════  ATALHOS  ════════════════════════════════ */

api.on("shortcut-zoomin",  () => map?.zoomIn());
api.on("shortcut-zoomout", () => map?.zoomOut());
api.on("apply-style",      (cfg) => applyStyles(cfg));

/* ════════════════════════════  INICIALIZAÇÃO  ═══════════════════════════ */

(async function bootstrap() {
    try {
        config = await api.invoke("get-config");
        applyStyles(config);
        initMap(config);

        const home = {
            lat: config.home?.lat ?? config.map?.lat,
            lon: config.home?.lon ?? config.map?.lon
        };
        fetchWeather(home.lat, home.lon);

        // Clima só era buscado no boot: depois de 8h a temperatura exibida
        // era a do café da manhã. Atualiza a cada 15 minutos.
        weatherTimer = setInterval(() => fetchWeather(home.lat, home.lon), 15 * 60 * 1000);

        // Som de alerta: caminho resolvido via IPC (fora do asar).
        // Tenta a pasta embutida e cai para a do usuário se não existir.
        const paths = await api.invoke("get-paths");
        const file  = config.alert?.general || "notificacao.mp3";
        const audio = document.getElementById("notifysound");

        audio.src = toFileUrl(`${paths.builtinSounds}/${file}`);
        audio.addEventListener("error", () => {
            const fallback = toFileUrl(`${paths.userSounds}/${file}`);
            if (audio.src !== fallback) audio.src = fallback;
        }, { once: true });

    } catch (err) {
        console.error("[WIDGET] Falha na inicialização:", err);
    }
})();

window.addEventListener("beforeunload", () => {
    if (weatherTimer) clearInterval(weatherTimer);
});