const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../config/config.json');

const defaultConfig = {
  widget: { x: 20, y: 600, width: 250, height: 430 },
  bubble: { x: 20, y: 600 },
  map: { lat: -16.6809, lon: -49.2539, zoom: 13 }
};

// Garante que o arquivo de config existe e está válido
function ensureConfigFile() {
  try {
    if (!fs.existsSync(configPath)) {
      console.log("[INFO] config.json não encontrado. Criando com padrão...");
      saveConfig(defaultConfig);
    } else {
      const data = fs.readFileSync(configPath);
      const parsed = JSON.parse(data); // Verifica se é válido
      return parsed;
    }
  } catch (err) {
    console.warn("[WARN] config.json inválido ou corrompido. Recriando...");
    saveConfig(defaultConfig);
  }
  return defaultConfig;
}

// Carrega a configuração
function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath);
    return JSON.parse(raw);
  } catch (err) {
    console.error("[ERROR] Falha ao carregar config.json:", err);
    return defaultConfig;
  }
}

// Salva a configuração
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("[ERROR] Falha ao salvar config.json:", err);
  }
}

module.exports = {
  ensureConfigFile,
  loadConfig,
  saveConfig,
  defaultConfig
};
