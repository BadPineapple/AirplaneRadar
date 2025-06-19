
document.addEventListener('DOMContentLoaded', () => {
  const { ipcRenderer } = require('electron');
  const fs = require('fs');
  const path = require('path');

  let config = {};

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.remove('hidden');
    });
  });

  const dropZone = document.getElementById('sound-drop-zone');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.mp3')) {
      alert('Apenas arquivos .mp3 são permitidos.');
      return;
    }

    const destPath = path.join(__dirname, '../../assets/sound', file.name);
    fs.copyFile(file.path, destPath, (err) => {
      if (err) {
        alert('Erro ao copiar o arquivo.');
        console.error(err);
      } else {
        alert('Arquivo de som adicionado com sucesso!');
        // Atualiza os selects
        document.getElementById('alert-general').innerHTML = '';
        document.getElementById('alert-favorite').innerHTML = '';
        loadSoundOptions();
      }
    });
  });

  function loadSoundOptions() {
    const soundDir = path.join(__dirname, '../../assets/sound');
    let files = [];

    try {
      files = fs.readdirSync(soundDir).filter(f => f.endsWith('.mp3'));
    } catch (e) {
      console.warn('Não foi possível ler a pasta de sons:', e);
    }

    const generalSelect = document.getElementById('alert-general');
    const favSelect = document.getElementById('alert-favorite');

    files.forEach(file => {
      const option1 = document.createElement('option');
      const option2 = document.createElement('option');

      option1.value = file;
      option1.textContent = file;

      option2.value = file;
      option2.textContent = file;

      generalSelect.appendChild(option1);
      favSelect.appendChild(option2);
    });
  }

  function bindShortcutInput(id) {
    const input = document.getElementById(id);

    input.addEventListener('focus', () => {
      input.value = '';
    });

    input.addEventListener('keydown', (e) => {
      e.preventDefault();

      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

      const combo = [];
      if (e.ctrlKey || e.metaKey) combo.push('Ctrl');
      if (e.shiftKey) combo.push('Shift');
      if (e.altKey) combo.push('Alt');

      let key = e.key;
      if (key === ' ') key = 'Space';
      else if (key.length === 1) key = key.toUpperCase();

      combo.push(key);
      input.value = combo.join('+');

      setTimeout(() => input.focus(), 10);
    });
  }

  [
    'shortcut-zoomin',
    'shortcut-zoomout',
    'shortcut-refresh',
    'shortcut-minimize',
    'shortcut-restore'
  ].forEach(bindShortcutInput);

  function validateShortcuts(shortcuts) {
    const values = Object.values(shortcuts);

    if (values.some(v => !v || v.trim() === '')) {
      alert('Todos os atalhos devem ser preenchidos.');
      return false;
    }

    const duplicates = values.filter((item, index) => values.indexOf(item) !== index);
    if (duplicates.length > 0) {
      alert(`Atalhos duplicados encontrados: ${[...new Set(duplicates)].join(', ')}`);
      return false;
    }

    const invalids = values.filter(v => !/^[A-Za-z0-9+ ]{2,}$/.test(v));
    if (invalids.length > 0) {
      alert(`Atalhos inválidos: ${invalids.join(', ')}`);
      return false;
    }

    return true;
  }

  document.getElementById('upload-sound').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !file.name.endsWith('.mp3')) {
    alert('Por favor, selecione um arquivo .mp3 válido.');
    return;
  }

  const destPath = path.join(__dirname, '../../assets/sound', file.name);
  fs.copyFile(file.path, destPath, (err) => {
    if (err) {
      alert('Erro ao copiar o arquivo.');
      console.error(err);
    } else {
      alert('Som adicionado com sucesso!');
      // Atualiza os selects
      document.getElementById('alert-general').innerHTML = '';
      document.getElementById('alert-favorite').innerHTML = '';
      loadSoundOptions();
    }
  });
});

  
  ipcRenderer.invoke('get-config').then(cfg => {
    config = cfg;

    document.getElementById('bgcolor').value = cfg.widget?.bgColor || '#1e1e1e';
    const opacity = cfg.widget?.bgOpacity ?? 0.6;

    document.getElementById('map-icon-color').value = cfg.widget?.mapiconcolor || '#ffd700';
    document.getElementById('title-color').value = cfg.widget?.titlecolor || '#ffd700';
    document.getElementById('text-color').value = cfg.widget?.textcolor || '#ffffff';

    document.getElementById('bgopacity').value = opacity;
    document.getElementById('opacity-value').innerText = Math.round(opacity * 100) + '%';

    document.getElementById('bubble-color').value = cfg.bubble?.color || '#1982d2';
    document.getElementById('bubble-size').value = cfg.bubble?.size || 50;
    document.getElementById('bubble-size-value').innerText = (cfg.bubble?.size || 50) + 'px';
    document.getElementById('icon-color').value = cfg.bubble?.iconColor || '#ffffff';

    const radius = cfg.search?.radius ?? 50;
    document.getElementById('search-radius').value = radius;
    document.getElementById('radius-value').innerText = radius + ' km';

    const allowedTypes = cfg.search?.filters || ['comercial', 'privado', 'militar', 'helicoptero', 'outros'];
    document.querySelectorAll('#aircraft-filters input[type="checkbox"]').forEach(cb => {
      cb.checked = allowedTypes.includes(cb.value);
    });

    loadSoundOptions();
    setTimeout(() => {
      document.getElementById('alert-general').value = cfg.alert?.general || 'notificacao.mp3';
      document.getElementById('alert-favorite').value = cfg.alert?.favorite || 'favorito.mp3';
    }, 200);

    const sc = cfg.shortcuts || {};
    document.getElementById('shortcut-zoomin').value = sc.zoomin || 'Ctrl+0';
    document.getElementById('shortcut-zoomout').value = sc.zoomout || 'Ctrl+9';
    document.getElementById('shortcut-refresh').value = sc.refresh || 'Ctrl+R';
    document.getElementById('shortcut-minimize').value = sc.minimize || 'Ctrl+M';
    document.getElementById('shortcut-restore').value = sc.restore || 'Ctrl+Shift+M';

    document.getElementById('opensky-clientid').value = cfg.accounts?.opensky?.client_id || '';
    document.getElementById('opensky-clientsecret').value = cfg.accounts?.opensky?.client_secret || '';

  });

  document.getElementById('bgopacity').addEventListener('input', e => {
    document.getElementById('opacity-value').innerText = Math.round(e.target.value * 100) + '%';
  });
  document.getElementById('bubble-size').addEventListener('input', e => {
    document.getElementById('bubble-size-value').innerText = e.target.value + 'px';
  });
  document.getElementById('search-radius').addEventListener('input', e => {
    document.getElementById('radius-value').innerText = e.target.value + ' km';
  });

  document.getElementById('save-btn').onclick = () => {
    const updatedShortcuts = {
      zoomin: document.getElementById('shortcut-zoomin').value,
      zoomout: document.getElementById('shortcut-zoomout').value,
      refresh: document.getElementById('shortcut-refresh').value,
      minimize: document.getElementById('shortcut-minimize').value,
      restore: document.getElementById('shortcut-restore').value
    };

    if (!validateShortcuts(updatedShortcuts)) return;

    const updated = {
      widget: {
        ...config.widget,
        bgColor: document.getElementById('bgcolor').value,
        mapiconcolor: document.getElementById('map-icon-color').value,
        titlecolor: document.getElementById('title-color').value,
        textcolor: document.getElementById('text-color').value,
        bgOpacity: parseFloat(document.getElementById('bgopacity').value)
      },
      bubble: {
        ...config.bubble,
        color: document.getElementById('bubble-color').value,
        size: parseInt(document.getElementById('bubble-size').value),
        iconColor: document.getElementById('icon-color').value
      },
      search: {
        radius: parseInt(document.getElementById('search-radius').value),
        filters: [...document.querySelectorAll('#aircraft-filters input[type="checkbox"]')]
          .filter(cb => cb.checked)
          .map(cb => cb.value)
      },
      alert: {
        general: document.getElementById('alert-general').value,
        favorite: document.getElementById('alert-favorite').value
      },
      shortcuts: updatedShortcuts,
      accounts: {
        opensky: {
          client_id: document.getElementById('opensky-clientid').value.trim(),
          client_secret: document.getElementById('opensky-clientsecret').value.trim()
        }
      }
    };

    ipcRenderer.send('update-config', updated);
    ipcRenderer.send('apply-style', updated.widget);
    window.close();
  };

  document.getElementById('cancel-btn').onclick = () => {
    window.close();
  };
});
