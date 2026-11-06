(async () => {
  const DEFAULT_PRESETS = [
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
];

  const DEFAULT_SETTINGS = {
    perChannelSpeed: true,
    stopAfterVideo: true,
    showSpeedBar: true,
    convertShorts: true,
    disableVideoPreviews: true,
    settingsSchemaVersion: 5
  };

  const manifestVersion =
    chrome.runtime && typeof chrome.runtime.getManifest === 'function'
      ? chrome.runtime.getManifest().version
      : '';
  const versionEl = document.getElementById('ext-version');
  if (versionEl && manifestVersion) {
    versionEl.textContent = `· v${manifestVersion}`;
  }

  let stored = await chrome.storage.local.get(['settings', 'presets', 'rules', 'totalTimeSavedSec']);
  let settings = Object.assign({}, DEFAULT_SETTINGS, stored.settings || {});
  let presets = Array.isArray(stored.presets) && stored.presets.length > 0
    ? stored.presets
    : DEFAULT_PRESETS.map((p) => ({ ...p }));
  let rules = Array.isArray(stored.rules) ? stored.rules : [];
  let totalTimeSavedSec = Math.max(0, Math.floor(Number(stored.totalTimeSavedSec) || 0));

  // Filter & Pagination State (#26)
  let searchQuery = '';
  let filterCategory = 'all';
  let sortBy = 'recent';
  let pageSize = 10;
  let currentPage = 1;

  // DOM elements
  const presetsEl = document.getElementById('presets-list');
  const rulesEl = document.getElementById('rules-list');
  const rulesCountEl = document.getElementById('rules-count');
  const rulesRangeEl = document.getElementById('rules-range');
  const pageButtonsEl = document.getElementById('page-buttons');
  const searchInputEl = document.getElementById('input-rule-search');
  const categoryPillsEl = document.getElementById('category-pills');
  const sortSelectEl = document.getElementById('select-sort');
  const pageSizeSelectEl = document.getElementById('select-page-size');

  const form = document.getElementById('add-rule-form');
  const presetSelectEl = document.getElementById('input-preset');
  const speedInputEl = document.getElementById('input-speed');
  const importInputEl = document.getElementById('import-json-input');
  const importBtnEl = document.getElementById('btn-import-json');
  const exportBtnEl = document.getElementById('btn-export-json');
  const resetBtnEl = document.getElementById('btn-reset-presets');
  const statusBannerEl = document.getElementById('status-banner');

  // Toggles DOM
  const toggleSpeedEl = document.getElementById('toggle-speed');
  const toggleStopEl = document.getElementById('toggle-stop');
  const toggleBarEl = document.getElementById('toggle-bar');
  const toggleShortsEl = document.getElementById('toggle-shorts');
  const togglePreviewsEl = document.getElementById('toggle-previews');

  // Lifetime stats DOM
  const statSavedValueEl = document.getElementById('stat-saved-value');
  const btnOpenResetEl = document.getElementById('btn-open-reset');
  const resetConfirmBoxEl = document.getElementById('reset-confirm-box');
  const inputConfirmForgetEl = document.getElementById('input-confirm-forget');
  const btnConfirmForgetEl = document.getElementById('btn-confirm-forget');
  const btnCancelForgetEl = document.getElementById('btn-cancel-forget');

  let statusTimer = null;

  function formatSpeed(val) {
    return Number(val).toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
  }

  function formatFullSavedTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const remS = s % 60;
    if (h > 0) return `${h}h ${m}m ${remS}s`;
    return `${m}m ${remS}s`;
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

  function renderToggles() {
    if (toggleSpeedEl) toggleSpeedEl.checked = !!settings.perChannelSpeed;
    if (toggleStopEl) toggleStopEl.checked = !!settings.stopAfterVideo;
    if (toggleBarEl) toggleBarEl.checked = !!settings.showSpeedBar;
    if (toggleShortsEl) toggleShortsEl.checked = !!settings.convertShorts;
    if (togglePreviewsEl) togglePreviewsEl.checked = !!settings.disableVideoPreviews;
  }

  async function updateSetting(key, val) {
    settings[key] = val;
    settings.settingsSchemaVersion = 5;
    await chrome.storage.local.set({ settings });
    showStatus(`Updated ${key}: ${val ? 'Enabled' : 'Disabled'}`);
  }

  if (toggleSpeedEl) toggleSpeedEl.addEventListener('change', () => updateSetting('perChannelSpeed', toggleSpeedEl.checked));
  if (toggleStopEl) toggleStopEl.addEventListener('change', () => updateSetting('stopAfterVideo', toggleStopEl.checked));
  if (toggleBarEl) toggleBarEl.addEventListener('change', () => updateSetting('showSpeedBar', toggleBarEl.checked));
  if (toggleShortsEl) toggleShortsEl.addEventListener('change', () => updateSetting('convertShorts', toggleShortsEl.checked));
  if (togglePreviewsEl) togglePreviewsEl.addEventListener('change', () => updateSetting('disableVideoPreviews', togglePreviewsEl.checked));

  function renderTimeSaved() {
    if (statSavedValueEl) {
      statSavedValueEl.textContent = `${formatFullSavedTime(totalTimeSavedSec)} saved`;
    }
  }

  btnOpenResetEl.addEventListener('click', () => {
    resetConfirmBoxEl.classList.add('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
    inputConfirmForgetEl.focus();
  });

  btnCancelForgetEl.addEventListener('click', () => {
    resetConfirmBoxEl.classList.remove('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
  });

  inputConfirmForgetEl.addEventListener('input', () => {
    btnConfirmForgetEl.disabled = inputConfirmForgetEl.value.trim() !== 'Forget Time Saved';
  });

  btnConfirmForgetEl.addEventListener('click', async () => {
    if (inputConfirmForgetEl.value.trim() !== 'Forget Time Saved') return;
    totalTimeSavedSec = 0;
    await chrome.storage.local.set({ totalTimeSavedSec: 0 });
    if (chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({ type: 'CADENCE_RESET_TIME_SAVED' }, () => {});
    }
    renderTimeSaved();
    resetConfirmBoxEl.classList.remove('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
    showStatus('Lifetime time saved counter reset to 0s.');
  });

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

  function getFilteredAndSortedRules() {
    let list = [...rules];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.channelName && r.channelName.toLowerCase().includes(q)) ||
          (r.handle && r.handle.toLowerCase().includes(q))
      );
    }
    if (filterCategory !== 'all') {
      list = list.filter((r) => r.presetId === filterCategory);
    }
    if (sortBy === 'name') {
      list.sort((a, b) => a.channelName.localeCompare(b.channelName));
    } else if (sortBy === 'speed') {
      list.sort((a, b) => resolveSpeed(b) - resolveSpeed(a));
    } else {
      list.sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return db - da;
      });
    }
    return list;
  }

  function renderRules() {
    if (rulesCountEl) {
      rulesCountEl.textContent = manifestVersion
        ? `${rules.length} saved · v${manifestVersion}`
        : `${rules.length} saved`;
    }

    const filtered = getFilteredAndSortedRules();
    const totalCount = filtered.length;

    const limit = pageSize === -1 ? totalCount : pageSize;
    const totalPages = limit > 0 ? Math.max(1, Math.ceil(totalCount / limit)) : 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = limit > 0 ? (currentPage - 1) * limit : 0;
    const endIdx = limit > 0 ? Math.min(startIdx + limit, totalCount) : totalCount;
    const visibleRules = filtered.slice(startIdx, endIdx);

    if (rulesRangeEl) {
      if (totalCount === 0) {
        rulesRangeEl.textContent = 'Showing 0–0 of 0 rules';
      } else {
        rulesRangeEl.textContent = `Showing ${startIdx + 1}–${endIdx} of ${totalCount} ${totalCount === 1 ? 'rule' : 'rules'}${rules.length !== totalCount ? ` (${rules.length} total)` : ''}`;
      }
    }

    if (visibleRules.length === 0) {
      if (rules.length === 0) {
        rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:12px 0;">No channel rules saved yet. Add a channel above or import a JSON backup.</p>';
      } else {
        rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:12px 0;">No channel rules match your search or filter.</p>';
      }
    } else {
      rulesEl.innerHTML = visibleRules
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

    // Render pagination buttons
    if (pageButtonsEl) {
      if (totalPages <= 1 || pageSize === -1) {
        pageButtonsEl.innerHTML = '';
      } else {
        let btns = '';
        btns += `<button type="button" class="page-btn" id="btn-prev-page" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>`;
        for (let p = 1; p <= totalPages; p++) {
          btns += `<button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }
        btns += `<button type="button" class="page-btn" id="btn-next-page" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
        pageButtonsEl.innerHTML = btns;

        const prevBtn = pageButtonsEl.querySelector('#btn-prev-page');
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
              currentPage--;
              renderRules();
            }
          });
        }
        const nextBtn = pageButtonsEl.querySelector('#btn-next-page');
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
              currentPage++;
              renderRules();
            }
          });
        }
        pageButtonsEl.querySelectorAll('button[data-page]').forEach((b) => {
          b.addEventListener('click', () => {
            currentPage = Number(b.getAttribute('data-page')) || 1;
            renderRules();
          });
        });
      }
    }
  }

  // Filter & Search events
  if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
      searchQuery = searchInputEl.value;
      currentPage = 1;
      renderRules();
    });
  }

  if (categoryPillsEl) {
    categoryPillsEl.querySelectorAll('button[data-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryPillsEl.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filterCategory = btn.getAttribute('data-category') || 'all';
        currentPage = 1;
        renderRules();
      });
    });
  }

  if (sortSelectEl) {
    sortSelectEl.addEventListener('change', () => {
      sortBy = sortSelectEl.value;
      renderRules();
    });
  }

  if (pageSizeSelectEl) {
    pageSizeSelectEl.addEventListener('change', () => {
      const val = pageSizeSelectEl.value;
      pageSize = val === 'all' ? -1 : Number(val) || 10;
      currentPage = 1;
      renderRules();
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
    const payload = JSON.stringify(
      {
        version: manifestVersion || '1.6.0',
        exportedAt: new Date().toISOString(),
        totalTimeSavedSec,
        settings,
        presets,
        rules
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-backup-v${manifestVersion || '1.6.0'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showStatus(`Exported ${rules.length} channel ${rules.length === 1 ? 'rule' : 'rules'} to backup JSON`);
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

      if (parsed && typeof parsed.settings === 'object') {
        settings = Object.assign({}, settings, parsed.settings, { settingsSchemaVersion: 5 });
        renderToggles();
      }

      if (parsed && typeof parsed.totalTimeSavedSec === 'number' && parsed.totalTimeSavedSec >= 0) {
        totalTimeSavedSec = Math.floor(parsed.totalTimeSavedSec);
        renderTimeSaved();
      }

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
      }

      await chrome.storage.local.set({ settings, presets, rules, totalTimeSavedSec });
      renderToggles();
      renderTimeSaved();
      renderPresets();
      renderRules();
      showStatus(`Imported backup (${rules.length} total channel rules, ${formatFullSavedTime(totalTimeSavedSec)} time saved)`);
    } catch (_) {
      showStatus('Could not parse JSON file. Please select a valid Cadence JSON backup.');
    } finally {
      importInputEl.value = '';
    }
  });

  resetBtnEl.addEventListener('click', async () => {
    presets = DEFAULT_PRESETS.map((p) => ({ ...p }));
    await chrome.storage.local.set({ presets });
    renderPresets();
    renderRules();
    showStatus('Reset category speed profiles to default 1.0× / 1.5× / 2.0×.');
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
    if (changes.settings && typeof changes.settings.newValue === 'object') {
      settings = Object.assign({}, DEFAULT_SETTINGS, changes.settings.newValue);
      renderToggles();
    }
    if (changes.totalTimeSavedSec && typeof changes.totalTimeSavedSec.newValue === 'number') {
      totalTimeSavedSec = changes.totalTimeSavedSec.newValue;
      renderTimeSaved();
    }
    if (changes.presets && Array.isArray(changes.presets.newValue)) {
      presets = changes.presets.newValue;
      renderPresets();
    }
    if (changes.rules && Array.isArray(changes.rules.newValue)) {
      rules = changes.rules.newValue;
      renderRules();
    }
  });

  renderToggles();
  renderTimeSaved();
  renderPresets();
  renderRules();
})();
