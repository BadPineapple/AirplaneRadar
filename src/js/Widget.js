const { ipcRenderer, remote } = require("electron");

let userLat,
  userLon,
  initialZoom = 13;
let map,
  userMarker,
  planeMarkers   = [];
let planeHistory = {}; // histórico de coordenadas por icao
let planeTrails  = {}; // polylines desenhadas no mapa
let lastSeenIcao = [];
let manualLocation = false;

function hexToRgba(hex, opacity) {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!parsed) return `rgba(30,30,30,${opacity})`; // fallback
  const r = parseInt(parsed[1], 16);
  const g = parseInt(parsed[2], 16);
  const b = parseInt(parsed[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

ipcRenderer.invoke("get-config").then((config) => {
  console.log("[DEBUG] getConfig", config);
  const bgColor      = config.widget?.bgColor || "#1e1e1e";
  const bgopacity    = config.widget?.bgOpacity ?? 0.6;
  const mapiconcolor = config.widget?.mapiconcolor || "#ffd700";
  const titlecolor   = config.widget?.titlecolor || "#ffd700";
  const textcolor    = config.widget?.textcolor || "#ffffff";

  const Background = document.getElementById("container");

  Background.style.background = hexToRgba(bgColor, bgopacity);

  document.body.style.setProperty("--icon-color", mapiconcolor);
  document.body.style.setProperty("--title-color", titlecolor);
  document.body.style.setProperty("--text-color", textcolor);

  userLat     = config.map?.lat ?? -16.6809;
  userLon     = config.map?.lon ?? -49.2539;
  initialZoom = config.map?.zoom ?? 13;
  
  startMap();
  fetchWeather(userLat, userLon);
});

ipcRenderer.on("apply-style", (event, style) => {
  console.log("[DEBUG] Novo estilo recebido:", style);
  const bgColor      = style.widget?.bgColor || "#1e1e1e";
  const bgopacity    = style.widget?.bgOpacity ?? 0.6;
  const mapiconcolor = style.widget?.mapiconcolor || "#ffd700";
  const titlecolor   = style.widget?.titlecolor || "#ffd700";
  const textcolor    = style.widget?.textcolor || "#ffffff";

  const Background = document.getElementById("container");

  Background.style.background = hexToRgba(bgColor, bgopacity);
  document.body.style.setProperty("--icon-color", mapiconcolor);
  document.body.style.setProperty("--title-color", titlecolor);
  document.body.style.setProperty("--text-color", textcolor);
});

function startMap() {
  map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
  }).setView([userLat, userLon], initialZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    minZoom: 6,
  }).addTo(map);

  userMarker = L.marker([userLat, userLon], {
    title: "Você",
    icon: getPinIcon(),
  })
    .addTo(map)
    .bindPopup('<span class="voce">Você</span>');

  map.on("moveend", saveMapConfig);
  map.on("zoomend", saveMapConfig);

  document.getElementById("zoomin").onclick = () =>
    map.setZoom(map.getZoom() + 1);
  document.getElementById("zoomout").onclick = () =>
    map.setZoom(map.getZoom() - 1);
}

function saveMapConfig() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  ipcRenderer.send("save-map-config", {
    lat: center.lat,
    lon: center.lng,
    zoom: zoom,
  });
}

