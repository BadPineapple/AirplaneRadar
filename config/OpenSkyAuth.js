// src/js/OpenSkyAuth.js
const { log, warn, error } = require("../src/js/Logger");

let cachedToken = null;
let tokenExpiration = null;
let isRefreshing = null;

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

    if (isRefreshing) {
        log("[AUTH] Já existe um pedido em curso, aguardando...");
        return isRefreshing;
    }

    log("[AUTH] Solicitando novo token de acesso...");

    isRefreshing = (async () => {
        try {
            log("[AUTH] Solicitando novo token de acesso...");
            const params = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            });

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
            cachedToken = json.access_token;
            tokenExpiration = Date.now() + (json.expires_in * 1000);
            
            return cachedToken;
        } catch (err) {
            error("[AUTH] Erro ao renovar token:", err.message);
            return null;
        } finally {
            isRefreshing = null; // Libera a trava
        }
    })();

    return isRefreshing;
}

/**
 * Retorna o token apenas se ele já existir e for válido.
 */
function getCachedToken() {
    return (cachedToken && Date.now() < (tokenExpiration - 10000)) ? cachedToken : null;
}

module.exports = { getOpenSkyToken, getCachedToken };