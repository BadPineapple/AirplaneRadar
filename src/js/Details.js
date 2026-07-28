// src/js/Details.js
// NÃO redeclarar `api`: contextBridge.exposeInMainWorld cria window.api como
// propriedade não configurável. `const api = window.api` colide com ela e
// lança SyntaxError ("Identifier 'api' has already been declared"), que
// invalida o script inteiro antes mesmo da primeira linha rodar.
console.log("Details.js carregado e aguardando código ICAO...");

/* ─────────────────────────  Controles da janela  ───────────────────────── */
document.getElementById("close-btn")
        .addEventListener("click", () => api.send("close-details-window"));

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") api.send("close-details-window");
});

document.addEventListener("mouseup", () => api.send("save-details-position"));

let currentIcao = null;

document.getElementById("favorite-btn").addEventListener("click", async () => {
    if (!currentIcao) return;
    try {
        const { favorite } = await api.invoke("toggle-favorite", currentIcao);
        setFavoriteBtn(favorite);
    } catch (err) {
        console.error("[DETAILS] Falha ao favoritar:", err.message);
    }
});

function setFavoriteBtn(isFavorite) {
    const btn = document.getElementById("favorite-btn");
    if (!btn) return;
    btn.classList.toggle("favorite", !!isFavorite);
    const icon = btn.querySelector("i");
    if (icon) icon.className = isFavorite ? "fa-solid fa-star" : "fa-regular fa-star";
}

api.on('load-icao', async (payload) => {
    const { icao24, callsign } = typeof payload === "string" ? { icao24: payload, callsign: null } : (payload || {});
    currentIcao = icao24;

    resetUI();
    const loader = document.getElementById('photo-loader');
    if (loader) { loader.style.display = "block"; loader.innerText = "BAIXANDO DADOS..."; }

    try {
        const data = await api.invoke('fetch-plane-details-direct', { icao24, callsign });
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

    ["route_origin", "route_destination"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = "---";
    });

    setFavoriteBtn(false);
}

function formatAirport(a) {
    if (!a) return "---";
    const code = a.iata || a.icao;
    return code ? (a.city ? `${code} • ${a.city}` : code) : "---";
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

    const originEl = document.getElementById("route_origin");
    if (originEl) originEl.innerText = formatAirport(data.route?.origin);
    const destEl = document.getElementById("route_destination");
    if (destEl) destEl.innerText = formatAirport(data.route?.destination);

    setFavoriteBtn(data.favorite);

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

// Sincroniza com o mesmo tema do widget principal (config.widget)
function applyStyle(config) {
    const w = config?.widget || {};
    const root = document.documentElement.style;

    const titleColor = w.titlecolor || "#ffd700";
    root.setProperty("--accent", titleColor);
    root.setProperty("--title-color", titleColor);
    root.setProperty("--text-color", w.textcolor || "#ffffff");

    const hex = (w.bgColor || "#1e1e1e").replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const opacity = w.bgOpacity ?? 0.6;
    root.setProperty("--bg-color", `rgba(${r}, ${g}, ${b}, ${opacity})`);
}

api.on("apply-style", applyStyle);