/* ────────────────────────────────  Main.js  ─────────────────────────────── */
const { app, Tray, Menu, Notification, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs   = require("fs");
const AutoLaunch = require("auto-launch");

// PATHS PRECISA SER O PRIMEIRO MÓDULO INTERNO — define app.setName() antes
// de qualquer getPath(), senão o Electron cacheia o diretório errado.
const PATHS = require("./Paths");

const { checkNearbyPlanes, getAircraftFullDetails, persistCache, persistCacheSync } = require("./Background");
const { applyShortcuts, unregisterShortcuts } = require("./Shortcuts");
const { loadConfig, saveConfig, saveConfigSync, getOpenSkyCredentials, deepMerge } = require("./ConfigManager");
const { log, warn, error, flushSync } = require("./Logger");

/* ═══════════════════════════  INSTÂNCIA ÚNICA  ═══════════════════════════ */
// Sem isso, duas instâncias brigam pelos atalhos globais e gravam o mesmo
// config.json simultaneamente (última escrita vence, config corrompido).
if (!app.requestSingleInstanceLock()) {
    log("[APP] Instância já em execução. Encerrando esta.");
    app.quit();
    return;
}

log("=== App iniciado (processo principal) ===");
log("[PATHS] userData:", PATHS.userData);

/* ══════════════════════════════  ESTADO  ════════════════════════════════ */
let config = loadConfig();

let tray           = null;
let widgetWindow   = null;
let bubbleWindow   = null;
let settingsWindow = null;
let detailsWindow  = null;

let refreshTimer = null;
let isFetching   = false;

// ICAOs já notificados nesta sessão — evita repetir o alerta a cada 30s
const notifiedEmergencies = new Set();

/* MIGRAÇÃO: `map` (viewport do Leaflet) e `home` (origem do radar) eram o
   mesmo objeto. Arrastar o mapa mudava a base de busca no próximo boot.
   Instalações antigas herdam a base a partir do último centro conhecido. */
if (!config.home || config.home.lat == null || config.home.lon == null) {
    config.home = { lat: config.map.lat, lon: config.map.lon };
    saveConfig(config);
    log("[CONFIG] Base de busca migrada de map -> home.");
}

let userLocation = { lat: config.home.lat, lon: config.home.lon };

/* ════════════════════════  PREFERÊNCIAS DE JANELA  ══════════════════════ */
const SECURE_PREFS = {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    preload: path.join(__dirname, "preload.js")
};

/* ═════════════════════════════  UTILITÁRIOS  ════════════════════════════ */

function allWindows() {
    return [widgetWindow, bubbleWindow, detailsWindow, settingsWindow];
}

function broadcast(channel, payload) {
    allWindows().forEach(win => {
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    });
}

// Coalesce gravações disparadas por eventos de alta frequência (move, zoom)
const saveTimers = new Map();
function debouncedSave(key, delay = 800) {
    clearTimeout(saveTimers.get(key));
    saveTimers.set(key, setTimeout(() => {
        saveConfig(config);
        saveTimers.delete(key);
    }, delay));
}

function notifyEmergency(plane) {
    if (!Notification.isSupported()) return;
    if (notifiedEmergencies.has(plane.icao24)) return;
    notifiedEmergencies.add(plane.icao24);

    new Notification({
        title: `⚠ EMERGÊNCIA — ${plane.callsign}`,
        body: `Squawk ${plane.squawk || "SPI"} • ${plane.model} • ${plane.distance} km`,
        urgency: "critical"
    }).show();

    log("[ALERT] Emergência notificada:", plane.icao24, plane.squawk);
}

/* ══════════════════════════════  IPC: LEITURA  ══════════════════════════ */

ipcMain.handle("get-config", () => config);

ipcMain.handle("get-paths", () => ({
    userData:      PATHS.userData,
    userSounds:    PATHS.userSounds,
    builtinSounds: PATHS.builtinSounds
}));

// Credenciais em claro — rota exclusiva da tela de Configurações
ipcMain.handle("get-opensky-credentials", () => getOpenSkyCredentials(config));

ipcMain.handle("fetch-plane-details-direct", async (event, icao24) => {
    log("[DETAILS] Busca completa solicitada:", icao24);
    try {
        const data = await getAircraftFullDetails(icao24, config, true);
        persistCache();
        return data;
    } catch (err) {
        error("[DETAILS] Falha na busca:", err.message);
        return null;
    }
});

/* ═══════════════════════════  IPC: SONS  ════════════════════════════════ */

ipcMain.handle("list-sounds", async () => {
    const seen = new Set();
    for (const dir of [PATHS.builtinSounds, PATHS.userSounds]) {
        try {
            const files = await fs.promises.readdir(dir);
            files.filter(f => f.toLowerCase().endsWith(".mp3")).forEach(f => seen.add(f));
        } catch { /* pasta ausente é aceitável */ }
    }
    return [...seen];
});

ipcMain.handle("add-sound", async (event, { sourcePath, fileName }) => {
    try {
        if (!sourcePath || !/^[\w\-. ]+\.mp3$/i.test(fileName || "")) {
            return { ok: false, message: "Nome de arquivo inválido." };
        }
        // basename bloqueia travessia de diretório via "../"
        const dest = path.join(PATHS.userSounds, path.basename(fileName));
        await fs.promises.copyFile(sourcePath, dest);
        log("[SOUND] Adicionado:", fileName);
        return { ok: true };
    } catch (err) {
        error("[SOUND] Falha ao copiar:", err.message);
        return { ok: false, message: err.message };
    }
});

/* ══════════════════════════  IPC: MAPA E BASE  ══════════════════════════ */

// Viewport do Leaflet. Alta frequência (moveend/zoomend) -> debounce.
// NÃO altera a origem do radar.
ipcMain.on("save-map-config", (event, mapCfg) => {
    config.map = { ...config.map, ...mapCfg };
    debouncedSave("map");
});

// Origem do radar. Só muda por clique explícito em "Alterar Localização".
ipcMain.on("manual-location-changed", (event, { lat, lon } = {}) => {
    if (typeof lat !== "number" || typeof lon !== "number") return;

    userLocation = { lat, lon };
    config.home  = { lat, lon };
    config.map   = { ...config.map, lat, lon };
    saveConfig(config);

    notifiedEmergencies.clear();   // nova região, novos alertas
    log("[MAP] Nova base de busca:", lat.toFixed(4), lon.toFixed(4));
    refreshPlanes(true);
});

/* ════════════════════════════  IPC: JANELAS  ════════════════════════════ */

ipcMain.on("quit-app", () => app.quit());

ipcMain.on("minimize-to-bubble", () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
    createBubbleWindow();
});

