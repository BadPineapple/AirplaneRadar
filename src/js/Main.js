const { app, Tray, Menu, Notification, BrowserWindow, ipcMain } = require("electron");
const path        = require("path");
const AutoLaunch  = require("auto-launch");
const remoteMain  = require("@electron/remote/main");

// Módulos internos
const { checkNearbyPlanes, getAircraftFullDetails } = require("./Background");
const { applyShortcuts, unregisterShortcuts } = require("./Shortcuts");
const { ensureConfigFile, loadConfig, saveConfig } = require("./ConfigManager");
const { log, error } = require('./Logger');

log("=== App iniciado (processo principal) ===");

// Inicialização de Config
ensureConfigFile();
let config = loadConfig();
let tray = null;
let widgetWindow = null;
let bubbleWindow = null;
let settingsWindow = null;
let userLocation = { lat: config.map.lat, lon: config.map.lon };
let detailsWindow = null;

// Inicializa o Remote
remoteMain.initialize();

// --- HANDLERS IPC (Comunicação) ---
ipcMain.handle("get-config", () => config);

ipcMain.on("save-map-config", (e, mapCfg) => {
    config.map = { ...config.map, ...mapCfg };
    saveConfig(config);
    userLocation = { lat: mapCfg.lat, lon: mapCfg.lon };
});

ipcMain.on("quit-app", () => app.quit());

ipcMain.on("minimize-to-bubble", () => {
    if (widgetWindow) widgetWindow.hide();
    createBubbleWindow();
});

ipcMain.on("restore-from-bubble", () => {
    if (bubbleWindow) bubbleWindow.close();
    if (widgetWindow) { widgetWindow.show(); widgetWindow.focus(); }
});

ipcMain.on("open-settings", () => createSettingsWindow());

// --- GERENCIAMENTO DA JANELA DE DETALHES ---

ipcMain.on("open-details-window", (event, icao24) => {
    if (detailsWindow) {
        if (detailsWindow.isMinimized()) detailsWindow.restore();
        detailsWindow.focus();
        detailsWindow.webContents.send("load-icao", icao24);
        log("[DETAILS] Solicitada nova telemetria para o ICAO:", icao24);
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
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true 
        }
    });

    if (remoteMain && typeof remoteMain.enable === 'function') {
        remoteMain.enable(detailsWindow.webContents);
    }

    detailsWindow.loadFile(path.join(__dirname, "../html/details.html"));

    detailsWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => {
            if (detailsWindow && !detailsWindow.isDestroyed()) {
                detailsWindow.webContents.send('load-icao', icao24);
                detailsWindow.webContents.send("apply-style", config);
                log("[DETAILS] Janela aberta e ICAO enviado com sucesso:", icao24);
            }
        }, 300); 
    });

    // O EVENTO DE "MOVE" AUTOMÁTICO FOI REMOVIDO DAQUI

    detailsWindow.on("closed", () => {
        detailsWindow = null;
    });
});

ipcMain.on("close-details-window", () => {
    if (detailsWindow) detailsWindow.close();
});

// NOVO: Handler para salvar a posição manualmente sob demanda
ipcMain.on("save-details-position", () => {
    if (detailsWindow && !detailsWindow.isDestroyed()) {
        const [x, y] = detailsWindow.getPosition();
        if (!config.details) config.details = {};
        config.details.x = x;
        config.details.y = y;
        saveConfig(config);
        log("[DETAILS] Posição salva manualmente:", x, y);
    }
});

// --- ROTA DE DADOS PARA A TELEMETRIA ---
ipcMain.handle("fetch-plane-details-direct", async (event, icao24) => {
    log("[MAIN] A aba de detalhes solicitou busca pesada para:", icao24);
    const fullData = await getAircraftFullDetails(icao24, config, true);
    return fullData;
});

// --- CRIAÇÃO DE JANELAS ---

function createWidgetWindow() {
    widgetWindow = new BrowserWindow({
        width: config.widget.width || 280,
        height: config.widget.height || 430,
        x: config.widget.x,
        y: config.widget.y,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true, 
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    remoteMain.enable(widgetWindow.webContents);
    widgetWindow.setAlwaysOnTop(true, "screen-saver");
    widgetWindow.loadFile(path.join(__dirname, "../html/widget.html"));

    let saveTimeout;
    widgetWindow.on("move", () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const [x, y] = widgetWindow.getPosition();
            config.widget.x = x;
            config.widget.y = y;
            saveConfig(config);
            log("[WIDGET]", "Posição salva:", x, y);
        }, 500);
    });
}

function createBubbleWindow() {
    if (bubbleWindow) return;
    bubbleWindow = new BrowserWindow({
        width: 60, height: 60,
        x: config.bubble?.x || 50,
        y: config.bubble?.y || 50,
        frame: false, transparent: true, alwaysOnTop: true,
        skipTaskbar: true, resizable: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false, enableRemoteModule: true }
    });
    
    remoteMain.enable(bubbleWindow.webContents);
    bubbleWindow.loadFile(path.join(__dirname, "../html/bubble.html"));
    bubbleWindow.on("closed", () => (bubbleWindow = null));
}

function createSettingsWindow() {
    if (settingsWindow) return settingsWindow.focus();
    settingsWindow = new BrowserWindow({
        width: 450, height: 600,
        resizable: false,
        title: "Configurações do Radar",
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, "../html/settings.html"));
    settingsWindow.on("closed", () => (settingsWindow = null));
}

// --- LOGICA DE NEGÓCIO ---

async function refreshPlanes() {
    try {
        const planes = await checkNearbyPlanes(userLocation, config);
        if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send("update-planes", planes);
        }
        log(`Aviões encontrados: ${planes.length}`);
    } catch (err) {
        error("Erro no refresh:", err);
    }
}

// --- LIFECYCLE ---

app.whenReady().then(async () => {
    const iconPath = path.join(__dirname, "../../assets/img/icon.png");
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Abrir Radar', click: () => widgetWindow.show() },
        { label: 'Configurações', click: () => createSettingsWindow() },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() }
    ]);
    tray.setToolTip('Airplane Radar Widget');
    tray.setContextMenu(contextMenu);

    const autoLauncher = new AutoLaunch({ name: "AirplaneRadarWidget" });
    autoLauncher.isEnabled().then(isEnabled => {
        if (!isEnabled) autoLauncher.enable();
    });

    createWidgetWindow();
    applyShortcuts(widgetWindow, config, refreshPlanes);

    setInterval(refreshPlanes, 30_000);
    refreshPlanes(); 
});

app.on("will-quit", unregisterShortcuts);
app.on("window-all-closed", e => {
    if (process.platform !== 'darwin') e.preventDefault(); 
});