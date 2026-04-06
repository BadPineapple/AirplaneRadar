// src/js/OpenSkyAuth.js
const { log, warn, error } = require("../src/js/Logger");

let cachedToken = null;
let tokenExpiration = null;

/**
 * Autentica com OpenSky e retorna um token válido (JWT).
 * O token é mantido em cache enquanto for válido para evitar spam na API de auth.
 */
async function getOpenSkyToken(config) {
    const clientId = config.accounts?.opensky?.client_id || '';
    const clientSecret = config.accounts?.opensky?.client_secret || '';

    if (!clientId || !clientSecret) {
        warn("[AUTH] Client ID ou Secret ausentes no config. Verifique as configurações.");
        return null;
    }

    // Reutiliza o token se ainda for válido (com margem de segurança de 10s)
    if (cachedToken && tokenExpiration && Date.now() < (tokenExpiration - 10000)) {
        return cachedToken;
    }

    log("[AUTH] Solicitando novo token de acesso...");

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    try {
        // Usando o fetch nativo do Electron/Node
        const res = await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            error(`[AUTH] Falha na autenticação (${res.status}):`, errorData.error_description || res.statusText);
            return null;
        }

        const json = await res.json();
        
        if (!json.access_token) {
            error("[AUTH] Resposta da API não contém o access_token.");
            return null;
        }

        // Atualiza cache e expiração
        cachedToken = json.access_token;
        // expires_in geralmente é 600 segundos (10 min)
        tokenExpiration = Date.now() + (json.expires_in * 1000);
        
        log("[AUTH] Token renovado com sucesso.");
        return cachedToken;

    } catch (err) {
        error("[AUTH] Erro de rede/conexão ao autenticar:", err.message);
        return null;
    }
}

/**
 * Retorna o token apenas se ele já existir e for válido.
 */
function getCachedToken() {
    return (cachedToken && Date.now() < (tokenExpiration - 10000)) ? cachedToken : null;
}

module.exports = { getOpenSkyToken, getCachedToken };