ipcMain.on("restore-from-bubble", () => {
    if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.close();
    if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.show();
        widgetWindow.focus();
    }
    refreshPlanes(true);   // dados frescos ao reabrir
});

ipcMain.on("open-settings", () => createSettingsWindow());

// Move a bolha SEM tocar no disco (dispara ~60x/s durante o arrasto)
ipcMain.on("move-bubble", (event, { x, y } = {}) => {
    if (!bubbleWindow || bubbleWindow.isDestroyed()) return;
    if (typeof x !== "number" || typeof y !== "number") return;
    bubbleWindow.setPosition(Math.round(x), Math.round(y));
});

// Grava uma única vez, ao soltar o mouse
ipcMain.on("save-bubble-position", () => {
    if (!bubbleWindow || bubbleWindow.isDestroyed()) return;
    const [x, y] = bubbleWindow.getPosition();
    config.bubble = { ...config.bubble, x, y };
    saveConfig(config);
});

/* ═══════════════════════  IPC: JANELA DE DETALHES  ══════════════════════ */

ipcMain.on("open-details-window", (event, icao24) => {
    if (!icao24) return;

    if (detailsWindow && !detailsWindow.isDestroyed()) {
        if (detailsWindow.isMinimized()) detailsWindow.restore();
        detailsWindow.focus();
        detailsWindow.webContents.send("load-icao", icao24);
        return;
    }

    detailsWindow = new BrowserWindow({
        width: 420,
        height: 700,
        x: config.details?.x,
        y: config.details?.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: false,
        show: false,
        webPreferences: SECURE_PREFS
    });

    detailsWindow.loadFile(path.join(__dirname, "../html/details.html"));

    // Com preload + contextIsolation o listener do renderer já está registrado
    // quando did-finish-load dispara. O setTimeout(300) anterior era gambiarra.
    detailsWindow.webContents.once("did-finish-load", () => {
        if (!detailsWindow || detailsWindow.isDestroyed()) return;
        detailsWindow.webContents.send("apply-style", config);
        detailsWindow.webContents.send("load-icao", icao24);
        detailsWindow.show();
        log("[DETAILS] Janela aberta para:", icao24);
    });

    detailsWindow.on("closed", () => (detailsWindow = null));
});

