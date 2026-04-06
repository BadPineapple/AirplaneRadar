/* ─────────────────────────────  Shortcuts.js  ───────────────────────────── */
const { globalShortcut, ipcMain } = require('electron');
const { log, warn, error } = require('./Logger');

/**
 * Aplica os atalhos globais baseados no arquivo de configuração.
 * @param {BrowserWindow} widgetWindow - Referência da janela principal
 * @param {Object} config - Objeto de configuração carregado
 * @param {Function} refreshCallback - Função para disparar o refresh de dados no Main.js
 */
function applyShortcuts(widgetWindow, config, refreshCallback) {
    // Limpa registros anteriores para evitar duplicatas ou vazamento de memória
    globalShortcut.unregisterAll();

    const s = config.shortcuts || {};

    // Mapeamento de combinações e ações
    const shortcutMap = [
        { combo: s.zoomin  || 'CommandOrControl+Equal', event: 'shortcut-zoomin' },
        { combo: s.zoomout || 'CommandOrControl+Minus', event: 'shortcut-zoomout' },
        { combo: s.minimize || 'CommandOrControl+Shift+H', event: 'shortcut-minimize-to-bubble' },
        { combo: s.restore || 'CommandOrControl+Shift+B', event: 'shortcut-restore-from-bubble' },
        { 
            combo: s.refresh || 'CommandOrControl+Shift+R', 
            action: () => {
                log("[SHORTCUT] Refresh forçado via teclado.");
                if (refreshCallback) refreshCallback(); // Chama a função do Main.js
                if (widgetWindow) widgetWindow.webContents.send('shortcut-refresh-now');
            }
        }
    ];

    shortcutMap.forEach(({ combo, event, action }) => {
        try {
            const isRegistered = globalShortcut.register(combo, () => {
                // Se houver uma ação direta (como o refresh), executa ela
                if (action) {
                    action();
                } else if (widgetWindow && !widgetWindow.isDestroyed()) {
                    // Caso contrário, envia o evento para o Renderer (HTML/JS)
                    widgetWindow.webContents.send(event);
                }
                log(`[SHORTCUT] Acionado: ${combo}`);
            });

            if (!isRegistered) {
                warn(`[SHORTCUT] O sistema recusou o atalho: ${combo} (Pode estar em uso por outro app)`);
            }
        } catch (err) {
            error(`[SHORTCUT] Erro fatal ao registrar "${combo}":`, err.message);
        }
    });

    log("[SHORTCUT] Sistema de atalhos inicializado.");
}

function unregisterShortcuts() {
    globalShortcut.unregisterAll();
    log("[SHORTCUT] Todos os atalhos foram removidos.");
}

module.exports = { applyShortcuts, unregisterShortcuts };