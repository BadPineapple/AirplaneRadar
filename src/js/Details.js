// src/js/Details.js
const api = window.api;

console.log("Details.js carregado e aguardando código ICAO...");

/* ─────────────────────────  Controles da janela  ───────────────────────── */
document.getElementById("close-btn")
        .addEventListener("click", () => api.send("close-details-window"));

document.addEventListener("mouseup", () => api.send("save-details-position"));

api.on('load-icao', async (icao24) => {
    resetUI();
    const loader = document.getElementById('photo-loader');
    if (loader) { loader.style.display = "block"; loader.innerText = "BAIXANDO DADOS..."; }

    try {
        const data = await api.invoke('fetch-plane-details-direct', icao24);
        if (!data) throw new Error("Aeronave não retornou dados.");
        fillUI(data);
    } catch (err) {
        if (loader) loader.innerText = "FALHA NA CONEXÃO";
    }
});

// Limpa a tela antes da nova informação chegar
function resetUI() {
    const img = document.getElementById('plane-photo');
    if (img) {
        img.classList.remove('loaded');
        img.src = "";
    }
    
    // Lista de IDs do HTML
    const fields = ["model", "registration_number", "icaoCode", "plane_owner", "engines_count", "engines_type", "max_speed", "max_range", "length", "wingspan", "height", "plane_class", "plane_age", "Plane_Status", "Production_line", "callsign"];
    
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = "Buscando...";
    });
}

// Preenche os dados reais na tela
function fillUI(data) {
    const img = document.getElementById('plane-photo');
    const loader = document.getElementById('photo-loader');

    Object.entries(data).forEach(([key, value]) => {
        const el = document.getElementById(key);
        if (el) {
            el.innerText = (value && value !== "N/A" && value !== "") ? value : "---";
        }
    });

    if (data.photo && img) {
        img.src = data.photo;
        img.onload = () => {
            img.classList.add('loaded');
            if (loader) loader.style.display = "none";
        };
        img.onerror = () => {
            if (loader) loader.innerText = "IMAGEM INDISPONÍVEL";
        };
    } else if (loader) {
        loader.innerText = "SEM IMAGEM REGISTRADA";
    }
}

// Sincronizar tema
api.on("apply-style", (config) => {
    if (config.widget?.titlecolor) {
        document.documentElement.style.setProperty('--accent', config.widget.titlecolor);
    }
});