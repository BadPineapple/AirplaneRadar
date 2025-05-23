
  const { ipcRenderer, remote } = require('electron');

  let userLat, userLon, initialZoom = 13;
  let map, userMarker, planeMarkers = [];
  let planeHistory = {}; // histórico de coordenadas por icao
  let planeTrails = {};  // polylines desenhadas no mapa
  let lastSeenIcao = [];
  let manualLocation = false;

  ipcRenderer.invoke('get-config').then(cfg => {
    if (cfg && cfg.map) {
      userLat = cfg.map.lat;
      userLon = cfg.map.lon;
      initialZoom = cfg.map.zoom || 13;
    } else {
      userLat = -16.6809;
      userLon = -49.2539;
      initialZoom = 13;
    }
    startMap();
    fetchWeather(userLat, userLon);
  });

  function startMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([userLat, userLon], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      minZoom: 6
    }).addTo(map);

    userMarker = L.marker([userLat, userLon], {
      title: 'Você',
      icon: getPinIcon()
    }).addTo(map)
      .bindPopup('<span class="voce">Você</span>');

    map.on('moveend', saveMapConfig);
    map.on('zoomend', saveMapConfig);

    document.getElementById('zoomin').onclick = () => map.setZoom(map.getZoom() + 1);
    document.getElementById('zoomout').onclick = () => map.setZoom(map.getZoom() - 1);
  }

  function saveMapConfig() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    ipcRenderer.send('save-map-config', {
      lat: center.lat,
      lon: center.lng,
      zoom: zoom
    });
  }

  function getPinIcon() {
    return L.divIcon({
      html: `<i class="fa-solid fa-map-pin" style="font-size: 24px; color: #3cf; text-shadow:0 2px 5px #0008"></i>`,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -18]
    });
  }

  function getPlaneIcon(plane) {
    let iconClass = 'fa-solid fa-plane';
    if (plane.callsign && plane.callsign.startsWith('CARG')) iconClass = 'fa-solid fa-plane-departure';
    if (plane.callsign && plane.callsign.startsWith('HEL')) iconClass = 'fa-solid fa-helicopter';

    let rotation = Number.isFinite(plane.heading) ? plane.heading : 0;
    return L.divIcon({
      html: `<i class="${iconClass}" style="font-size:22px;color:#FFD700;filter:drop-shadow(0 0 2px #222);transform:rotate(${rotation}deg);"></i>`,
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12]
    });
  }

  document.getElementById('setloc-btn').onclick = () => {
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
      ipcRenderer.send('manual-location-changed', {lat: userLat, lon: userLon});
    }
  }

  function setupMapClickEvent() {
    if (map) map.on('click', setManualLocation);
    else setTimeout(setupMapClickEvent, 100);
  }
  setupMapClickEvent();

  document.getElementById('closebtn').onclick = () => ipcRenderer.send('quit-app');
  document.getElementById('minbtn').onclick = () => ipcRenderer.send('minimize-to-bubble');

  ipcRenderer.on('shortcut-zoomin', () => map.setZoom(map.getZoom() + 1));
  ipcRenderer.on('shortcut-zoomout', () => map.setZoom(map.getZoom() - 1));
  ipcRenderer.on('shortcut-refresh-now', () => ipcRenderer.send('force-refresh'));
  ipcRenderer.on('shortcut-minimize-to-bubble', () => ipcRenderer.send('minimize-to-bubble'));
  ipcRenderer.on('shortcut-restore-from-bubble', () => ipcRenderer.send('restore-from-bubble'));

  function updatePlanes(planes) {
    const currentIcao = planes.map(p => p.icao24);
    const newPlanes = currentIcao.filter(id => !lastSeenIcao.includes(id));

    if (newPlanes.length > 0 && lastSeenIcao.length > 0) {
      document.getElementById('notifysound').play();
    }
    lastSeenIcao = currentIcao;

    // Limpa histórico de aviões que sumiram
    Object.keys(planeHistory).forEach(icao => {
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

    planeMarkers.forEach(m => map.removeLayer(m));
    Object.values(planeTrails).forEach(t => map.removeLayer(t));
    planeMarkers = [];
    planeTrails = {};

    planes.forEach(plane => {
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
          color: '#ffd700',
          weight: 1.5,
          opacity: 0.6,
          dashArray: '3, 4',
        }).addTo(map);
        planeTrails[plane.icao24] = trail;

        const marker = L.marker(coords, {
          title: plane.title,
          icon: getPlaneIcon(plane)
        }).addTo(map)
          .bindPopup(`<b>${plane.title}</b><br>${plane.body}`);
        planeMarkers.push(marker);
      }
    });

    let listHtml = '<b>Aviões mais próximos:</b>';
    if (planes.length === 0) {
      listHtml += '<div class="plane">Nenhum avião encontrado na sua região agora.</div>';
    } else {
      planes.forEach((p, i) => {
        listHtml += `<div class="plane"><b>${i+1}.</b> ${p.title}<br><small>${p.body}</small></div>`;
      });
    }
    document.getElementById('list').innerHTML = listHtml;
  }

  ipcRenderer.on('update-planes', (event, planes) => updatePlanes(planes));
  ipcRenderer.on('request-current-location', () => {
    ipcRenderer.send('manual-location-changed', {lat: userLat, lon: userLon});
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

      document.getElementById("weather").innerHTML =
        `<i class="fa-solid ${icon}" style="color: #FFD700"></i> ${temp}°C &nbsp;<span style="color:#fff;">|</span>&nbsp; Vento ${wind}km/h`;
    } catch {
      document.getElementById("weather").innerHTML =
        `<i class="fa-solid fa-cloud-sun" style="color: #FFD700"></i> Clima indisponível`;
    }
  }
