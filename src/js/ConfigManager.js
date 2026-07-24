// src/js/ConfigManager.js
const fs   = require("fs");
const path = require("path");
const { safeStorage } = require("electron");
const PATHS = require("./Paths");
const { log, warn, error } = require("./Logger");

const configPath = PATHS.config;

const defaultConfig = {
    widget: {
        x: 20, y: 600, width: 275, height: 430,
        bgColor: "#1e1e1e", mapiconcolor: "#ffd700",
        titlecolor: "#ffd700", textcolor: "#ffffff", bgOpacity: 0.6
    },
    bubble:  { x: 20, y: 600, color: "#1982d2", size: 50, iconColor: "#ffffff" },
    details: { x: undefined, y: undefined },
    map:     { lat: -16.6809, lon: -49.2539, zoom: 13 },
    home:    { lat: null, lon: null },         
    startup: { autoLaunch: true },
    search:  { radius: 50, filters: ["comercial", "privado", "militar", "helicoptero", "outros"] },
    alert:   { general: "notificacao.mp3", favorite: "favorito.mp3" },
    shortcuts: {
        zoomin: "Ctrl+0", zoomout: "Ctrl+9", refresh: "Ctrl+R",
        minimize: "Ctrl+M", restore: "Ctrl+Shift+M"
    },
    accounts: { opensky: { client_id: "", client_secret_enc: "" } }
};

/* ───────────────────────────  Merge profundo  ──────────────────────────── */
function deepMerge(base, override) {
    const out = { ...base };
    for (const [key, value] of Object.entries(override || {})) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            out[key] = deepMerge(base[key] || {}, value);
        } else if (value !== undefined) {
            out[key] = value;
        }
    }
    return out;
}

/* ─────────────────────────  Criptografia do secret  ────────────────────── */
function canEncrypt() {
    try { return safeStorage.isEncryptionAvailable(); }
    catch { return false; }
}

/**
 * Normaliza credenciais: se houver secret em texto puro, cifra e remove o original.
 * Chamado no save — que sempre ocorre após o app estar pronto.
 */
function normalizeSecrets(config) {
    const acc = config?.accounts?.opensky;
    if (!acc) return config;

    if (acc.client_secret) {
        if (canEncrypt()) {
            try {
                acc.client_secret_enc = safeStorage
                    .encryptString(acc.client_secret)
                    .toString("base64");
                delete acc.client_secret;
                log("[CONFIG] Credencial OpenSky cifrada com safeStorage.");
            } catch (e) {
                warn("[CONFIG] Falha ao cifrar credencial:", e.message);
            }
        } else {
            warn("[CONFIG] safeStorage indisponível — secret permanecerá em texto puro.");
        }
    }
    return config;
}

/**
 * Retorna as credenciais em claro. Uso restrito ao processo principal.
 */
function getOpenSkyCredentials(config) {
    const acc = config?.accounts?.opensky || {};
    let secret = acc.client_secret || "";

    if (!secret && acc.client_secret_enc) {
        try {
            secret = safeStorage.decryptString(Buffer.from(acc.client_secret_enc, "base64"));
        } catch (e) {
            warn("[CONFIG] Não foi possível decifrar o secret (perfil/máquina diferente?).");
            secret = "";
        }
    }
    return { client_id: acc.client_id || "", client_secret: secret };
}

/* ──────────────────────────  Leitura / Escrita  ────────────────────────── */
function loadConfig() {
    try {
        PATHS.ensureDirs();

        if (!fs.existsSync(configPath)) {
            log("[CONFIG] config.json inexistente. Criando padrão em:", configPath);
            saveConfig(defaultConfig);
            return { ...defaultConfig };
        }

        const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
        return deepMerge(defaultConfig, raw);
    } catch (err) {
        error("[CONFIG] Arquivo corrompido. Restaurando padrão:", err.message);
        try {
            fs.copyFileSync(configPath, `${configPath}.corrompido`);
        } catch {}
        saveConfig(defaultConfig);
        return { ...defaultConfig };
    }
}

/* ──────────────────────────  Escrita assíncrona  ───────────────────────── */
let writeChain   = Promise.resolve();
let pendingWrite = null;

async function atomicWrite(destPath, data) {
    const fsp = fs.promises;
    const tmp = `${destPath}.tmp`;
    try {
        await fsp.writeFile(tmp, data, "utf8");
        await fsp.rename(tmp, destPath);
    } catch (err) {
        error("[CONFIG] Erro ao salvar:", err.message);
        try { await fsp.unlink(tmp); } catch {}
    }
}

function saveConfig(config) {
    normalizeSecrets(config);
    pendingWrite = JSON.stringify(config, null, 2);

    writeChain = writeChain.then(async () => {
        if (pendingWrite === null) return;
        const data = pendingWrite;
        pendingWrite = null;
        await atomicWrite(configPath, data);
    });

    return writeChain;
}

function saveConfigSync(config) {
    try {
        normalizeSecrets(config);
        const tmp = `${configPath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf8");
        fs.renameSync(tmp, configPath);
        pendingWrite = null;
    } catch (err) {
        error("[CONFIG] Erro no salvamento final:", err.message);
    }
}

module.exports = {
    loadConfig,
    saveConfig,
    saveConfigSync,
    getOpenSkyCredentials,
    deepMerge,
    defaultConfig,
    configPath,
    ensureConfigFile: loadConfig
};