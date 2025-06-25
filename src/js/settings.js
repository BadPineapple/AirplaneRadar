document.addEventListener("DOMContentLoaded", () => {
  /* eslint-disable no-console */
  const { ipcRenderer } = require("electron");
  const fs   = require("fs");
  const path = require("path");

  // --- helper de log (pode trocar por seu Logger.js, se quiser) --------------
  function log(...args)   { console.log("[SETTINGS]", ...args); }
  function warn(...args)  { console.warn("[SETTINGS]", ...args); }
  function error(...args) { console.error("[SETTINGS]", ...args); }
  // --------------------------------------------------------------------------

  let config = {};

  /* ─────────────────────────────  Navegação por abas  ────────────────────── */
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b  => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      document.getElementById(tabId).classList.remove("hidden");
      log("Switched to tab:", tabId);
    });
  });

  /* ───────────────────────────────  Drop-zone mp3  ───────────────────────── */
  const dropZone = document.getElementById("sound-drop-zone");
  if (dropZone) {
    ["dragover", "dragleave"].forEach(ev =>
      dropZone.addEventListener(ev, e => {
        e.preventDefault();
        dropZone.classList.toggle("dragover", ev === "dragover");
      })
    );

    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (!file || !file.name.endsWith(".mp3")) {
        return alert("Apenas arquivos .mp3 são permitidos.");
      }
      const dest = path.join(__dirname, "../../assets/sound", file.name);
      fs.copyFile(file.path, dest, err => {
        if (err) {
          error("Erro ao copiar som:", err);
          return alert("Erro ao copiar o arquivo.");
        }
        log("Som adicionado:", file.name);
        alert("Arquivo de som adicionado com sucesso!");
        refreshSoundSelects();
      });
    });
  }

  /* ─────────────────────────────  Funções auxiliares  ────────────────────── */
  const soundDir = path.join(__dirname, "../../assets/sound");

  function getMp3Files() {
    try { return fs.readdirSync(soundDir).filter(f => f.endsWith(".mp3")); }
    catch (e) { warn("Não foi possível ler a pasta de sons:", e); return []; }
  }

  function refreshSoundSelects() {
    const selects = ["alert-general", "alert-favorite"].map(id => document.getElementById(id));
    selects.forEach(sel => (sel.innerHTML = ""));         // limpa
    getMp3Files().forEach(file => {
      selects.forEach(sel => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = file;
        sel.appendChild(opt);
      });
    });
  }

  /* ──────────────────────  Shortcuts → captura de teclas  ────────────────── */
  function bindShortcutInput(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("focus", () => (input.value = ""));
    input.addEventListener("keydown", e => {
      e.preventDefault();
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

      const combo = [];
      if (e.ctrlKey || e.metaKey) combo.push("Ctrl");
      if (e.shiftKey)            combo.push("Shift");
      if (e.altKey)              combo.push("Alt");

      let key = e.key === " " ? "Space" : e.key.toUpperCase();
      combo.push(key);
      input.value = combo.join("+");
      setTimeout(() => input.focus(), 10);
    });
  }

  ["shortcut-zoomin","shortcut-zoomout","shortcut-refresh",
   "shortcut-minimize","shortcut-restore"].forEach(bindShortcutInput);

  /* ─────────────────────────────── Validar atalhos ───────────────────────── */
  function validateShortcuts(sc) {
    const vals = Object.values(sc);
    if (vals.some(v => !v.trim()))            { alert("Preencha todos os atalhos."); return false; }
    if (new Set(vals).size !== vals.length)   { alert("Há atalhos duplicados!");     return false; }
    if (vals.some(v => !/^[A-Za-z0-9+ ]{2,}$/.test(v))) {
      alert("Atalhos inválidos detectados."); return false;
    }
    return true;
  }

  /* ─────────────────────────────  Botões RESET seção  ────────────────────── */
  const resetMap = {
    "reset-style-btn": () => {
      Object.assign(document.getElementById("bgcolor"),         { value: "#1e1e1e" });
      Object.assign(document.getElementById("map-icon-color"),  { value: "#ffd700" });
      Object.assign(document.getElementById("title-color"),     { value: "#ffd700" });
      Object.assign(document.getElementById("text-color"),      { value: "#ffffff" });
      Object.assign(document.getElementById("bgopacity"),       { value: 0.6 });
      document.getElementById("opacity-value").innerText       = "60%";
      Object.assign(document.getElementById("bubble-color"),    { value: "#1982d2" });
      Object.assign(document.getElementById("bubble-size"),     { value: 50 });
      document.getElementById("bubble-size-value").innerText   = "50px";
      Object.assign(document.getElementById("icon-color"),      { value: "#ffffff" });
      log("Estilo resetado para padrão.");
    },
    "reset-shortcuts-btn": () => {
      document.getElementById("shortcut-zoomin").value   = "Ctrl+0";
      document.getElementById("shortcut-zoomout").value  = "Ctrl+9";
      document.getElementById("shortcut-refresh").value  = "Ctrl+R";
      document.getElementById("shortcut-minimize").value = "Ctrl+M";
      document.getElementById("shortcut-restore").value  = "Ctrl+Shift+M";
      log("Atalhos resetados.");
    },
    "reset-accounts-btn": () => {
      document.getElementById("opensky-clientid").value     = "";
      document.getElementById("opensky-clientsecret").value = "";
      log("Credenciais OpenSky limpas.");
    },
    "reset-all-btn": () => {          // chama os três acima
      Object.keys(resetMap).filter(k => k !== "reset-all-btn").forEach(k => resetMap[k]());
      refreshSoundSelects();
      log("TODAS as configurações foram restauradas para padrão.");
    }
  };

  // Liga cada botão ao respectivo reset
  Object.keys(resetMap).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", resetMap[id]);
  });

  /* ───────────────────────────  Upload de som (input)  ───────────────────── */
  const uploadInput = document.getElementById("upload-sound");
  if (uploadInput) {
    uploadInput.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file || !file.name.endsWith(".mp3")) {
        return alert("Selecione um arquivo .mp3 válido.");
      }
      const dest = path.join(soundDir, file.name);
      fs.copyFile(file.path, dest, err => {
        if (err) {
          error("Erro ao copiar som:", err);
          return alert("Erro ao copiar.");
        }
        log("Som copiado via <input>: ", file.name);
        alert("Som adicionado com sucesso!");
        refreshSoundSelects();
      });
    });
  }

  /* ───────────────────────────  Carrega configuração  ───────────────────── */
  ipcRenderer.invoke("get-config").then(cfg => {
    config = cfg;
    // --- Preenche UI ---
    const w    = cfg.widget  || {};
    const b    = cfg.bubble  || {};
    const s    = cfg.search  || {};
    const a    = cfg.alert   || {};
    const sc   = cfg.shortcuts || {};
    const acct = cfg.accounts?.opensky || {};

    document.getElementById("bgcolor").value          = w.bgColor  || "#1e1e1e";
    document.getElementById("map-icon-color").value   = w.mapiconcolor || "#ffd700";
    document.getElementById("title-color").value      = w.titlecolor   || "#ffd700";
    document.getElementById("text-color").value       = w.textcolor    || "#ffffff";
    document.getElementById("bgopacity").value        = w.bgOpacity ?? 0.6;
    document.getElementById("opacity-value").innerText= `${Math.round((w.bgOpacity ?? 0.6)*100)}%`;

    document.getElementById("bubble-color").value     = b.color || "#1982d2";
    document.getElementById("bubble-size").value      = b.size  || 50;
    document.getElementById("bubble-size-value").innerText = `${b.size || 50}px`;
    document.getElementById("icon-color").value       = b.iconColor || "#ffffff";

    document.getElementById("search-radius").value    = s.radius ?? 50;
    document.getElementById("radius-value").innerText = `${s.radius ?? 50} km`;

    // Filtros
    const allowed = s.filters || ["comercial","privado","militar","helicoptero","outros"];
    document.querySelectorAll('#aircraft-filters input[type="checkbox"]').forEach(cb => {
      cb.checked = allowed.includes(cb.value);
    });

    // Alertas
    refreshSoundSelects();
    setTimeout(() => {
      document.getElementById("alert-general").value   = a.general  || "notificacao.mp3";
      document.getElementById("alert-favorite").value  = a.favorite || "favorito.mp3";
    }, 200);

    // Atalhos
    document.getElementById("shortcut-zoomin").value   = sc.zoomin   || "Ctrl+0";
    document.getElementById("shortcut-zoomout").value  = sc.zoomout  || "Ctrl+9";
    document.getElementById("shortcut-refresh").value  = sc.refresh  || "Ctrl+R";
    document.getElementById("shortcut-minimize").value = sc.minimize || "Ctrl+M";
    document.getElementById("shortcut-restore").value  = sc.restore  || "Ctrl+Shift+M";

    // Contas
    document.getElementById("opensky-clientid").value     = acct.client_id     || "";
    document.getElementById("opensky-clientsecret").value = acct.client_secret || "";

    log("Configurações carregadas.");
  });

  /* ─────────────────────────────  Sliders dinâmicos  ─────────────────────── */
  ["bgopacity","bubble-size","search-radius"].forEach(id => {
    const label = { "bgopacity":"opacity-value",
                    "bubble-size":"bubble-size-value",
                    "search-radius":"radius-value" }[id];
    document.getElementById(id).addEventListener("input", e => {
      const val = id === "bgopacity" ? Math.round(e.target.value*100)+"%"
               : id === "bubble-size" ? `${e.target.value}px`
               : `${e.target.value} km`;
      document.getElementById(label).innerText = val;
    });
  });

  /* ─────────────────────────────  Botão SALVAR  ──────────────────────────── */
  document.getElementById("save-btn").onclick = () => {
    const newShortcuts = {
      zoomin  : document.getElementById("shortcut-zoomin").value,
      zoomout : document.getElementById("shortcut-zoomout").value,
      refresh : document.getElementById("shortcut-refresh").value,
      minimize: document.getElementById("shortcut-minimize").value,
      restore : document.getElementById("shortcut-restore").value
    };
    if (!validateShortcuts(newShortcuts)) return;

    const updated = {
      widget: {
        ...config.widget,
        bgColor    : document.getElementById("bgcolor").value,
        mapiconcolor: document.getElementById("map-icon-color").value,
        titlecolor : document.getElementById("title-color").value,
        textcolor  : document.getElementById("text-color").value,
        bgOpacity  : parseFloat(document.getElementById("bgopacity").value)
      },
      bubble: {
        ...config.bubble,
        color    : document.getElementById("bubble-color").value,
        size     : parseInt(document.getElementById("bubble-size").value, 10),
        iconColor: document.getElementById("icon-color").value
      },
      search: {
        radius : parseInt(document.getElementById("search-radius").value, 10),
        filters: [...document.querySelectorAll('#aircraft-filters input[type="checkbox"]')]
          .filter(cb => cb.checked).map(cb => cb.value)
      },
      alert: {
        general : document.getElementById("alert-general").value,
        favorite: document.getElementById("alert-favorite").value
      },
      shortcuts: newShortcuts,
      accounts: {
        opensky: {
          client_id    : document.getElementById("opensky-clientid").value.trim(),
          client_secret: document.getElementById("opensky-clientsecret").value.trim()
        }
      }
    };

    ipcRenderer.send("update-config", updated);   // grava no disco
    ipcRenderer.send("apply-style", updated.widget);
    log("Configurações salvas.");
    window.close();
  };

  /* ─────────────────────────────  Botão CANCELAR  ────────────────────────── */
  document.getElementById("cancel-btn").onclick = () => {
    log("Alterações canceladas.");
    window.close();
  };
});
