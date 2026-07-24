// src/js/Bubble.js
const api = window.api;

const bubble = document.getElementById("bubble");
const icon   = document.getElementById("bubble-icon");

/* ────────────────────────────────  Estilo  ─────────────────────────────── */
function applyBubbleStyle(config) {
    const size = config?.bubble?.size || 60;
    bubble.style.width      = `${size}px`;
    bubble.style.height     = `${size}px`;
    bubble.style.background = config?.bubble?.color || "#1982d2";
    icon.style.color        = config?.bubble?.iconColor || "#ffffff";
}

api.invoke("get-config")
   .then(applyBubbleStyle)
   .catch(err => console.error("[BUBBLE] Falha ao carregar config:", err));

// Reage a mudanças feitas na tela de Configurações sem precisar reabrir
api.on("apply-style", applyBubbleStyle);

/* ────────────────────────────────  Arrasto  ────────────────────────────── */
let dragging = false;
let offsetX  = 0;
let offsetY  = 0;
let rafId    = null;
let pending  = null;

bubble.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    dragging = true;
    offsetX  = e.clientX;
    offsetY  = e.clientY;
    document.body.style.cursor = "grabbing";
});

document.addEventListener("mousemove", e => {
    if (!dragging) return;

    pending = {
        x: window.screenX + (e.clientX - offsetX),
        y: window.screenY + (e.clientY - offsetY)
    };

    // Coalesce por frame: mousemove dispara mais rápido que o repaint,
    // e cada envio é um round-trip de IPC.
    if (rafId === null) {
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (pending) {
                api.send("move-bubble", pending);
                pending = null;
            }
        });
    }
});

document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";

    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    if (pending) {
        api.send("move-bubble", pending);
        pending = null;
    }

    // Grava no disco uma única vez, ao soltar
    api.send("save-bubble-position");
});

// Se o mouse sair da janela com o botão pressionado, encerra o arrasto
document.addEventListener("mouseleave", () => {
    if (dragging) document.dispatchEvent(new MouseEvent("mouseup"));
});

/* ─────────────────────────────  Restaurar  ─────────────────────────────── */
bubble.addEventListener("dblclick", () => api.send("restore-from-bubble"));

api.on("shortcut-restore-from-bubble", () => api.send("restore-from-bubble"));