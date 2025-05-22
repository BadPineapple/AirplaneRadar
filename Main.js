const { app, Tray, Notification, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const remoteMain = require('@electron/remote/main');
const { checkNearbyPlanes, getLocationByIP } = require('./Background');
const { registerShortcuts, unregisterShortcuts } = require('./Atalhos');

const configPath = path.join(__dirname, 'config.json');

// Utilitários para config
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath));
    }
  } catch (e) {}
  return {
    widget: { x: 20, y: 600, width: 250, height: 430 },
    bubble: { x: 20, y: 600 },
    map: { lat: -16.6809, lon: -49.2539, zoom: 13 }
  };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) { }
}

let tray = null;
let widgetWindow = null;
let bubbleWindow = null;
let config = loadConfig();
let userLocation = { lat: config.map.lat, lon: config.map.lon }; // Inicial pela config

// --- IPC: Widget pede config para iniciar ---
ipcMain.handle('get-config', () => config);

// --- IPC: Widget envia nova posição/zoom do mapa ---
ipcMain.on('save-map-config', (event, mapCfg) => {
  config.map = mapCfg;
  saveConfig(config);
  // Atualiza também para o radar buscar sempre do centro salvo
  userLocation = { lat: mapCfg.lat, lon: mapCfg.lon };
});

// --- IPC: Widget envia nova localização manual (ex: pino) ---
ipcMain.on('manual-location-changed', (event, newLoc) => {
  userLocation = { lat: newLoc.lat, lon: newLoc.lon };
  // Salva também no config.map para persistência
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
  widgetWindow.loadFile('widget.html');

  // Salva posição ao mover
  widgetWindow.on('move', () => {
    let [x, y] = widgetWindow.getPosition();
    config.widget.x = x;
    config.widget.y = y;
    saveConfig(config);
  });

  // Salva tamanho (caso um dia queira deixar redimensionável)
  widgetWindow.on('resize', () => {
    let [width, height] = widgetWindow.getSize();
    config.widget.width = width;
    config.widget.height = height;
    saveConfig(config);
  });
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
  bubbleWindow.loadFile('bubble.html');
  bubbleWindow.on('closed', () => { bubbleWindow = null; });
}

app.whenReady().then(async () => {
  remoteMain.initialize();
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const autoLauncher = new AutoLaunch({ name: 'AirplaneRadarWidget' });
  autoLauncher.enable();

  createWidgetWindow();
  registerShortcuts(widgetWindow);

  // Atualiza aviões a cada 30 segundos
  setInterval(async () => {
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
