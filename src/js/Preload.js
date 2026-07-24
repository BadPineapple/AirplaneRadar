// src/js/preload.js
const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Eventos que o main pode enviar ao renderer
const RECEIVE = new Set([
    "update-planes", "apply-style", "load-icao",
    "shortcut-zoomin", "shortcut-zoomout", "shortcut-refresh-now",
    "shortcut-minimize-to-bubble", "shortcut-restore-from-bubble"
]);

// Mensagens fire-and-forget do renderer para o main
const SEND = new Set([
    "quit-app", "minimize-to-bubble", "restore-from-bubble", "open-settings",
    "save-map-config", "manual-location-changed",
    "move-bubble", "save-bubble-position",
    "open-details-window", "close-details-window", "save-details-position",
    "update-config", "apply-style"
]);

// Rotas com resposta
const INVOKE = new Set([
    "get-config", "get-paths", "get-opensky-credentials",
    "fetch-plane-details-direct", "list-sounds", "add-sound"
]);

contextBridge.exposeInMainWorld("api", {
    send: (channel, payload) => {
        if (!SEND.has(channel)) throw new Error(`Canal bloqueado: ${channel}`);
        ipcRenderer.send(channel, payload);
    },

    invoke: (channel, payload) => {
        if (!INVOKE.has(channel)) throw new Error(`Canal bloqueado: ${channel}`);
        return ipcRenderer.invoke(channel, payload);
    },

    on: (channel, callback) => {
        if (!RECEIVE.has(channel)) throw new Error(`Canal bloqueado: ${channel}`);
        // Descarta o objeto `event` — expor sender/ports ao renderer anula o isolamento
        const wrapped = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.removeListener(channel, wrapped);
    },

    // Electron 32+ removeu File.path; esta é a substituição oficial
    getFilePath: (file) => {
        try { return webUtils.getPathForFile(file); }
        catch { return null; }
    }
});