/* ─────────────────────────────  Logger.js  ──────────────────────────────── */
const fs = require("fs");
const path = require("path");

// Definimos o local dos logs relativo à raiz do projeto
const logDir = path.resolve(__dirname, "../../logs");
const logFile = path.join(logDir, "runtime.log");

/**
 * Garante que o diretório de logs exista.
 * Usamos try/catch para evitar crash se o sistema de arquivos estiver travado.
 */
function ensureLogDir() {
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    } catch (e) {
        console.error("[LOGGER] Não foi possível criar pasta de logs:", e.message);
    }
}

/**
 * Formata os argumentos para uma string legível.
 * Especialmente útil para capturar mensagens de erro completas (stack trace).
 */
function formatArgs(args) {
    return args.map(arg => {
        if (arg instanceof Error) return arg.stack; // Captura o erro com stack trace
        if (typeof arg === "object") return JSON.stringify(arg, null, 2);
        return String(arg);
    }).join(" ");
}

/**
 * Escrita em arquivo (Append)
 */
function append(level, ...args) {
    ensureLogDir();
    
    const now = new Date();
    const timestamp = now.toLocaleString('pt-BR', { timeZoneName: 'short' });
    const message = formatArgs(args);
    const logLine = `[${timestamp}] [${level}] ${message}\n`;

    try {
        // Usamos appendFileSync pela simplicidade no processo principal
        fs.appendFileSync(logFile, logLine, "utf8");
    } catch (e) {
        console.error("[LOGGER] Falha crítica ao gravar log no disco:", e.message);
    }
}

/* ────────────────────────── API PÚBLICA ────────────────────────── */

module.exports = {
    log: (...args) => {
        console.log(...args);
        append("INFO", ...args);
    },
    warn: (...args) => {
        console.warn(...args);
        append("WARN", ...args);
    },
    error: (...args) => {
        console.error(...args);
        append("ERROR", ...args);
    },
    // Atalho para registrar o início de uma nova sessão no arquivo
    initSession: () => {
        const separator = "\n" + "=".repeat(50) + "\n";
        append("SYSTEM", `${separator} NOVA SESSÃO INICIADA ${separator}`);
    }
};