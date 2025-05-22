const { app, Tray, Notification, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');
const remoteMain = require('@electron/remote/main');
const { checkNearbyPlanes } = require('./Background');
const { registerShortcuts, unregisterShortcuts } = require('./Shortcuts');
const { ensureConfigFile, loadConfig, saveConfig } = require('./ConfigManager');

ensureConfigFile(); // Cria config.json padrão se não existir ou estiver inválido
let config = loadConfig(); // Carrega config válido
let tray = null;
let widgetWindow = null;
let bubbleWindow = null;
let userLocation = { lat: config.map.lat, lon: config.map.lon }; // Inicial pela config

// --- IPC: Widget pede config para iniciar ---
ipcMain.handle('get-config', () => config);

// --- IPC: Widget envia nova posição/zoom do mapa ---
ipcMain.on('save-map-config', (event, mapCfg) => {
  config.map = mapCfg;
  saveConfig(config);
  userLocation = { lat: mapCfg.lat, lon: mapCfg.lon };
});

// --- IPC: Widget envia nova localização manual ---
ipcMain.on('manual-location-changed', (event, newLoc) => {
  userLocation = { lat: newLoc.lat, lon: newLoc.lon };
  config.map.lat = newLoc.lat;
  config.map.lon = newLoc.lon;
  saveConfig(config);
});

// --- IPC: Sair do app pelo X ---
ipcMain.on('quit-app', () => {
  app.quit();
});

// --- IPC: Minimizar para bolha ---
ipcMain.on('minimize-to-bubble', () => {
  if (widgetWindow) widgetWindow.hide();
  if (!bubbleWindow) createBubbleWindow();
});

// --- IPC: Restaurar widget da bolha ---
ipcMain.on('restore-from-bubble', () => {
  if (bubbleWindow) { bubbleWindow.close(); }
  if (widgetWindow) {
    widgetWindow.show();
    widgetWindow.focus();
  }
});

// --- IPC: Mover bolha arrastável ---
ipcMain.on('move-bubble', (event, pos) => {
  if (bubbleWindow) {
    bubbleWindow.setPosition(pos.x, pos.y);
    config.bubble.x = pos.x;
    config.bubble.y = pos.y;
    saveConfig(config);
  }
});

// --- IPC: Refresh imediato pelo atalho ---
ipcMain.on('force-refresh', async () => {
  const planes = await checkNearbyPlanes(userLocation);
  if (widgetWindow) {
    widgetWindow.webContents.send('update-planes', planes);
  }
  if (planes[0]) {
    new Notification({
      title: planes[0].title,
      body: planes[0].body
    }).show();
  }
});

// --- CRIA JANELA PRINCIPAL (WIDGET) ---
function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    width: config.widget.width || 250,
    height: config.widget.height || 430,
    x: config.widget.x || 20,
    y: config.widget.y || 600,
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
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.loadFile(path.join(__dirname, '../html/widget.html'));


  widgetWindow.on('move', () => {
    let [x, y] = widgetWindow.getPosition();
    config.widget.x = x;
    config.widget.y = y;
    saveConfig(config);
  });

  widgetWindow.on('resize', () => {
    let [width, height] = widgetWindow.getSize();
    config.widget.width = width;
    config.widget.height = height;
    saveConfig(config);
  });

  console.log("[DEBUG] Widget window created with position:", config.widget.x, config.widget.y);
}

// --- CRIA JANELA DA BOLHA ---
function createBubbleWindow() {
  if (bubbleWindow) return;
  bubbleWindow = new BrowserWindow({
    width: 50,
    height: 50,
    x: config.bubble.x || 20,
    y: config.bubble.y || 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });
  bubbleWindow.loadFile('src/html/bubble.html');
  bubbleWindow.on('closed', () => { bubbleWindow = null; });
}

app.whenReady().then(async () => {
  remoteMain.initialize();
  tray = new Tray(path.join(__dirname, '../../assets/img/icon.png'));
  const autoLauncher = new AutoLaunch({ name: 'AirplaneRadarWidget' });
  autoLauncher.enable();

  createWidgetWindow();
  registerShortcuts(widgetWindow);

  // Atualiza aviões a cada 30 segundos
  setInterval(async () => {
    console.log("[DEBUG] Performing periodic check for nearby planes...");
    const planes = await checkNearbyPlanes(userLocation);
    if (widgetWindow) {
      widgetWindow.webContents.send('update-planes', planes);
    }
    if (planes[0]) {
      new Notification({
        title: planes[0].title,
        body: planes[0].body
      }).show();
    }
  }, 30000);
});

app.on('will-quit', () => {
  unregisterShortcuts();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
