/* ================= STATE ================= */
const STORAGE_KEY = "hexaMatrixTrackerData";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Icons live at icons/<class>/<node key>.png; missing ones just hide.
function nodeIcon(classKey, key) {
  if (!classKey) return "";
  return `<img class="node-icon" src="icons/${slug(classKey)}/${slug(key)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}

function buildNodesFromTemplate(classKey) {
  const tpl = PRIORITY_CONFIG[classKey];
  if (!tpl) return [];
  return tpl.nodes.map((n) => ({
    id: uid(),
    key: n.key,
    name: n.name || n.key,
    type: n.type,
    level: n.level,
  }));
}

function defaultProfile(classKey) {
  const presetNames =
    classKey && PRIORITY_CONFIG[classKey]
      ? Object.keys(PRIORITY_CONFIG[classKey].priorities)
      : [];
  return {
    classKey: classKey || null,
    nodes: classKey ? buildNodesFromTemplate(classKey) : [],
    presetName: presetNames[0] || null,
    fragOwned: 0,
    fragPerDay: 0,
  };
}

function defaultState() {
  const profiles = {};
  Object.keys(PRIORITY_CONFIG).forEach((classKey) => {
    profiles[classKey] = defaultProfile(classKey);
  });
  return { profiles, current: "Kanna" };
}

// Saved nodes keep a copy of their display name; resync them with the template.
function syncNodeNames(st) {
  Object.values(st.profiles || {}).forEach((p) => {
    const tpl = p.classKey && PRIORITY_CONFIG[p.classKey];
    if (!tpl) return;
    const nameByKey = {};
    tpl.nodes.forEach((t) => (nameByKey[t.key] = t.name || t.key));
    // Drop nodes removed from the template, rename the rest.
    p.nodes = (p.nodes || []).filter((n) => nameByKey[n.key]);
    p.nodes.forEach((n) => (n.name = nameByKey[n.key]));
    // Add nodes that were added to the template (or renamed keys).
    const have = new Set(p.nodes.map((n) => n.key));
    buildNodesFromTemplate(p.classKey).forEach((n) => {
      if (!have.has(n.key)) p.nodes.push(n);
    });
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      syncNodeNames(saved);
      return saved;
    } catch (e) {}
  }
  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let activeTab = "nodes";

function curProfile() {
  return state.profiles[state.current];
}

/* ================= IMPORT / EXPORT HELPERS ================= */
function profileFromImportEntry(entry) {
  const classKey = entry.class;
  const profile = defaultProfile(classKey);
  if (!PRIORITY_CONFIG[classKey]) {
    console.warn(
      `Import: unknown class "${classKey}" — creating empty class entry, no levels restored.`,
    );
    return profile;
  }
  const levelByKey = {};
  (entry.nodes || []).forEach((n) => {
    levelByKey[n.key] = n.level;
  });
  profile.nodes.forEach((n) => {
    if (levelByKey.hasOwnProperty(n.key)) {
      n.level = Math.max(
        0,
        Math.min(MAX_LEVEL, parseInt(levelByKey[n.key]) || 0),
      );
    }
  });
  return profile;
}

/* ================= RENDER ================= */
function render() {
  const p = curProfile();
  const app = document.getElementById("app");
  app.innerHTML = `
    <h1>HEXA Matrix Tracker</h1>
    <div class="subtitle">Costs verified against source data. Leveling priority order is locked to a fixed configuration</div>
    ${renderTopbar()}
    <div class="tabs">
      <button data-tab="nodes" class="${activeTab === "nodes" ? "active" : ""}">Node Tracker</button>
      <button data-tab="sequence" class="${activeTab === "sequence" ? "active" : ""}">Upgrade Priority</button>
    </div>
    ${activeTab === "nodes" ? renderNodesTab(p) : ""}
    ${activeTab === "sequence" ? renderSequenceTab(p) : ""}
    <input type="file" id="importFile" style="display:none" accept="application/json">
  `;
  attachEvents();
}

function renderTopbar() {
  const names = Object.keys(state.profiles).sort((a, b) => a.localeCompare(b));
  return `
  <div class="topbar">
    <label style="color:var(--muted);font-size:12px;">Class:</label>
    <input id="profileSelect" list="profileList" value="${state.current}" placeholder="Type to search" autocomplete="off" />
    <datalist id="profileList">
      ${names.map((n) => `<option value="${n}"></option>`).join("")}
    </datalist>
    <button id="newProfileBtn">+ New Profile</button>
    <button id="renameProfileBtn">Rename</button>
    <button class="danger" id="deleteProfileBtn">Delete</button>
    <span style="flex:1"></span>
    <button id="exportBtn">Export JSON</button>
    <button id="importBtn">Import JSON</button>
  </div>`;
}

const NODE_SECTIONS = [
  { title: "Origin / Ascent", types: ["skill12", "skill3"] },
  { title: "Mastery", types: ["mastery"] },
  { title: "Boost", types: ["boost"] },
  { title: "Common", types: ["common12", "common3"] },
];

function renderNodeSection(p, sec) {
  const rows = p.nodes
    .map((n, idx) => ({ n, idx }))
    .filter(({ n }) => sec.types.includes(n.type))
    .map(({ n, idx }) => {
      const next =
        n.level < MAX_LEVEL
          ? costBetween(n.type, n.level, n.level + 1)
          : { se: 0, frag: 0 };
      const toMax = costBetween(n.type, n.level, MAX_LEVEL);
      return `<tr>
            <td class="node-name" data-fullname="${n.name}">${nodeIcon(p.classKey, n.key)}${n.name}</td>
            <td><input type="number" min="0" max="${MAX_LEVEL}" data-action="levelNode" data-id="${n.id}" data-idx="${idx}" value="${n.level}"></td>
            <td>${n.level < MAX_LEVEL ? `${next.se} Erdas / ${next.frag} Frags` : '<span class="lockbadge" style="background:var(--good);color:#111">MAX</span>'}</td>
            <td>${toMax.se} Erdas / ${toMax.frag} Frags</td>
          </tr>`;
    })
    .join("");
  return `<div class="panel">
    <h2>${sec.title}</h2>
    <table>
      <thead><tr><th class="node-name">Name</th><th>Level</th><th>Cost to next</th><th>Cost to max</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="hint">None</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderNodesTab(p) {
  const totalToMax = p.nodes.reduce(
    (s, n) => {
      const c = costBetween(n.type, 0, MAX_LEVEL);
      return { se: s.se + c.se, frag: s.frag + c.frag };
    },
    { se: 0, frag: 0 },
  );
  const spent = p.nodes.reduce(
    (s, n) => {
      const c = costBetween(n.type, 0, n.level);
      return { se: s.se + c.se, frag: s.frag + c.frag };
    },
    { se: 0, frag: 0 },
  );
  const pct = totalToMax.frag ? (spent.frag / totalToMax.frag) * 100 : 0;

  return `
  <div class="panel">
    <h2>Summary</h2>
    <div class="grid">
      <div class="stat-card"><div class="label">Total to fully max all nodes</div><div class="value">${totalToMax.se} Sol Erdas / ${totalToMax.frag} Fragments</div></div>
      <div class="stat-card"><div class="label">Spent so far (based on current levels)</div><div class="value">${spent.se} Sol Erdas / ${spent.frag} Fragments</div></div>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="hint">${pct.toFixed(2)}% complete</div>
  </div>

  <div class="node-sections">
    ${NODE_SECTIONS.map((sec) => renderNodeSection(p, sec)).join("")}
  </div>
  <div class="hint">Skill names, types, and costs are all fixed.</div>`;
}

function renderSequenceTab(p) {
  const cfg = p.classKey ? PRIORITY_CONFIG[p.classKey] : null;
  const presetNames = cfg ? Object.keys(cfg.priorities) : [];

  if (!cfg || presetNames.length === 0) {
    return `<div class="panel">
      <h2>Upgrade Priority</h2>
      <div class="hint">No built-in priority order is configured for this class yet.</div>
    </div>`;
  }

  const seq = cfg.priorities[p.presetName] || cfg.priorities[presetNames[0]];
  const nodesByKey = {};
  p.nodes.forEach((n) => (nodesByKey[n.key] = n));
  const sim = {};
  p.nodes.forEach((n) => (sim[n.key] = n.level));

  let runningSE = 0,
    runningFrag = 0;
  const rows = seq.map((step) => {
    if (step[0] === "NOTE") return { note: step[1] };
    const [key, target] = step;
    const node = nodesByKey[key];
    if (!node) return { note: `(missing node "${key}" in this class)` };
    const from = sim[key];
    const done = from >= target;
    const cost = done
      ? { se: 0, frag: 0 }
      : costBetween(node.type, from, target);
    if (!done) {
      sim[key] = target;
      runningSE += cost.se;
      runningFrag += cost.frag;
    }
    const daysFromStart =
      !done && p.fragPerDay > 0
        ? Math.max(0, runningFrag - p.fragOwned) / p.fragPerDay
        : null;
    return {
      node,
      from,
      target,
      cost,
      done,
      runningSE,
      runningFrag,
      daysFromStart,
    };
  });

  const nextStep = rows.find((r) => r.node && !r.done);
  const totalDays =
    p.fragPerDay > 0
      ? Math.max(0, runningFrag - p.fragOwned) / p.fragPerDay
      : null;

  return `
  <div class="panel">
    <h2>Fragments</h2>
    <div class="grid">
      <div><label class="hint">Fragments owned</label><br><input type="number" id="fragOwned" value="${p.fragOwned}"></div>
      <div><label class="hint">Fragments obtained per day</label><br><input type="number" id="fragPerDay" value="${p.fragPerDay}"></div>
    </div>
  </div>

  ${
    presetNames.length > 1
      ? `
  <div class="panel">
    <h2>Priority Preset <span class="lockbadge">🔒 fixed by developer</span></h2>
    <select id="presetSelect">
      ${presetNames.map((n) => `<option value="${n}" ${n === p.presetName ? "selected" : ""}>${n}</option>`).join("")}
    </select>
    <div class="hint">You can choose which built-in order to view, but the content of each order can only be changed in priorities.js.</div>
  </div>`
      : ""
  }

  ${
    nextStep
      ? `
  <div class="panel">
    <h2>Next Upgrade</h2>
    <div class="value" style="font-size:16px;">${nodeIcon(p.classKey, nextStep.node.key)}${nextStep.node.name}: level ${nextStep.node.level} → ${nextStep.target}</div>
    <div class="hint">${nextStep.cost.se} Sol Erdas / ${nextStep.cost.frag} Fragments needed for this step ${nextStep.daysFromStart != null ? `(~${nextStep.daysFromStart.toFixed(1)} days at current rate)` : ""}</div>
  </div>`
      : ""
  }

  <div class="panel">
    <h2>Priority Order — ${p.presetName}</h2>
    <div class="hint" style="margin-bottom:8px;">Completed steps (based on your current node levels) are dimmed and struck through.</div>
    ${rows
      .map((r, i) => {
        if (r.note)
          return `<div class="step-row note"><span class="step-num">${i + 1}</span><span class="step-info">${r.note}</span></div>`;
        return `<div class="step-row ${r.done ? "done" : ""}">
        <span class="step-num">${i + 1}</span>
        <span class="step-info">${nodeIcon(p.classKey, r.node.key)}${r.node.name} → level ${r.target}
          <span class="hint">(${r.cost.se} SE / ${r.cost.frag} Frag · running total: ${r.runningSE} SE / ${r.runningFrag} Frag${r.daysFromStart != null ? ` · ~${r.daysFromStart.toFixed(1)} days` : ""})</span>
        </span>
      </div>`;
      })
      .join("")}
  </div>

  <div class="panel">
    <h2>Totals</h2>
    <div class="grid">
      <div class="stat-card"><div class="label">Total remaining in this order</div><div class="value">${runningSE} SE / ${runningFrag} Frag</div></div>
      <div class="stat-card"><div class="label">Est. days to complete</div><div class="value">${totalDays != null ? totalDays.toFixed(1) + " days" : "set fragments/day"}</div></div>
    </div>
  </div>`;
}

/* ================= EVENTS ================= */
/* Dialog with a dropdown of class templates. Resolves to the chosen class
   key, null for "None", or undefined if cancelled. */
function pickClassTemplate() {
  return new Promise((resolve) => {
    const classNames = Object.keys(PRIORITY_CONFIG).sort((a, b) => a.localeCompare(b));
    const dlg = document.createElement("dialog");
    dlg.style.cssText =
      "background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:16px;";
    dlg.innerHTML = `
      <form method="dialog">
        <label>Base this on which class template?<br /><br />
          <input id="classTemplateInput" list="classTemplateList" placeholder="Type to search (blank = None)" autocomplete="off" />
          <datalist id="classTemplateList">
            ${classNames.map((n) => `<option value="${n}"></option>`).join("")}
          </datalist>
        </label>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
          <button value="cancel" formnovalidate>Cancel</button>
          <button value="ok">OK</button>
        </div>
      </form>`;
    const input = dlg.querySelector("input");
    const matchClass = () => {
      const t = input.value.trim().toLowerCase();
      return classNames.find((n) => n.toLowerCase() === t) || null;
    };
    input.addEventListener("input", () => {
      input.setCustomValidity(
        input.value.trim() && !matchClass() ? "Pick a class from the list" : "",
      );
    });
    dlg.addEventListener("close", () => {
      const ok = dlg.returnValue === "ok";
      const val = matchClass();
      dlg.remove();
      resolve(ok ? val || null : undefined);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

function attachEvents() {
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        activeTab = b.dataset.tab;
        render();
      }),
  );

  const profileSelect = document.getElementById("profileSelect");
  if (profileSelect) {
    const matchProfile = () => {
      const t = profileSelect.value.trim().toLowerCase();
      return Object.keys(state.profiles).find((n) => n.toLowerCase() === t);
    };
    // Clear on focus so the full list shows; restore if nothing valid is chosen
    profileSelect.onfocus = () => (profileSelect.value = "");
    profileSelect.onblur = () => {
      if (!matchProfile()) profileSelect.value = state.current;
    };
    profileSelect.oninput = () => {
      const match = matchProfile();
      if (match && match !== state.current) {
        state.current = match;
        saveState();
        render();
      }
    };
  }

  const newBtn = document.getElementById("newProfileBtn");
  if (newBtn)
    newBtn.onclick = async () => {
      const name = prompt("New profile name:");
      if (!name || state.profiles[name]) return;
      const classKey = await pickClassTemplate();
      if (classKey === undefined) return;
      state.profiles[name] = defaultProfile(classKey);
      state.current = name;
      saveState();
      render();
    };
  const renameBtn = document.getElementById("renameProfileBtn");
  if (renameBtn)
    renameBtn.onclick = () => {
      const name = prompt("Rename class to:", state.current);
      if (name && name !== state.current && !state.profiles[name]) {
        state.profiles[name] = state.profiles[state.current];
        delete state.profiles[state.current];
        state.current = name;
        saveState();
        render();
      }
    };
  const delBtn = document.getElementById("deleteProfileBtn");
  if (delBtn)
    delBtn.onclick = () => {
      if (Object.keys(state.profiles).length <= 1) {
        alert("Can't delete the only profile.");
        return;
      }
      if (confirm(`Delete profile "${state.current}"?`)) {
        delete state.profiles[state.current];
        state.current = Object.keys(state.profiles)[0];
        saveState();
        render();
      }
    };

  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn)
    exportBtn.onclick = () => {
      const exportData = {
        profiles: Object.values(state.profiles).map((prof) => ({
          class: prof.classKey,
          nodes: prof.nodes.map((n) => ({ key: n.key, level: n.level })),
        })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hexa-matrix-tracker-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    };
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  if (importBtn) importBtn.onclick = () => importFile.click();
  if (importFile)
    importFile.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.profiles || !Array.isArray(data.profiles)) {
            alert("Invalid file format.");
            return;
          }
          const newProfiles = {};
          data.profiles.forEach((entry) => {
            const name = entry.class;
            if (!name) return;
            newProfiles[name] = profileFromImportEntry(entry);
          });
          if (Object.keys(newProfiles).length === 0) {
            alert("No valid classes found in file.");
            return;
          }
          state.profiles = newProfiles;
          state.current = Object.keys(newProfiles)[0];
          saveState();
          render();
        } catch (err) {
          alert("Could not read file.");
        }
      };
      reader.readAsText(file);
    };

  const p = curProfile();

  // Node tab events
  function commitLevelInput(inputEl) {
    const n = p.nodes.find((x) => x.id === inputEl.dataset.id);
    let v = parseInt(inputEl.value) || 0;
    v = Math.max(0, Math.min(MAX_LEVEL, v));
    n.level = v;
    saveState();
  }

  function focusLevelInputByIdx(idx) {
    const target = document.querySelector(
      `[data-action="levelNode"][data-idx="${idx}"]`,
    );
    if (target) {
      target.focus();
      target.select();
    }
  }

  document.querySelectorAll('[data-action="levelNode"]').forEach((el) => {
    el.onchange = (e) => {
      commitLevelInput(e.target);
      render();
    };
    el.onkeydown = (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const idx = parseInt(e.target.dataset.idx, 10);
        commitLevelInput(e.target);
        render();
        focusLevelInputByIdx(e.shiftKey ? idx - 1 : idx + 1);
      }
    };
  });

  // Sequence tab events
  const fragOwned = document.getElementById("fragOwned");
  if (fragOwned)
    fragOwned.onchange = (e) => {
      p.fragOwned = parseInt(e.target.value) || 0;
      saveState();
      render();
    };
  const fragPerDay = document.getElementById("fragPerDay");
  if (fragPerDay)
    fragPerDay.onchange = (e) => {
      p.fragPerDay = parseInt(e.target.value) || 0;
      saveState();
      render();
    };
  const presetSelect = document.getElementById("presetSelect");
  if (presetSelect)
    presetSelect.onchange = (e) => {
      p.presetName = e.target.value;
      saveState();
      render();
    };
}

// Custom tooltip for truncated skill names (native title tooltips were unreliable)
const nameTip = document.createElement("div");
nameTip.className = "name-tip";
document.body.appendChild(nameTip);
document.addEventListener("mouseover", (e) => {
  const cell = e.target.closest && e.target.closest("[data-fullname]");
  if (!cell) return;
  nameTip.textContent = cell.dataset.fullname;
  const r = cell.getBoundingClientRect();
  nameTip.style.display = "block";
  nameTip.style.left = `${Math.min(r.left, window.innerWidth - nameTip.offsetWidth - 8)}px`;
  nameTip.style.top = `${r.bottom + 4}px`;
});
document.addEventListener("mouseout", (e) => {
  const cell = e.target.closest && e.target.closest("[data-fullname]");
  if (cell && !cell.contains(e.relatedTarget)) nameTip.style.display = "none";
});

render();
