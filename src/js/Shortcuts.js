const { globalShortcut } = require('electron');
const { log, warn, error } = require('./Logger');

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
      const success = globalShortcut.register(combo, () => {
        if (widgetWindow && widgetWindow.webContents) {
          widgetWindow.webContents.send(event);
        }
        log(`[SHORTCUT] Atalho acionado: ${combo} → ${event}`);
      });

      if (!success) {
        warn(`[SHORTCUT] Falha ao registrar atalho: ${combo}`);
      } else {
        log(`[SHORTCUT] Registrado com sucesso: ${combo}`);
      }
    } catch (err) {
      error(`[SHORTCUT] Erro ao registrar atalho "${combo}":`, err);
    }
  });

  log("[SHORTCUT] Atalhos aplicados com base no config:", shortcuts);
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
  log("[SHORTCUT] Todos os atalhos foram desregistrados");
}

module.exports = { applyShortcuts, unregisterShortcuts };
