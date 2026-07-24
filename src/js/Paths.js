// src/js/Paths.js
// ATENÇÃO: este módulo NÃO deve importar Logger, ConfigManager ou Background.
// Todos eles dependem dele — qualquer import interno aqui cria ciclo e faz
// os outros módulos receberem um objeto vazio.
const path = require("path");
const fs   = require("fs");

const APP_FOLDER = "AirplaneRadarWidget";

if (process.type !== "browser") {
    throw new Error("[PATHS] Módulo exclusivo do processo principal.");
}

const { app } = require("electron");

// setName ANTES de qualquer getPath(): o Electron cacheia o diretório.
app.setName(APP_FOLDER);

const userData = app.getPath("userData");

function ensureDirs() {
    [userData, path.join(userData, "logs"), path.join(userData, "sounds")]
        .forEach(dir => {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (e) {
                console.error("[PATHS] Falha ao criar diretório:", dir, e.message);
            }
        });
}

const PATHS = {
    userData,

    // Leitura + escrita
    config:     path.join(userData, "config.json"),
    cache:      path.join(userData, "aircraft_cache.json"),
    logsDir:    path.join(userData, "logs"),
    logFile:    path.join(userData, "logs", "runtime.log"),
    userSounds: path.join(userData, "sounds"),

    // Somente leitura (empacotados)
    builtinSounds: app.isPackaged
        ? path.join(process.resourcesPath, "sound")
        : path.join(__dirname, "../../assets/sound"),

    techData: app.isPackaged
        ? path.join(process.resourcesPath, "TechnicalData.json")
        : path.join(__dirname, "../../config/TechnicalData.json"),

    ensureDirs
};

function migrateLegacy() {
    const legacyRoots = [
        path.join(__dirname, "../../config"),
        path.join(app.getPath("appData"), "Airplane Radar Widget"),
        path.join(app.getPath("appData"), "airplane-radar-widget")
    ];

    const targets = [
        ["config.json",         PATHS.config],
        ["aircraft_cache.json", PATHS.cache]
    ];

    for (const root of legacyRoots) {
        if (path.resolve(root) === path.resolve(userData)) continue;
        for (const [name, dest] of targets) {
            const src = path.join(root, name);
            try {
                if (fs.existsSync(src) && !fs.existsSync(dest)) {
                    fs.copyFileSync(src, dest);
                    console.log(`[PATHS] Migrado: ${src} -> ${dest}`);
                }
            } catch { /* somente-leitura ou sem permissão: ignorar */ }
        }
    }
}

ensureDirs();
migrateLegacy();

console.log("[PATHS] userData:", userData);

module.exports = PATHS;