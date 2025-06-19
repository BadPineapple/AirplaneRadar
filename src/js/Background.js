const fetch = require("node-fetch"); // v2!
const { getOpenSkyToken } = require("../../config/OpenSkyAuth");

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

async function getAircraftModel(icao24, config) {
  if (!icao24) return null;

  const token = await getOpenSkyToken(config);
  if (!token) {
    console.warn(`[OpenSky] Sem token para buscar modelo de ${icao24}`);
    return null;
  }

  const url = `https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      console.warn(`[OpenSky] Falha ao buscar modelo de ${icao24}:`, res.status, res.statusText);
      return null;
    }

    const json = await res.json();
    return json?.model || null;
  } catch (err) {
    console.error(`[OpenSky] Erro ao obter modelo de ${icao24}:`, err);
    return null;
  }
}

function getAircraftType(state) {
  const cs = state[1]?.trim().toUpperCase() || "";
  if (cs.startsWith("AF") || cs.startsWith("FAB") || cs.includes("MIL")) return "militar";
  if (cs.includes("HEL")) return "helicoptero";
  if (cs.includes("PRIV") || cs.includes("EXEC")) return "privado";
  if (cs.includes("B") || cs.includes("A") || cs.includes("VOO")) return "comercial";
  return "outros";
}

// Busca aviões próximos (raio ~50 km do centro)
async function checkNearbyPlanes(userLocation, config) {
  try {
    const { lat, lon } = userLocation;
    const radiusKm = config?.search?.radius ?? 50;
    const allowedTypes = config?.search?.filters || ['comercial', 'privado', 'militar', 'helicoptero', 'outros'];
   
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

    const planes = (await Promise.all(data.states
      .map(async (state) => {
        const [
              icao24,          // 0  Código hexadecimal de 24 bits exclusivo da aeronave
              callsign,        // 1  Código de chamada do voo
              origin_country,  // 2  País de origem do registro da aeronave.
              time_position,   // 3  Timestamp (Unix) da última posição conhecida.
              last_contact,    // 4  Timestamp do último contato recebido de qualquer tipo.
              longitude,       // 5  Longitude atual da aeronave (graus).
              latitude,        // 6  Latitude atual da aeronave (graus).
              baro_altitude,   // 7  Altitude barométrica estimada, em metros.
              on_ground,       // 8  Booleano indicando se a aeronave está no solo.
              velocity,        // 9  Velocidade horizontal em m/s.
              true_track,      // 10 Direção real do movimento
              vertical_rate,   // 11 Taxa de subida/descida em m/s.
              sensors,         // 12 Dados sobre sensores usados
              geo_altitude,    // 13 Altitude com base em modelo geodésico
              squawk,          // 14 Código de transponder 
              spi,             // 15 Special Position Indicator (booleano).
              position_source  // 16 Origem dos dados de posição.
        ] = state;

        let tipoModelo = 'Desconhecido';

             if (callsign?.startsWith('GLO')) tipoModelo = 'Gol Linhas Aéreas';
        else if (callsign?.startsWith('TAM')) tipoModelo = 'LATAM Airlines';
        else if (callsign?.startsWith('AZU')) tipoModelo = 'Azul Linhas Aéreas';
        else if (callsign?.startsWith('VOE')) tipoModelo = 'Voepass Linhas Aéreas';
        else if (callsign?.startsWith('BAW')) tipoModelo = 'British Airways';
        else if (callsign?.startsWith('ARG')) tipoModelo = 'Aerolíneas Argentinas';
        else if (callsign?.startsWith('CARG')) tipoModelo = 'Carga';
        else if (callsign?.startsWith('HEL')) tipoModelo = 'Helicóptero';

        if (latitude === null || longitude === null) return null;

        const distance = calculateDistanceKm(lat, lon, latitude, longitude);
        if (distance > radiusKm) return null;

        const direction = getDirection(lat, lon, latitude, longitude);
        const type = getAircraftType(state);
        if (!allowedTypes.includes(type)) return null;

        const model = await getAircraftModel(icao24, config);

        return {
          icao24,
          callsign: callsign ? callsign.trim() : "Desconhecido",
          origin_country,
          lat: latitude,
          lon: longitude,
          altitude: Math.round(baro_altitude || 0),
          distance: Math.round(distance),
          direction,
          squawk: squawk || null,
          spi: !!spi,
          emergencia: ['7500', '7600', '7700'].includes(squawk) || !!spi,
          heading: true_track || 0,
          model: model || "",
          type,
          title: `Voo ${callsign?.trim() || icao24 || "Desconhecido"}, ${model} (${Math.round(distance)} km)`,
          body: `${tipoModelo} - ${origin_country} - ${direction} - Alt: ${Math.round(baro_altitude || 0)} m`,
          userLat: lat, // Centro do radar, útil para o widget
          userLon: lon,
        };
      })))
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
