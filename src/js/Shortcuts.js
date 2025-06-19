const { globalShortcut } = require('electron');

function applyShortcuts(widgetWindow, config) {
  globalShortcut.unregisterAll();

  const shortcuts = config.shortcuts || {};

  const map = [
    { combo: shortcuts.zoomin || 'CommandOrControl+=', event: 'shortcut-zoomin' },
    { combo: shortcuts.zoomout || 'CommandOrControl+-', event: 'shortcut-zoomout' },
    { combo: shortcuts.refresh || 'CommandOrControl+R', event: 'shortcut-refresh-now' },
    { combo: shortcuts.minimize || 'CommandOrControl+M', event: 'shortcut-minimize-to-bubble' },
    { combo: shortcuts.restore || 'CommandOrControl+Shift+M', event: 'shortcut-restore-from-bubble' }
  ];

  map.forEach(({ combo, event }) => {
    try {
      globalShortcut.register(combo, () => {
        if (widgetWindow && widgetWindow.webContents) {
          widgetWindow.webContents.send(event);
        }
        console.log(`[DEBUG] Shortcut triggered: ${event}`);
      });
    } catch (err) {
      console.warn(`Erro ao registrar atalho "${combo}":`, err);
    }
  });

  console.log("[DEBUG] Shortcuts applied com base no config", shortcuts);
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
  console.log("[DEBUG] Shortcuts unregistered");
}

module.exports = { applyShortcuts, unregisterShortcuts };
