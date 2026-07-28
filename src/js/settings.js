// src/js/settings.js
document.addEventListener("DOMContentLoaded", async () => {
  const api = window.api;

  const log   = (...a) => console.log("[SETTINGS]", ...a);
  const warn  = (...a) => console.warn("[SETTINGS]", ...a);
  const error = (...a) => console.error("[SETTINGS]", ...a);

  let config = {};

  /* ═══════════════════════════  NAVEGAÇÃO POR ABAS  ═══════════════════════ */
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.remove("hidden");
    });
  });

  /* ═════════════════════════════  SONS (via IPC)  ═════════════════════════ */
  // O renderer não tem mais `fs`. A listagem e a cópia acontecem no main.

  async function refreshSoundSelects(keepSelection = true) {
    const selects = ["alert-general", "alert-favorite"]
      .map(id => document.getElementById(id))
      .filter(Boolean);

    const previous = selects.map(sel => sel.value);

    let files = [];
    try {
      files = await api.invoke("list-sounds");
    } catch (e) {
      warn("Não foi possível listar os sons:", e.message);
    }

    selects.forEach((sel, i) => {
      sel.textContent = "";
      files.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f;
        sel.appendChild(opt);
      });
      if (keepSelection && previous[i] && files.includes(previous[i])) {
        sel.value = previous[i];
      }
    });

    return files;
  }

  /**
   * Handler único de upload — antes havia dois blocos duplicados,
   * um usando `PATHS.userSounds` e outro uma variável `soundDir` inexistente.
   */
  async function handleSoundFile(file) {
    if (!file || !file.name.toLowerCase().endsWith(".mp3")) {
      alert("Apenas arquivos .mp3 são permitidos.");
      return;
    }

    // Electron 32+ removeu File.path; webUtils.getPathForFile é o substituto
    const sourcePath = api.getFilePath(file);
    if (!sourcePath) {
      alert("Não foi possível ler o caminho do arquivo.");
      return;
    }

    try {
      const res = await api.invoke("add-sound", { sourcePath, fileName: file.name });
      if (!res.ok) {
        error("Falha no upload:", res.message);
        alert(`Erro ao adicionar o som: ${res.message}`);
        return;
      }
      await refreshSoundSelects();
      document.getElementById("alert-general").value = file.name;
      log("Som adicionado:", file.name);
      alert("Arquivo de som adicionado com sucesso!");
    } catch (e) {
      error("Erro no IPC add-sound:", e.message);
      alert("Erro ao adicionar o arquivo.");
    }
  }

  const dropZone = document.getElementById("sound-drop-zone");
  if (dropZone) {
    ["dragover", "dragleave", "drop"].forEach(ev =>
      dropZone.addEventListener(ev, e => {
        e.preventDefault();
        dropZone.classList.toggle("dragover", ev === "dragover");
      })
    );
    dropZone.addEventListener("drop", e => handleSoundFile(e.dataTransfer.files[0]));
  }

  const uploadInput = document.getElementById("upload-sound");
  if (uploadInput) {
    uploadInput.addEventListener("change", async e => {
      await handleSoundFile(e.target.files[0]);
      e.target.value = "";   // permite reenviar o mesmo arquivo
    });
  }

  /* ══════════════════════════  CAPTURA DE ATALHOS  ════════════════════════ */

  /* CORRIGIDO: `e.key.toUpperCase()` gerava "ARROWUP", "ESCAPE", "ENTER" —
     nenhum é acelerador válido no Electron. O atalho era aceito pela
     validação, rejeitado pelo globalShortcut e morria sem aviso. */
  const KEY_MAP = {
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    " ": "Space", Escape: "Esc", Enter: "Return", "+": "Plus",
    PageUp: "PageUp", PageDown: "PageDown"
  };

  const NAMED_KEYS = new Set([
    "Up", "Down", "Left", "Right", "Space", "Esc", "Return", "Plus", "Tab",
    "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown"
  ]);

  function normalizeKey(e) {
    if (KEY_MAP[e.key]) return KEY_MAP[e.key];
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) return e.key;   // F1..F24
    if (NAMED_KEYS.has(e.key)) return e.key;
    if (e.key.length === 1) return e.key.toUpperCase();
    return null;
  }

  function bindShortcutInput(id) {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener("focus", () => (input.value = ""));
    input.addEventListener("keydown", e => {
      e.preventDefault();
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

      const key = normalizeKey(e);
      if (!key) return;

      const combo = [];
      if (e.ctrlKey || e.metaKey) combo.push("Ctrl");
      if (e.shiftKey)             combo.push("Shift");
      if (e.altKey)               combo.push("Alt");
      combo.push(key);

      input.value = combo.join("+");
    });
  }

  ["shortcut-zoomin", "shortcut-zoomout", "shortcut-refresh",
   "shortcut-minimize", "shortcut-restore"].forEach(bindShortcutInput);

  function validateShortcuts(sc) {
    const vals = Object.values(sc);

    if (vals.some(v => !v || !v.trim())) {
      alert("Preencha todos os atalhos.");
      return false;
    }
    if (new Set(vals).size !== vals.length) {
      alert("Há atalhos duplicados!");
      return false;
    }

    // Valida a estrutura real de um acelerador: modificadores + tecla final
    for (const v of vals) {
      const parts = v.split("+");
      const finalKey = parts.pop();
      const mods = parts;

      const modsOk = mods.every(m => ["Ctrl", "Shift", "Alt"].includes(m));
      const keyOk  = NAMED_KEYS.has(finalKey)
                  || /^F([1-9]|1[0-9]|2[0-4])$/.test(finalKey)
                  || /^[A-Z0-9]$/.test(finalKey);

      if (!modsOk || !keyOk || mods.length === 0) {
        alert(`Atalho inválido: "${v}".\nUse ao menos um modificador (Ctrl, Shift ou Alt).`);
        return false;
      }
    }
    return true;
  }

  /* ════════════════════════════  SLIDERS AO VIVO  ═════════════════════════ */
  const SLIDERS = {
    "bgopacity":     { label: "opacity-value",     fmt: v => `${Math.round(v * 100)}%` },
    "bubble-size":   { label: "bubble-size-value", fmt: v => `${v}px` },
    "search-radius": { label: "radius-value",      fmt: v => `${v} km` },
    "max-results":   { label: "max-results-value", fmt: v => `${v}` }
  };

  Object.entries(SLIDERS).forEach(([id, { label, fmt }]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", e => {
      document.getElementById(label).textContent = fmt(e.target.value);
    });
  });

  /* ═══════════════════════════  BOTÕES DE RESET  ══════════════════════════ */
  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  const resetMap = {
    "reset-style-btn": () => {
      setValue("bgcolor", "#1e1e1e");
      setValue("map-icon-color", "#ffd700");
      setValue("title-color", "#ffd700");
      setValue("text-color", "#ffffff");
      setValue("bgopacity", 0.6);
      setText("opacity-value", "60%");
      setValue("bubble-color", "#1982d2");
      setValue("bubble-size", 50);
      setText("bubble-size-value", "50px");
      setValue("icon-color", "#ffffff");
      setValue("search-radius", 50);
      setText("radius-value", "50 km");
      setValue("max-results", 5);
      setText("max-results-value", "5");
      document.querySelectorAll('#aircraft-filters input[type="checkbox"]')
        .forEach(cb => (cb.checked = true));
      log("Estilo resetado.");
    },
    "reset-shortcuts-btn": () => {
      setValue("shortcut-zoomin",   "Ctrl+0");
      setValue("shortcut-zoomout",  "Ctrl+9");
      setValue("shortcut-refresh",  "Ctrl+R");
      setValue("shortcut-minimize", "Ctrl+M");
      setValue("shortcut-restore",  "Ctrl+Shift+M");
      log("Atalhos resetados.");
    },
    "reset-accounts-btn": () => {
      setValue("opensky-clientid", "");
      setValue("opensky-clientsecret", "");
      log("Credenciais limpas.");
    }
  };

  Object.entries(resetMap).forEach(([id, fn]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", fn);
  });

  const resetAll = document.getElementById("reset-all-btn");
  if (resetAll) {
    resetAll.addEventListener("click", () => {
      Object.values(resetMap).forEach(fn => fn());
      refreshSoundSelects(false);
      log("Todas as configurações restauradas.");
    });
  }

  /* ═══════════════════════════  CARREGAR CONFIG  ══════════════════════════ */
  try {
    config = await api.invoke("get-config");

    const w  = config.widget    || {};
    const b  = config.bubble    || {};
    const s  = config.search    || {};
    const a  = config.alert     || {};
    const sc = config.shortcuts || {};

    setValue("bgcolor", w.bgColor || "#1e1e1e");
    setValue("map-icon-color", w.mapiconcolor || "#ffd700");
    setValue("title-color", w.titlecolor || "#ffd700");
    setValue("text-color", w.textcolor || "#ffffff");
    setValue("bgopacity", w.bgOpacity ?? 0.6);
    setText("opacity-value", `${Math.round((w.bgOpacity ?? 0.6) * 100)}%`);

    setValue("bubble-color", b.color || "#1982d2");
    setValue("bubble-size", b.size || 50);
    setText("bubble-size-value", `${b.size || 50}px`);
    setValue("icon-color", b.iconColor || "#ffffff");

    setValue("search-radius", s.radius ?? 50);
    setText("radius-value", `${s.radius ?? 50} km`);
    setValue("max-results", s.maxResults ?? 5);
    setText("max-results-value", `${s.maxResults ?? 5}`);

    const allowed = s.filters || ["comercial", "privado", "militar", "helicoptero", "outros"];
    document.querySelectorAll('#aircraft-filters input[type="checkbox"]')
      .forEach(cb => (cb.checked = allowed.includes(cb.value)));

    // Sons: aguarda a lista antes de selecionar — o setTimeout(200) anterior
    // era corrida e falhava em disco lento.
    const files = await refreshSoundSelects(false);
    if (files.includes(a.general))  setValue("alert-general", a.general);
    if (files.includes(a.favorite)) setValue("alert-favorite", a.favorite);

    setValue("shortcut-zoomin",   sc.zoomin   || "Ctrl+0");
    setValue("shortcut-zoomout",  sc.zoomout  || "Ctrl+9");
    setValue("shortcut-refresh",  sc.refresh  || "Ctrl+R");
    setValue("shortcut-minimize", sc.minimize || "Ctrl+M");
    setValue("shortcut-restore",  sc.restore  || "Ctrl+Shift+M");

    // Credenciais vêm decifradas por rota dedicada (safeStorage)
    const cred = await api.invoke("get-opensky-credentials");
    setValue("opensky-clientid", cred.client_id || "");
    setValue("opensky-clientsecret", cred.client_secret || "");

    log("Configurações carregadas.");
  } catch (e) {
    error("Falha ao carregar configurações:", e.message);
    alert("Não foi possível carregar as configurações.");
  }

  /* ═══════════════════════════════  SALVAR  ═══════════════════════════════ */
  const saveBtn = document.getElementById("save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const newShortcuts = {
        zoomin:   document.getElementById("shortcut-zoomin").value,
        zoomout:  document.getElementById("shortcut-zoomout").value,
        refresh:  document.getElementById("shortcut-refresh").value,
        minimize: document.getElementById("shortcut-minimize").value,
        restore:  document.getElementById("shortcut-restore").value
      };
      if (!validateShortcuts(newShortcuts)) return;

      const filters = [...document.querySelectorAll('#aircraft-filters input[type="checkbox"]')]
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      if (filters.length === 0) {
        alert("Selecione ao menos um tipo de aeronave, senão o radar ficará vazio.");
        return;
      }

      const updated = {
        widget: {
          bgColor:      document.getElementById("bgcolor").value,
          mapiconcolor: document.getElementById("map-icon-color").value,
          titlecolor:   document.getElementById("title-color").value,
          textcolor:    document.getElementById("text-color").value,
          bgOpacity:    parseFloat(document.getElementById("bgopacity").value)
        },
        bubble: {
          color:     document.getElementById("bubble-color").value,
          size:      parseInt(document.getElementById("bubble-size").value, 10),
          iconColor: document.getElementById("icon-color").value
        },
        search: {
          radius: parseInt(document.getElementById("search-radius").value, 10),
          maxResults: parseInt(document.getElementById("max-results").value, 10),
          filters
        },
        alert: {
          general:  document.getElementById("alert-general").value,
          favorite: document.getElementById("alert-favorite").value
        },
        shortcuts: newShortcuts,
        accounts: {
          opensky: {
            client_id:     document.getElementById("opensky-clientid").value.trim(),
            client_secret: document.getElementById("opensky-clientsecret").value.trim()
          }
        }
      };

      // O main faz deepMerge e retransmite `apply-style` com o config completo.
      // Não é preciso mais enviar spread de `config.widget` nem `apply-style` aqui.
      api.send("update-config", updated);
      log("Configurações salvas.");
      window.close();
    });
  }

  const cancelBtn = document.getElementById("cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => window.close());
});