function getPinIcon() {
  return L.divIcon({
    html: `<i class="fa-solid fa-map-pin" style="font-size: 24px; color: #3cf; text-shadow:0 2px 5px #0008"></i>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -18],
  });
}

function getPlaneIcon(plane) {
  let iconClass = "fa-solid fa-plane";
  if (plane.callsign && plane.callsign.startsWith("CARG"))
    iconClass = "fa-solid fa-plane-departure";
  if (plane.callsign && plane.callsign.startsWith("HEL"))
    iconClass = "fa-solid fa-helicopter";

  let rotation = Number.isFinite(plane.heading) ? plane.heading : 0;
  return L.divIcon({
    html: `<i class="${iconClass}" style="font-size:22px;color:var(--icon-color, #ffd700);filter:drop-shadow(0 0 2px #222);transform:rotate(${rotation}deg);"></i>`,
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

document.getElementById("setloc-btn").onclick = () => {
  manualLocation = true;
  map.getContainer().style.cursor = "crosshair";
};

function setManualLocation(e) {
  if (manualLocation) {
    userLat = e.latlng.lat;
    userLon = e.latlng.lng;
    userMarker.setLatLng([userLat, userLon]);
    map.setView([userLat, userLon]);
    manualLocation = false;
    map.getContainer().style.cursor = "";
    fetchWeather(userLat, userLon);
    saveMapConfig();
    ipcRenderer.send("manual-location-changed", { lat: userLat, lon: userLon });
  }
}

function setupMapClickEvent() {
  if (map) map.on("click", setManualLocation);
  else setTimeout(setupMapClickEvent, 100);
}
setupMapClickEvent();

document.getElementById("closebtn").onclick = () =>
  ipcRenderer.send("quit-app");
document.getElementById("minbtn").onclick = () =>
  ipcRenderer.send("minimize-to-bubble");

ipcRenderer.on("shortcut-zoomin", () => map.setZoom(map.getZoom() + 1));
ipcRenderer.on("shortcut-zoomout", () => map.setZoom(map.getZoom() - 1));
ipcRenderer.on("shortcut-refresh-now", () => ipcRenderer.send("force-refresh"));
ipcRenderer.on("shortcut-minimize-to-bubble", () =>
  ipcRenderer.send("minimize-to-bubble")
);
ipcRenderer.on("shortcut-restore-from-bubble", () =>
  ipcRenderer.send("restore-from-bubble")
);

function updatePlanes(planes) {
  const currentIcao = planes.map((p) => p.icao24);
  const newPlanes = currentIcao.filter((id) => !lastSeenIcao.includes(id));

  if (newPlanes.length > 0 && lastSeenIcao.length > 0) {
    document.getElementById("notifysound").play();
  }
  lastSeenIcao = currentIcao;

  // Limpa histórico de aviões que sumiram
  Object.keys(planeHistory).forEach((icao) => {
    if (!currentIcao.includes(icao)) {
      delete planeHistory[icao];
      delete planeTrails[icao];
    }
  });

  if (planes.length > 0 && planes[0].userLat && planes[0].userLon) {
    userLat = planes[0].userLat;
    userLon = planes[0].userLon;
    userMarker.setLatLng([userLat, userLon]);
    map.setView([userLat, userLon], map.getZoom());
    fetchWeather(userLat, userLon);
  }

  planeMarkers.forEach((m) => map.removeLayer(m));
  Object.values(planeTrails).forEach((t) => map.removeLayer(t));
  planeMarkers = [];
  planeTrails = {};

  planes.forEach((plane) => {
    if (plane.lat && plane.lon) {
      const coords = [plane.lat, plane.lon];
      if (!planeHistory[plane.icao24]) {
        planeHistory[plane.icao24] = [];
      }
      planeHistory[plane.icao24].push(coords);
      if (planeHistory[plane.icao24].length > 10) {
        planeHistory[plane.icao24].shift();
      }

      // Desenhar trilha
      const trail = L.polyline(planeHistory[plane.icao24], {
        color: "var(--icon-color, #ffd700)",
        weight: 1.5,
        opacity: 0.6,
        dashArray: "3, 4",
      }).addTo(map);
      planeTrails[plane.icao24] = trail;

      const marker = L.marker(coords, {
        title: plane.title,
        icon: getPlaneIcon(plane),
      })
        .addTo(map)
        .bindPopup(`<b>${plane.title}</b><br>${plane.body}`);
      planeMarkers.push(marker);
    }
  });

  let listHtml = "<b>Aviões mais próximos:</b>";
  if (planes.length === 0) {
    listHtml +=
      '<div class="plane">Nenhum avião encontrado na sua região agora.</div>';
  } else {
    planes.forEach((p, i) => {
      const alerta = (p.emergencia || p.squawk)
        ? `<span class="tooltip-alert">
            ⚠️
            <span class="tooltip-text">${
              p.squawk
                ? `Squawk ${p.squawk} detectado (${
                    {
                      '7500': 'Sequestro',
                      '7600': 'Falha de Comunicação',
                      '7700': 'Emergência Geral',
                    }[p.squawk] || 'Código Especial'
                  })`
                : 'Transponder SPI ativado (emergência ou destaque pelo radar)'
            }</span>
          </span>`
        : '';
      listHtml += `<div class="plane"><b>${i + 1}.</b> ${p.title}${alerta}<br><small>${p.body}</small></div>`;
    });
  }
  document.getElementById("list").innerHTML = listHtml;
}

//ipcRenderer.send("open-settings");
ipcRenderer.on("update-planes", (event, planes) => updatePlanes(planes));
ipcRenderer.on("request-current-location", () => {
  ipcRenderer.send("manual-location-changed", { lat: userLat, lon: userLon });
});

async function fetchWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&forecast_days=1&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.current_weather) throw "Sem dados de clima";
    const temp = Math.round(data.current_weather.temperature);
    const wind = Math.round(data.current_weather.windspeed);
    const code = data.current_weather.weathercode;
    let icon = "fa-sun";
    if (code >= 2 && code < 4) icon = "fa-cloud-sun";
    else if (code === 45 || code === 48) icon = "fa-smog";
    else if (code >= 51 && code <= 67) icon = "fa-cloud-rain";
    else if (code >= 71 && code <= 77) icon = "fa-snowflake";
    else if (code >= 80 && code <= 99) icon = "fa-cloud-showers-heavy";

    document.getElementById(
      "weather"
    ).innerHTML = `<i class="fa-solid ${icon}" style="color:var(--title-color, #ffd700)"></i> ${temp}°C &nbsp;<span style="color:#fff;">|</span>&nbsp; Vento ${wind}km/h`;
  } catch {
    document.getElementById(
      "weather"
    ).innerHTML = `<i class="fa-solid fa-cloud-sun" style="color: var(--title-color, #ffd700)"></i> Clima indisponível`;
  }
}

document.getElementById("settingsbtn").onclick = () => {
  ipcRenderer.send("open-settings");
};
