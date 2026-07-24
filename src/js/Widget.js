const api = window.api;

// Estado Global do Widget
let map, userMarker;
let planeMarkers = new Map();
let planeHistory = new Map(); 
let planeTrails  = new Map();
let userLat, userLon;
let manualLocationMode = false;

api.on("update-planes", (planes) => { ... });
api.on("apply-style", (style) => applyStyles(style));

/* ---------- Inicialização e Configuração ---------------------------------- */

api.invoke("get-config").then((config) => {
    applyStyles(config);
    
    userLat = config.map?.lat ?? -16.6809;
    userLon = config.map?.lon ?? -49.2539;
    
    initMap(userLat, userLon, config.map?.zoom || 13);
    fetchWeather(userLat, userLon);
});

api.invoke("get-paths").then(paths => {
        const file = config.alert?.general || "notificacao.mp3";
        const audio = document.getElementById("notifysound");
        audio.src = `file://${paths.builtinSounds.replace(/\\/g, "/")}/${file}`;
    });

function applyStyles(config) {
    const root = document.documentElement;
    const widget = config.widget || {};
    
    // Converte Hex + Opacidade para RGBA
    const r = parseInt(widget.bgColor?.slice(1, 3) || "1e", 16);
    const g = parseInt(widget.bgColor?.slice(3, 5) || "1e", 16);
    const b = parseInt(widget.bgColor?.slice(5, 7) || "1e", 16);
    
    const container = document.getElementById("container");
    container.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${widget.bgOpacity ?? 0.7})`;
    
    root.style.setProperty("--icon-color", widget.mapiconcolor || "#ffd700");
    root.style.setProperty("--title-color", widget.titlecolor || "#ffd700");
    root.style.setProperty("--text-color", widget.textcolor || "#ffffff");
}

api.on("apply-style", (e, style) => applyStyles(style));

/* ---------- Gestão do Mapa (Leaflet) -------------------------------------- */

function initMap(lat, lon, zoom) {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([lat, lon], zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        minZoom: 4,
    }).addTo(map);

    userMarker = L.marker([lat, lon], { icon: getPinIcon() }).addTo(map);

    map.on("moveend", syncMapConfig);
    map.on("zoomend", syncMapConfig);
    
    // Click para definir localização manual
    map.on("click", (e) => {
        if (!manualLocationMode) return;
        
        userLat = e.latlng.lat;
        userLon = e.latlng.lng;
        userMarker.setLatLng(e.latlng);
        map.panTo(e.latlng);
        
        manualLocationMode = false;
        map.getContainer().style.cursor = "";
        
        api.send("manual-location-changed", { lat: userLat, lon: userLon });
        fetchWeather(userLat, userLon);
    });
}

function syncMapConfig() {
    const center = map.getCenter();
    api.send("save-map-config", {
        lat: center.lat,
        lon: center.lng,
        zoom: map.getZoom(),
    });
}

/* ---------- Lógica dos Aviões (O Coração do Widget) ----------------------- */

api.on("update-planes", (event, planes) => {
    const currentIcaos = new Set(planes.map(p => p.icao24));
    let hasNewPlane = false;

    // 1. Remover aviões que sumiram do radar
    for (let [icao, marker] of planeMarkers) {
        if (!currentIcaos.has(icao)) {
            map.removeLayer(marker);
            planeMarkers.delete(icao);
            if (planeTrails.has(icao)) {
                map.removeLayer(planeTrails.get(icao));
                planeTrails.delete(icao);
            }
            planeHistory.delete(icao);
        }
    }

    // 2. Atualizar ou Adicionar aviões
    planes.forEach(plane => {
        const coords = [plane.lat, plane.lon];

        // Atualiza histórico para a trilha
        if (!planeHistory.has(plane.icao24)) planeHistory.set(plane.icao24, []);
        let history = planeHistory.get(plane.icao24);
        history.push(coords);
        if (history.length > 15) history.shift();

        // Gerenciar Marcador
        if (planeMarkers.has(plane.icao24)) {
            const marker = planeMarkers.get(plane.icao24);
            marker.setLatLng(coords);

            const el = marker.getElement()?.querySelector("div");
            if (el) el.style.transform = `rotate(${plane.heading || 0}deg)`;
            else marker.setIcon(getPlaneIcon(plane));
        } else {
            const marker = L.marker(coords, { icon: getPlaneIcon(plane) })
                .bindPopup(`<b>${plane.callsign}</b><br>${plane.model}`)
                .addTo(map);
            planeMarkers.set(plane.icao24, marker);
            hasNewPlane = true;
        }

        // Gerenciar Trilha (Polyline)
        if (planeTrails.has(plane.icao24)) {
            planeTrails.get(plane.icao24).setLatLngs(history);
        } else {
            const trail = L.polyline(history, {
                color: "var(--icon-color)",
                weight: 2,
                opacity: 0.5,
                dashArray: "5, 10"
            }).addTo(map);
            planeTrails.set(plane.icao24, trail);
        }
    });

    if (hasNewPlane) {
        const audio = document.getElementById("notifysound");
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }

    updatePlaneListUI(planes);
});

function updatePlaneListUI(planes) {
    const listContainer = document.getElementById("list");
    if (planes.length === 0) {
        listContainer.innerHTML = `<div class="empty-msg">Céu limpo na região...</div>`;
        return;
    }

    let html = planes.map((p, i) => {
        const emergencyClass = p.emergencia ? 'alert-blink' : '';
        const squawkLabel = p.squawk ? `<span class="badge">SQ ${p.squawk}</span>` : '';

        return `
            <div class="plane-item ${emergencyClass}" onclick="showPlaneDetails('${p.icao24}')">
                <div class="plane-info">
                    <strong>${i+1}. ${p.callsign}</strong> ${squawkLabel}
                    <span>${p.model}</span>
                </div>
                <div class="plane-meta">
                    ${p.distance} km • ${p.altitude} m • ${p.direction}
                </div>
            </div>
        `;
    }).join("");

    listContainer.innerHTML = html;

    window.lastPlanesData = planes;
}

function updatePlaneListUI(planes) {
    const listContainer = document.getElementById("list");
    listContainer.textContent = "";

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
        item.dataset.icao = p.icao24;                 // sem onclick inline (bloqueado por CSP)

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
        model.textContent = p.model;                  // texto, nunca markup
        info.appendChild(model);

        const meta = document.createElement("div");
        meta.className = "plane-meta";
        meta.textContent = `${p.distance} km • ${p.altitude} m • ${p.direction}`;

        item.append(info, meta);
        frag.appendChild(item);
    });

    listContainer.appendChild(frag);
}

// Delegação de evento — um listener para a lista inteira, sobrevive à reconstrução
document.getElementById("list").addEventListener("click", (e) => {
    const item = e.target.closest(".plane-item");
    if (item?.dataset.icao) api.send("open-details-window", item.dataset.icao);
});


/* ---------- Ícones e Auxiliares ------------------------------------------- */

function getPlaneIcon(plane) {
    const rotation = plane.heading || 0;
    const iconType = plane.type === 'helicoptero' ? 'fa-helicopter' : 'fa-plane';
    
    return L.divIcon({
        html: `<div style="transform: rotate(${rotation}deg); transition: all 0.5s;">
                <i class="fa-solid ${iconType}" style="color: var(--icon-color); font-size: 20px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));"></i>
               </div>`,
        className: 'plane-div-icon',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

function getPinIcon() {
    return L.divIcon({
        html: `<i class="fa-solid fa-location-crosshairs" style="color: #3498db; font-size: 22px;"></i>`,
        className: 'user-pin-icon',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

/* ---------- Clima (Open-Meteo) ------------------------------------------- */

async function fetchWeather(lat, lon) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await res.json();
        const { temperature, windspeed, weathercode } = data.current_weather;
        
        const weatherEl = document.getElementById("weather");
        weatherEl.innerHTML = `
            <span class="temp">${Math.round(temperature)}°C</span>
            <span class="wind"><i class="fa-solid fa-wind"></i> ${Math.round(windspeed)} km/h</span>
        `;
    } catch (err) {
        console.error("Erro ao buscar clima:", err);
    }
}

/* ---------- Eventos de UI ------------------------------------------------ */

document.getElementById("setloc-btn").onclick = () => {
    manualLocationMode = true;
    map.getContainer().style.cursor = "crosshair";
    alert("Clique no mapa para definir sua nova posição base.");
};

document.getElementById("zoomin").onclick = () => map.zoomIn();
document.getElementById("zoomout").onclick = () => map.zoomOut();
document.getElementById("closebtn").onclick = () => api.send("quit-app");
document.getElementById("minbtn").onclick = () => api.send("minimize-to-bubble");
document.getElementById("settingsbtn").onclick = () => { 
  api.send("open-settings");
};

// Atalhos via Teclado
api.on("shortcut-zoomin", () => map.zoomIn());
api.on("shortcut-zoomout", () => map.zoomOut());