ipcMain.on("close-details-window", () => {
    if (detailsWindow && !detailsWindow.isDestroyed()) detailsWindow.close();
});

ipcMain.on("save-details-position", () => {
    if (!detailsWindow || detailsWindow.isDestroyed()) return;
    const [x, y] = detailsWindow.getPosition();
    config.details = { ...config.details, x, y };
    debouncedSave("details");
});

/* ════════════════════════  IPC: CONFIGURAÇÕES  ══════════════════════════ */

ipcMain.on("update-config", (event, partial) => {
    const previous = {
        shortcuts:  JSON.stringify(config.shortcuts),
        radius:     config.search?.radius,
        filters:    JSON.stringify(config.search?.filters),
        bubbleSize: config.bubble?.size,
        autoLaunch: config.startup?.autoLaunch
    };

    config = deepMerge(config, partial);
    saveConfig(config);   // cifra o client_secret via safeStorage

    // 1. Atalhos — unregisterAll é global e caro, só refaz se mudou
    if (JSON.stringify(config.shortcuts) !== previous.shortcuts) {
        applyShortcuts(widgetWindow, config, () => refreshPlanes(true));
        log("[CONFIG] Atalhos re-registrados.");
    }

    // 2. Bolha aberta: redimensiona em tempo real
    if (bubbleWindow && !bubbleWindow.isDestroyed() &&
        config.bubble?.size !== previous.bubbleSize) {
        const size = config.bubble.size || 60;
        bubbleWindow.setSize(size, size);
    }

    // 3. Auto-início — respeita a escolha do usuário
    if (config.startup?.autoLaunch !== previous.autoLaunch) {
        syncAutoLaunch();
    }

    // 4. Estilo para todas as janelas
    broadcast("apply-style", config);

    // 5. Raio ou filtros alterados -> refresh imediato
    if (config.search?.radius !== previous.radius ||
        JSON.stringify(config.search?.filters) !== previous.filters) {
        notifiedEmergencies.clear();
        refreshPlanes(true);
    }

    log("[CONFIG] Configurações aplicadas.");
});

// O settings.js envia só o sub-objeto `widget`, mas os renderers esperam o
// config completo. Ignoramos o payload e retransmitimos o estado real.
ipcMain.on("apply-style", () => broadcast("apply-style", config));

/* ═════════════════════════  CRIAÇÃO DE JANELAS  ═════════════════════════ */

function createWidgetWindow() {
    widgetWindow = new BrowserWindow({
        width:  config.widget.width  || 280,
        height: config.widget.height || 430,
        x: config.widget.x,
        y: config.widget.y,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        webPreferences: SECURE_PREFS
    });

    widgetWindow.setAlwaysOnTop(true, "screen-saver");
    widgetWindow.loadFile(path.join(__dirname, "../html/widget.html"));

    widgetWindow.on("move", () => {
        const [x, y] = widgetWindow.getPosition();
        config.widget.x = x;
        config.widget.y = y;
        debouncedSave("widget");
    });

    widgetWindow.on("show", () => refreshPlanes(true));
    widgetWindow.on("closed", () => (widgetWindow = null));
}

function createBubbleWindow() {
    if (bubbleWindow && !bubbleWindow.isDestroyed()) return;

    const size = config.bubble?.size || 60;

    bubbleWindow = new BrowserWindow({
        width: size,
        height: size,
        x: config.bubble?.x ?? 50,
        y: config.bubble?.y ?? 50,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        webPreferences: SECURE_PREFS
    });

    bubbleWindow.setAlwaysOnTop(true, "screen-saver");
    bubbleWindow.loadFile(path.join(__dirname, "../html/bubble.html"));
    bubbleWindow.on("closed", () => (bubbleWindow = null));
}

function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        return settingsWindow.focus();
    }

    settingsWindow = new BrowserWindow({
        width: 450,
        height: 600,
        resizable: false,
        title: "Configurações do Radar",
        webPreferences: { ...SECURE_PREFS, backgroundThrottling: false }
    });

    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, "../html/settings.html"));
    settingsWindow.on("closed", () => (settingsWindow = null));
}

/* ══════════════════════════  LÓGICA DE NEGÓCIO  ═════════════════════════ */

