/* ─────────────────────────────  Logger.js  ──────────────────────────────── */
const fs   = require("fs");
const path = require("path");

/* 1️⃣  Onde salvar?  ---------------------------------------------------------
   • Quando o código roda NO processo principal ou em qualquer módulo Node,
     `require("electron").app` existe (dev ou build).  
   • Num renderer sem contexto Node puro você pode usar
     `require("@electron/remote").app` se precisar.
*/


const logDir = path.join(__dirname, "../../logs");
const logFile = path.join(logDir, "runtime.log");

/* 2️⃣  Garante pasta -------------------------------------------------------- */
try { fs.mkdirSync(logDir, { recursive: true }); }
catch (e) { console.error("[LOGGER] mkdir falhou:", e); }

/* 3️⃣  Escrita segura ------------------------------------------------------- */
function append(level, ...args) {
  const ts   = new Date().toISOString().replace("T", " ").substring(0,19);
  const line = args
    .map(a => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  try {
    fs.appendFileSync(logFile, `[${ts}] [${level}] ${line}\n`, "utf8");
  } catch (e) {
    console.error("[LOGGER] Falha ao gravar log:", e);
  }
}

/* 4️⃣  API pública ---------------------------------------------------------- */
module.exports = {
  log  : (...a)=>{ console.log (...a); append("LOG",  ...a); },
  warn : (...a)=>{ console.warn(...a); append("WARN", ...a); },
  error: (...a)=>{ console.error(...a); append("ERROR",...a); },
  logToFile: append                                                // caso precise direto
};
