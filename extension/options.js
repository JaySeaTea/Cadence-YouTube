(async () => {
  const SAMPLE_DEFAULTS = {
  "presets": [
    {
      "id": "music",
      "label": "Music & Performance",
      "description": "Preserves natural pitch, rhythm, and studio mix timing.",
      "speed": 1
    },
    {
      "id": "educational",
      "label": "Educational & Explainer",
      "description": "Brisk comprehension pace for tutorials, science, and essays.",
      "speed": 1.5
    },
    {
      "id": "podcast",
      "label": "Podcast & Lecture",
      "description": "High-efficiency cadence for long-form conversations and seminars.",
      "speed": 2
    }
  ],
  "rules": [
    {
      "id": "rule-velvet-room",
      "channelName": "Velvet Room Sessions",
      "handle": "@velvetroomsessions",
      "channelId": "UC8velvetRoomMusic01",
      "presetId": "music",
      "customSpeed": 1,
      "updatedAt": "2026-10-23"
    },
    {
      "id": "rule-orbital-lab",
      "channelName": "Orbital Mechanics Lab",
      "handle": "@orbitalmechanics",
      "channelId": "UC4orbitalLabEdu02",
      "presetId": "educational",
      "customSpeed": 1.5,
      "updatedAt": "2026-10-23"
    },
    {
      "id": "rule-longform-archive",
      "channelName": "The Longform Archive",
      "handle": "@longformarchive",
      "channelId": "UC9longformPod03",
      "presetId": "podcast",
      "customSpeed": 2,
      "updatedAt": "2026-10-23"
    },
    {
      "id": "rule-systems-craft",
      "channelName": "Systems Craft",
      "handle": "@systemscraft",
      "channelId": "UC2systemsCraft04",
      "presetId": "educational",
      "customSpeed": 1.5,
      "updatedAt": "2026-10-23"
    }
  ]
};

  let stored = await chrome.storage.local.get(['presets', 'rules']);
  let presets = Array.isArray(stored.presets) && stored.presets.length > 0
    ? stored.presets
    : SAMPLE_DEFAULTS.presets.map((p) => ({ ...p }));
  let rules = Array.isArray(stored.rules)
    ? stored.rules
    : SAMPLE_DEFAULTS.rules.map((r) => ({ ...r }));

  const presetsEl = document.getElementById('presets-list');
  const rulesEl = document.getElementById('rules-list');
  const rulesCountEl = document.getElementById('rules-count');
  const form = document.getElementById('add-rule-form');
  const presetSelectEl = document.getElementById('input-preset');
  const speedInputEl = document.getElementById('input-speed');
  const importInputEl = document.getElementById('import-json-input');
  const importBtnEl = document.getElementById('btn-import-json');
  const exportBtnEl = document.getElementById('btn-export-json');
  const resetBtnEl = document.getElementById('btn-reset-samples');
  const statusBannerEl = document.getElementById('status-banner');
  let statusTimer = null;

  function formatSpeed(val) {
    return Number(val).toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
  }

  function normalizeHandle(raw, fallbackName = '') {
    const cleaned = String(raw || '').trim();
    if (cleaned) {
      const urlMatch = cleaned.match(/\/(@[^/?#]+)/);
      if (urlMatch) return urlMatch[1].toLowerCase();
      return cleaned.startsWith('@') ? cleaned.toLowerCase() : '@' + cleaned.toLowerCase().replace(/\s+/g, '');
    }
    return '@' + String(fallbackName || 'channel').toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  }

  function showStatus(message) {
    if (!statusBannerEl) return;
    statusBannerEl.textContent = message;
    statusBannerEl.classList.add('visible');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusBannerEl.classList.remove('visible');
    }, 3600);
  }

  function syncPresetSelectLabels() {
    if (!presetSelectEl) return;
    const musicSpd = (presets.find((p) => p.id === 'music') || { speed: 1.0 }).speed;
    const eduSpd = (presets.find((p) => p.id === 'educational') || { speed: 1.5 }).speed;
    const podSpd = (presets.find((p) => p.id === 'podcast') || { speed: 2.0 }).speed;
    const opts = presetSelectEl.options;
    if (opts[0]) opts[0].textContent = `Music (${formatSpeed(musicSpd)}×)`;
    if (opts[1]) opts[1].textContent = `Educational (${formatSpeed(eduSpd)}×)`;
    if (opts[2]) opts[2].textContent = `Podcast / Lecture (${formatSpeed(podSpd)}×)`;
  }

  presetSelectEl.addEventListener('change', () => {
    const chosen = presets.find((p) => p.id === presetSelectEl.value);
    if (chosen && speedInputEl) {
      speedInputEl.value = String(chosen.speed);
    }
  });

  function renderPresets() {
    syncPresetSelectLabels();
    presetsEl.innerHTML = presets
      .map(
        (p) => `
      <div class="preset-row">
        <div>
          <strong>${p.label}</strong>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${p.description}</div>
        </div>
        <input type="number" step="0.05" min="0.25" max="4" value="${p.speed}" data-preset-id="${p.id}" style="width:92px;" />
      </div>
    `
      )
      .join('');

    presetsEl.querySelectorAll('input[data-preset-id]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const id = inp.getAttribute('data-preset-id');
        const nextVal = Math.round(Math.min(4, Math.max(0.25, Number(inp.value) || 1.0)) * 100) / 100;
        presets = presets.map((p) => (p.id === id ? { ...p, speed: nextVal } : p));
        await chrome.storage.local.set({ presets });
        syncPresetSelectLabels();
        renderRules();
      });
    });
  }

  function resolveSpeed(rule) {
    if (rule.presetId === 'custom') return rule.customSpeed;
    const found = presets.find((p) => p.id === rule.presetId);
    return found ? found.speed : rule.customSpeed;
  }

  function renderRules() {
    if (rulesCountEl) {
      rulesCountEl.textContent = `${rules.length} saved`;
    }
    if (rules.length === 0) {
      rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0;">No channel rules saved yet. Add a channel above or import a JSON backup.</p>';
      return;
    }
    rulesEl.innerHTML = rules
      .map(
        (r) => `
      <div class="rule-row">
        <div>
          <strong>${r.channelName}</strong>
          <span style="font-size:12px;color:#94a3b8;margin-left:6px;">${r.handle || ''} · ${r.presetId}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <strong style="font-variant-numeric:tabular-nums;">${formatSpeed(resolveSpeed(r))}×</strong>
          <button type="button" class="row-remove" data-del-id="${r.id}">Remove</button>
        </div>
      </div>
    `
      )
      .join('');

    rulesEl.querySelectorAll('button[data-del-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-id');
        rules = rules.filter((r) => r.id !== id);
        await chrome.storage.local.set({ rules });
        renderRules();
      });
    });
  }

  function mergeRuleLists(incoming, existing) {
    const merged = [...incoming];
    for (const candidate of existing) {
      const duplicate = merged.some(
        (r) =>
          (candidate.channelId && r.channelId && r.channelId === candidate.channelId) ||
          (candidate.handle && r.handle && r.handle.toLowerCase() === candidate.handle.toLowerCase()) ||
          r.channelName.toLowerCase() === candidate.channelName.toLowerCase()
      );
      if (!duplicate) {
        merged.push(candidate);
      }
    }
    return merged;
  }

  exportBtnEl.addEventListener('click', () => {
    const payload = JSON.stringify({ presets, rules }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cadence-channel-rules.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showStatus(`Exported ${rules.length} channel ${rules.length === 1 ? 'rule' : 'rules'} to cadence-channel-rules.json`);
  });

  importBtnEl.addEventListener('click', () => {
    importInputEl.click();
  });

  importInputEl.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawRules = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed && parsed.rules)
          ? parsed.rules
          : [];

      const sanitizedRules = rawRules
        .filter((item) => item && typeof item === 'object')
        .map((item, idx) => {
          const channelName = String(item.channelName || 'Unnamed Channel').trim();
          const validPreset =
            item.presetId === 'music' ||
            item.presetId === 'educational' ||
            item.presetId === 'podcast' ||
            item.presetId === 'custom'
              ? item.presetId
              : 'custom';
          return {
            id: typeof item.id === 'string' && item.id ? item.id : `imported-${Date.now()}-${idx}`,
            channelName,
            handle: normalizeHandle(item.handle, channelName),
            channelId: typeof item.channelId === 'string' ? item.channelId : '',
            presetId: validPreset,
            customSpeed: Math.round(Math.min(4.0, Math.max(0.25, Number(item.customSpeed) || 1.0)) * 100) / 100,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
        });

      if (Array.isArray(parsed && parsed.presets)) {
        presets = presets.map((existingPreset) => {
          const incomingPreset = parsed.presets.find((p) => p && p.id === existingPreset.id);
          if (!incomingPreset) return existingPreset;
          return {
            ...existingPreset,
            speed: Math.round(Math.min(4.0, Math.max(0.25, Number(incomingPreset.speed) || existingPreset.speed)) * 100) / 100,
          };
        });
      }

      if (sanitizedRules.length > 0) {
        rules = mergeRuleLists(sanitizedRules, rules);
        await chrome.storage.local.set({ presets, rules });
        renderPresets();
        renderRules();
        showStatus(`Imported ${sanitizedRules.length} channel ${sanitizedRules.length === 1 ? 'rule' : 'rules'} (${rules.length} total saved)`);
      } else {
        showStatus('No valid channel rules found in selected JSON file.');
      }
    } catch (_) {
      showStatus('Could not parse JSON file. Please select a valid Cadence JSON backup.');
    } finally {
      importInputEl.value = '';
    }
  });

  resetBtnEl.addEventListener('click', async () => {
    presets = SAMPLE_DEFAULTS.presets.map((p) => ({ ...p }));
    rules = SAMPLE_DEFAULTS.rules.map((r) => ({ ...r }));
    await chrome.storage.local.set({ presets, rules });
    renderPresets();
    renderRules();
    showStatus('Reset extension to the 4 starter sample rules.');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('input-name');
    const handleInput = document.getElementById('input-handle');
    const presetSelect = document.getElementById('input-preset');
    const speedInput = document.getElementById('input-speed');

    const channelName = nameInput.value.trim();
    if (!channelName) return;
    const handle = normalizeHandle(handleInput.value, channelName);
    const cleanSpeed = Math.round(Math.min(4.0, Math.max(0.25, Number(speedInput.value) || 1.0)) * 100) / 100;

    const existingIdx = rules.findIndex(
      (r) =>
        (r.handle && r.handle.toLowerCase() === handle.toLowerCase()) ||
        r.channelName.toLowerCase() === channelName.toLowerCase()
    );

    const newRule = {
      id: existingIdx >= 0 ? rules[existingIdx].id : 'rule-' + Date.now(),
      channelName,
      handle,
      channelId: existingIdx >= 0 ? rules[existingIdx].channelId || '' : '',
      presetId: presetSelect.value,
      customSpeed: cleanSpeed,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    if (existingIdx >= 0) {
      rules[existingIdx] = newRule;
    } else {
      rules = [newRule, ...rules];
    }

    await chrome.storage.local.set({ rules });
    nameInput.value = '';
    handleInput.value = '';
    renderRules();
    showStatus(`Saved ${channelName} (${formatSpeed(resolveSpeed(newRule))}×)`);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.presets && Array.isArray(changes.presets.newValue)) {
      presets = changes.presets.newValue;
      renderPresets();
    }
    if (changes.rules && Array.isArray(changes.rules.newValue)) {
      rules = changes.rules.newValue;
      renderRules();
    }
  });

  renderPresets();
  renderRules();
})();
