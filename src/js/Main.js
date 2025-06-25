// src/js/Main.js  ─────────────────────────────────────────────────────────────
const { app, Tray, Notification, BrowserWindow, ipcMain } = require("electron");
const path        = require("path");
const AutoLaunch  = require("auto-launch");
const remoteMain  = require("@electron/remote/main");
const { checkNearbyPlanes }       = require("./Background");
const { applyShortcuts, unregisterShortcuts } = require("./Shortcuts");
const { ensureConfigFile, loadConfig, saveConfig }       = require("./ConfigManager");
// ---------------  LOGGER  ----------------------------------------------------
const { log, warn, error } = require('./Logger');  // ajuste caminho se preciso
log("=== App iniciado (processo principal) ===");
// -----------------------------------------------------------------------------

ensureConfigFile();
let config         = loadConfig();
let tray           = null;
let widgetWindow   = null;
let bubbleWindow   = null;
let settingsWindow = null;
let userLocation   = { lat: config.map.lat, lon: config.map.lon };

// IPC handlers ---------------------------------------------------------------
ipcMain.handle("get-config", () => config);

let lastMapConfig = null;

ipcMain.on("save-map-config", (e, mapCfg) => {
  // verifica se houve mudança real
  const changed =
    !lastMapConfig ||
    mapCfg.lat  !== lastMapConfig.lat  ||
    mapCfg.lon  !== lastMapConfig.lon  ||
    mapCfg.zoom !== lastMapConfig.zoom;

  if (!changed) return;                    // nada mudou ⇒ sai sem logar

  log("[MAP]", "Salvando mapa:", mapCfg);  // grava 1 linha no runtime.log
  config.map = mapCfg;
  saveConfig(config);
  userLocation   = { lat: mapCfg.lat, lon: mapCfg.lon };
  lastMapConfig  = { ...mapCfg };          // atualiza cache
});

ipcMain.on("manual-location-changed", (e, loc) => {
  log("Localização manual:", loc);
  userLocation  = loc;
  config.map    = { ...config.map, ...loc };
  saveConfig(config);
});

ipcMain.on("quit-app", () => app.quit());

ipcMain.on("minimize-to-bubble", () => {
  if (widgetWindow) widgetWindow.hide();
  if (!bubbleWindow) createBubbleWindow();
});
ipcMain.on("restore-from-bubble", () => {
  if (bubbleWindow) bubbleWindow.close();
  if (widgetWindow) { widgetWindow.show(); widgetWindow.focus(); }
});

let bubbleMoveTimer = null;

ipcMain.on("move-bubble", (e, pos) => {
  if (!bubbleWindow) return;

  bubbleWindow.setPosition(pos.x, pos.y);

  clearTimeout(bubbleMoveTimer);
  bubbleMoveTimer = setTimeout(() => {
    config.bubble = { ...config.bubble, x: pos.x, y: pos.y };
    saveConfig(config);
    log("[BUBBLE]", "Posição salva:", pos);
  }, 300);
});
ipcMain.on("force-refresh", async () => {
  log("Atalho de refresh forçado.");
  await refreshPlanes();
});
ipcMain.on("open-settings", () => createSettingsWindow());

ipcMain.on("update-config", (e, newCfg) => {
  Object.assign(config, newCfg);
  saveConfig(config);
  applyShortcuts(widgetWindow, config);
  if (widgetWindow) widgetWindow.webContents.send("apply-style", config);
  log("Configuração atualizada via Settings.");
});

// ----------------  Criação das janelas  -------------------------------------
function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    width : config.widget.width  || 280,
    height: config.widget.height || 430,
    x     : config.widget.x || 20,
    y     : config.widget.y || 600,
    frame : false,
    alwaysOnTop : true,
    transparent : true,
    resizable   : false,
    skipTaskbar : true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, enableRemoteModule: true }
  });

  remoteMain.enable(widgetWindow.webContents);
  widgetWindow.setAlwaysOnTop(true, "screen-saver");
  widgetWindow.loadFile(path.join(__dirname, "../html/widget.html"));

  let lastWidgetPosition = {};
let lastWidgetSize = {};

widgetWindow.on("move", () => {
  const [x, y] = widgetWindow.getPosition();
  if (x !== lastWidgetPosition.x || y !== lastWidgetPosition.y) {
    Object.assign(config.widget, { x, y });
    lastWidgetPosition = { x, y };
    log("[WIDGET]", "Nova posição salva:", x, y);
    saveConfig(config);
  }
});

widgetWindow.on("resize", () => {
  const [width, height] = widgetWindow.getSize();
  if (width !== lastWidgetSize.width || height !== lastWidgetSize.height) {
    Object.assign(config.widget, { width, height });
    lastWidgetSize = { width, height };
    log("[WIDGET]", "Novo tamanho salvo:", width, height);
    saveConfig(config);
  }
});


  log("WidgetWindow criado:", config.widget);
}

function createBubbleWindow() {
  if (bubbleWindow) return;
  bubbleWindow = new BrowserWindow({
    width : 50,
    height: 50,
    x     : config.bubble.x || 20,
    y     : config.bubble.y || 600,
    frame : false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable  : false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, enableRemoteModule: true }
  });
  bubbleWindow.loadFile(path.join(__dirname, "../html/bubble.html"));
  bubbleWindow.on("closed", () => (bubbleWindow = null));
  log("BubbleWindow criada.");
}

function createSettingsWindow() {
  if (settingsWindow) return settingsWindow.focus();
  settingsWindow = new BrowserWindow({
    width : 400,
    height: 500,
    resizable: false,
    title: "Configurações",
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "../html/settings.html"));
  settingsWindow.on("closed", () => (settingsWindow = null));
  log("SettingsWindow aberta.");
}

// ----------------  Função de refresh de aviões  -----------------------------
async function refreshPlanes() {
  try {
    const planes = await checkNearbyPlanes(userLocation, config);
    if (widgetWindow) widgetWindow.webContents.send("update-planes", planes);
    if (planes[0]) new Notification({ title: planes[0].title, body: planes[0].body }).show();
    log("Aviões atualizados:", planes.map(p => p.icao24).join(", ") || "nenhum");
  } catch (err) {
    error("Falha ao atualizar aviões:", err);
  }
}

// ----------------  App lifecycle  ------------------------------------------
app.whenReady().then(async () => {
  remoteMain.initialize();
  tray = new Tray(path.join(__dirname, "../../assets/img/icon.png"));
  const autoLauncher = new AutoLaunch({ name: "AirplaneRadarWidget" });
  autoLauncher.enable();

  createWidgetWindow();
  applyShortcuts(widgetWindow, config);
  log("Atalhos aplicados.");

  // Atualiza a cada 30 s
  setInterval(refreshPlanes, 30_000);
  await refreshPlanes(); // primeira vez
});

app.on("will-quit", unregisterShortcuts);
app.on("window-all-closed", e => e.preventDefault());
