// shortcuts.js

const { globalShortcut } = require('electron');

function registerShortcuts(widgetWindow) {

 // 1. Zoom In: Ctrl+=, Ctrl+Shift+=, Ctrl+Plus, Ctrl+Shift+I
 globalShortcut.register('CommandOrControl+=', () => {
    if (widgetWindow) widgetWindow.webContents.send('shortcut-zoomin');
  });
  globalShortcut.register('CommandOrControl+Plus', () => {
    if (widgetWindow) widgetWindow.webContents.send('shortcut-zoomin');
  });
  globalShortcut.register('CommandOrControl+Shift+=', () => {
    if (widgetWindow) widgetWindow.webContents.send('shortcut-zoomin');
  });
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (widgetWindow) widgetWindow.webContents.send('shortcut-zoomin');
  });

  // 2. Zoom Out: Ctrl+-, Ctrl+Shift+O
  globalShortcut.register('CommandOrControl+-', () => {
    if (widgetWindow) widgetWindow.webContents.send('shortcut-zoomout');
  });
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (widgetWindow) widgetWindow.webContents.send('shortcut-zoomout');
  });

  // 3. Forçar refresh agora (Ctrl + R)
  globalShortcut.register('CommandOrControl+R', () => {
    if (widgetWindow) widgetWindow.webContents.send('shortcut-refresh-now');
  });

  // 4. Minimizar/maximizar (Ctrl + M)
  globalShortcut.register('CommandOrControl+M', () => {
    if (widgetWindow && widgetWindow.isVisible()) {
      widgetWindow.webContents.send('shortcut-minimize-to-bubble');
    } else if (widgetWindow && !widgetWindow.isVisible()) {
      widgetWindow.webContents.send('shortcut-restore-from-bubble');
    }
  });
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterShortcuts };
