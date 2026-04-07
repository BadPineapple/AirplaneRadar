// src/js/ConfigManager.js
const fs = require('fs');
const path = require('path');
const { log, warn, error } = require('./Logger');

// Caminho absoluto para a pasta de configuração
const configDir = path.join(__dirname, '../../config');
const configPath = path.join(configDir, 'config.json');

// Padrões robustos (incluindo o que usamos nos outros arquivos)
const defaultConfig = {
    widget: { 
        x: 20, 
        y: 600, 
        width: 275, 
        height: 430 
    },
    bubble: { 
        x: 20, 
        y: 600 
    },
    map: { 
        lat: -16.6809,
        lon: -49.2539, 
        zoom: 13 
    },
    search: {
        radius: 50,
        filters: ["comercial", "privado", "militar", "helicoptero"]
    },
    accounts: {
        opensky: {
            client_id: "",
            client_secret: ""
        }
    }
};

/**
 * Garante que a pasta e o arquivo existam.
 * Faz um "merge" para garantir que chaves novas existam sem apagar as antigas.
 */
function ensureConfigFile() {
    try {
        // 1. Garante que a pasta 'config' existe
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
            log("[CONFIG] Pasta de configuração criada.");
        }

        // 2. Se o arquivo não existe, cria com o padrão
        if (!fs.existsSync(configPath)) {
            log("[CONFIG] Arquivo config.json não encontrado. Criando padrão...");
            saveConfig(defaultConfig);
            return defaultConfig;
        }

        // 3. Se existe, lê e garante que todas as chaves novas estão lá (Deep Merge simples)
        const data = fs.readFileSync(configPath, 'utf8');
        const userConfig = JSON.parse(data);
        
        // Unir as chaves do padrão com as do usuário (preservando o que o usuário já alterou)
        const mergedConfig = {
            ...defaultConfig,
            ...userConfig,
            widget: { ...defaultConfig.widget, ...userConfig.widget },
            map: { ...defaultConfig.map, ...userConfig.map },
            accounts: { ...defaultConfig.accounts, ...userConfig.accounts }
        };

        return mergedConfig;
    } catch (err) {
        warn("[CONFIG] Erro ao validar config. Recriando padrão...", err.message);
        saveConfig(defaultConfig);
        return defaultConfig;
    }
}

function loadConfig() {
    try {
        const raw = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        error("[CONFIG] Falha ao carregar. Usando defaults.", err.message);
        return defaultConfig;
    }
}

function saveConfig(config) {
    try {
        // Salva com indentação de 2 espaços para ser legível por humanos
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        log("[CONFIG] Configuração persistida no disco.");
    } catch (err) {
        error("[CONFIG] Erro fatal ao salvar arquivo:", err);
    }
}

module.exports = {
    ensureConfigFile,
    loadConfig,
    saveConfig,
    defaultConfig
};