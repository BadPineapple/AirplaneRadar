// src/js/Details.js
const { ipcRenderer } = require('electron');

console.log("Details.js carregado e aguardando telemetria...");

// Função global para o botão de fechar do HTML
window.closeDetails = () => {
    ipcRenderer.send('close-details-window');
};

ipcRenderer.on('display-details', (event, data) => {
    console.log("Dados recebidos no Renderer:", data);

    if (!data) return;

    // Foto e Loader
    const img = document.getElementById('plane-photo');
    const loader = document.getElementById('photo-loader');
    
    if (img) {
        img.classList.remove('loaded');
        img.src = "";
        if (loader) loader.style.display = "block";
    }

    // Preenchimento de Campos
    Object.entries(data).forEach(([key, value]) => {
        const el = document.getElementById(key);
        if (el) {
            el.innerText = (value && value !== "N/A") ? value : "---";
        }
    });

    // Carregar Foto
    if (data.photo && img) {
        img.src = data.photo;
        img.onload = () => {
            img.classList.add('loaded');
            if (loader) loader.style.display = "none";
        };
    }
});

// Sincronizar tema
ipcRenderer.on("apply-style", (event, config) => {
    if (config.widget?.titlecolor) {
        document.documentElement.style.setProperty('--accent', config.widget.titlecolor);
    }
});