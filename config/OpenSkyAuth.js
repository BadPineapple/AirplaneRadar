
// src/js/OpenSkyAuth.js

const fetch = require("node-fetch");
let cachedToken = null;
let tokenExpiration = null;

/**
 * Autentica com OpenSky e retorna um token válido.
 * O token é cacheado em memória até expirar (~600s padrão).
 */
async function getOpenSkyToken(config) {
  const clientId = config.accounts?.opensky?.client_id || '';
  const clientSecret = config.accounts?.opensky?.client_secret || '';
  if (!clientId || !clientSecret) {
    console.warn("[OpenSkyAuth] Client ID ou Secret ausente.");
    return null;
  }

  // Reutiliza se ainda válido
  if (cachedToken && tokenExpiration && Date.now() < tokenExpiration) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  try {
    const res = await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) {
      console.error("[OpenSkyAuth] Erro ao autenticar:", res.status, res.statusText);
      return null;
    }

    const json = await res.json();
    if (!json.access_token) {
      console.error("[OpenSkyAuth] Token não retornado pela API.");
      return null;
    }
    cachedToken = json.access_token;
    tokenExpiration = Date.now() + (json.expires_in || 600) * 1000 - 10000;
    return cachedToken;
  } catch (err) {
    console.error("[OpenSkyAuth] Falha na autenticação:", err);
    return null;
  }
}

function getCachedToken() {
  return (cachedToken && Date.now() < tokenExpiration) ? cachedToken : null;
}

module.exports = { getOpenSkyToken, getCachedToken};
