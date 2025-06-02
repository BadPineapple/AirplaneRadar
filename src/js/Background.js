const fetch = require("node-fetch"); // v2!

// Função para calcular a distância Haversine entre dois pontos
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Função para obter a direção cardinal (não usado no heading do ícone)
function getDirection(lat1, lon1, lat2, lon2) {
  const y =
    Math.sin(((lon2 - lon1) * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  const degrees = (brng + 360) % 360;
  if (degrees < 45 || degrees >= 315) return "Norte";
  if (degrees < 135) return "Leste";
  if (degrees < 225) return "Sul";
  return "Oeste";
}

// Busca aviões próximos (raio ~50 km do centro)
async function checkNearbyPlanes(userLocation, config) {
  try {
    const { lat, lon } = userLocation;
    const radiusKm = config?.search?.radius ?? 50;

    const delta = radiusKm / 111;
    const lamin = lat - delta;
    const lomin = lon - delta;
    const lamax = lat + delta;
    const lomax = lon + delta;

    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }
    const data = await response.json();

    if (!data.states) return [];

    function getAircraftType(plane) {
      const cs = plane[1]?.trim().toUpperCase() || "";
      if (cs.startsWith("AF") || cs.startsWith("FAB") || cs.includes("MIL")) return "militar";
      if (cs.includes("HEL")) return "helicoptero";
      if (cs.includes("PRIV") || cs.includes("EXEC")) return "privado";
      if (cs.includes("B") || cs.includes("A") || cs.includes("VOO")) return "comercial";
      return "outros";
    }

    const allowedTypes = config?.search?.filters || ['comercial', 'privado', 'militar', 'helicoptero', 'outros'];

    // [0] icao24, [1] callsign, [2] origin_country, [3], [4],
    // [5] longitude, [6] latitude, [7] baro_altitude, [8], [9], [10] true_track
    const planes = data.states
      .map((state) => {
        const [
          icao24,
          callsign,
          origin_country,
          ,
          ,
          longitude,
          latitude,
          baro_altitude,
          ,
          ,
          true_track, // heading em graus
        ] = state;

        if (latitude === null || longitude === null) return null;

        const distance = calculateDistanceKm(lat, lon, latitude, longitude);
        if (distance > radiusKm) return null;

        const direction = getDirection(lat, lon, latitude, longitude);
        const type = getAircraftType(state);
        
        if (!allowedTypes.includes(type)) return null;

        return {
          icao24,
          callsign: callsign ? callsign.trim() : "Desconhecido",
          origin_country,
          lat: latitude,
          lon: longitude,
          altitude: Math.round(baro_altitude || 0),
          distance: Math.round(distance),
          direction,
          heading: true_track || 0, // <-- Direção de voo em graus para o ícone
          type,
          title: `Voo ${
            callsign?.trim() || icao24 || "Desconhecido"
          } (${Math.round(distance)} km)`,
          body: `${origin_country} - ${direction} - Alt: ${Math.round(
            baro_altitude || 0
          )} m`,
          userLat: lat, // Centro do radar, útil para o widget
          userLon: lon,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance)

      console.log("[DEBUG] Found planes:", planes); // até 50km

    // Retorna os 5 mais próximos
    return planes.slice(0, 5);
  } catch (err) {
    console.error("Erro ao buscar aviões do OpenSky:", err);
    return [];
  }
}

// Exporta as funções para o main.js
module.exports = { checkNearbyPlanes };