async function refreshPlanes(force = false) {
    if (isFetching) {
        log("[RADAR] Ciclo anterior em andamento, pulando.");
        return;
    }

    // Não consome quota da API com o widget oculto na bolha
    const visible = widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible();
    if (!visible && !force) return;

    isFetching = true;
    try {
        const planes = await checkNearbyPlanes(userLocation, config);

        if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send("update-planes", planes);
        }

        planes.filter(p => p.emergencia).forEach(notifyEmergency);

        // Libera ICAOs que saíram do radar para poderem alertar de novo depois
        const current = new Set(planes.map(p => p.icao24));
        notifiedEmergencies.forEach(icao => {
            if (!current.has(icao)) notifiedEmergencies.delete(icao);
        });

    } catch (err) {
        error("[RADAR] Erro no refresh:", err.message);
    } finally {
        isFetching = false;
    }
}

function syncAutoLaunch() {
    const launcher = new AutoLaunch({ name: "AirplaneRadarWidget" });
    const desired = config.startup?.autoLaunch !== false;

    launcher.isEnabled()
        .then(enabled => {
            if (desired && !enabled)  return launcher.enable();
            if (!desired && enabled)  return launcher.disable();
        })
        .then(() => log("[STARTUP] Auto-início:", desired ? "ativo" : "inativo"))
        .catch(err => warn("[STARTUP] Falha ao ajustar auto-início:", err.message));
}

function createTray() {
    const iconPath = path.join(__dirname, "../../assets/img/icon.png");

    try {
        tray = new Tray(iconPath);
    } catch (err) {
        error("[TRAY] Ícone não encontrado:", iconPath);
        return;
    }

    tray.setToolTip("Airplane Radar Widget");
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: "Abrir Radar",
            click: () => {
                if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.close();
                if (widgetWindow && !widgetWindow.isDestroyed()) {
                    widgetWindow.show();
                    widgetWindow.focus();
                } else {
                    createWidgetWindow();
                }
            }
        },
        { label: "Atualizar agora", click: () => refreshPlanes(true) },
        { label: "Configurações",   click: () => createSettingsWindow() },
        { type: "separator" },
        {
            label: "Abrir pasta de dados",
            click: () => shell.openPath(PATHS.userData)
        },
        { type: "separator" },
        { label: "Sair", click: () => app.quit() }
    ]));

    tray.on("double-click", () => {
        if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.show();
    });
}

/* ═══════════════════════  ENDURECIMENTO DE SEGURANÇA  ═══════════════════ */

app.on("web-contents-created", (event, contents) => {
    // Nenhuma janela ou popup pode ser aberta pelo conteúdo
    contents.setWindowOpenHandler(() => ({ action: "deny" }));

    // Bloqueia redirect para fora do app (ex.: link injetado em dado de API)
    contents.on("will-navigate", (e, url) => {
        if (!url.startsWith("file://")) {
            e.preventDefault();
            warn("[SECURITY] Navegação externa bloqueada:", url);
        }
    });

    contents.on("will-attach-webview", (e) => e.preventDefault());
});

// Segunda instância: traz a existente para frente em vez de abrir outra
app.on("second-instance", () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.show();
        widgetWindow.focus();
    }
});

/* ════════════════════════════════  CICLO DE VIDA  ═══════════════════════ */

app.whenReady().then(() => {
    // Necessário no Windows para que as notificações exibam nome e ícone corretos
    if (process.platform === "win32") {
        app.setAppUserModelId("com.renato.airplaneradar");
    }

    createTray();
    createWidgetWindow();
    syncAutoLaunch();

    applyShortcuts(widgetWindow, config, () => refreshPlanes(true));

    refreshTimer = setInterval(() => refreshPlanes(), 30_000);
    refreshPlanes(true);
});

app.on("will-quit", () => {
    if (refreshTimer) clearInterval(refreshTimer);

    // Cancela debounces pendentes — sem isso, a última alteração some
    saveTimers.forEach(t => clearTimeout(t));
    saveTimers.clear();

    unregisterShortcuts();
    saveConfigSync(config);
    persistCacheSync();
    flushSync();

    log("=== App encerrado ===");
});

// App de bandeja: fechar as janelas não encerra o processo
app.on("window-all-closed", () => { /* intencionalmente vazio */ });

app.on("activate", () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) createWidgetWindow();
});