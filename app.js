/* ================= STATE ================= */
const STORAGE_KEY = "hexaMatrixTrackerData_v5";
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    hexaMain: 0,
    hexaAdd: 0,
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {}
  }
  return {
    profiles: {
      Hoyoung: defaultProfile("Hoyoung"),
      Adele: defaultProfile("Adele"),
      Kanna: defaultProfile("Kanna"),
      "Demon Slayer": defaultProfile("Demon Slayer"),
    },
    current: "Hoyoung",
  };
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let activeTab = "nodes";

function curProfile() {
  return state.profiles[state.current];
}

/* ================= RENDER ================= */
function render() {
  const p = curProfile();
  const app = document.getElementById("app");
  app.innerHTML = `
    <h1>HEXA Matrix Tracker</h1>
    <div class="subtitle">Costs verified against source data. Leveling priority order is locked to a fixed configuration <span class="lockbadge">🔒 view only</span></div>
    ${renderTopbar()}
    <div class="tabs">
      <button data-tab="nodes" class="${activeTab === "nodes" ? "active" : ""}">Node Tracker</button>
      <button data-tab="sequence" class="${activeTab === "sequence" ? "active" : ""}">Upgrade Priority</button>
      <button data-tab="hexastats" class="${activeTab === "hexastats" ? "active" : ""}">HEXA Stats</button>
    </div>
    ${activeTab === "nodes" ? renderNodesTab(p) : ""}
    ${activeTab === "sequence" ? renderSequenceTab(p) : ""}
    ${activeTab === "hexastats" ? renderHexaStatsTab(p) : ""}
    <input type="file" id="importFile" style="display:none" accept="application/json">
  `;
  attachEvents();
}

function renderTopbar() {
  const names = Object.keys(state.profiles);
  return `
  <div class="topbar">
    <label style="color:var(--muted);font-size:12px;">Profile:</label>
    <select id="profileSelect">
      ${names.map((n) => `<option value="${n}" ${n === state.current ? "selected" : ""}>${n}</option>`).join("")}
    </select>
    <button id="newProfileBtn">+ New Profile</button>
    <button id="renameProfileBtn">Rename</button>
    <button class="danger" id="deleteProfileBtn">Delete</button>
    <span style="flex:1"></span>
    <button id="exportBtn">Export JSON</button>
    <button id="importBtn">Import JSON</button>
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
      <div class="stat-card"><div class="label">Total to fully max all nodes</div><div class="value">${totalToMax.se} Sol Erda / ${totalToMax.frag} Fragments</div></div>
      <div class="stat-card"><div class="label">Spent so far (based on current levels)</div><div class="value">${spent.se} Sol Erda / ${spent.frag} Fragments</div></div>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="hint">${pct.toFixed(2)}% complete</div>
  </div>

  <div class="panel">
    <h2>Nodes</h2>
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Level</th><th>Cost to next</th><th>Cost to max</th><th></th></tr></thead>
      <tbody>
        ${p.nodes
          .map((n) => {
            const next =
              n.level < MAX_LEVEL
                ? costBetween(n.type, n.level, n.level + 1)
                : { se: 0, frag: 0 };
            const toMax = costBetween(n.type, n.level, MAX_LEVEL);
            return `<tr>
            <td><input type="text" data-action="renameNode" data-id="${n.id}" value="${n.name}" style="width:280px"></td>
            <td>
              <select data-action="typeNode" data-id="${n.id}">
                ${Object.keys(TYPE_LABEL)
                  .map(
                    (t) =>
                      `<option value="${t}" ${t === n.type ? "selected" : ""}>${TYPE_LABEL[t]}</option>`,
                  )
                  .join("")}
              </select>
            </td>
            <td><input type="number" min="0" max="${MAX_LEVEL}" data-action="levelNode" data-id="${n.id}" value="${n.level}"></td>
            <td>${n.level < MAX_LEVEL ? `${next.se} SE / ${next.frag} Frag` : '<span class="lockbadge" style="background:var(--good);color:#111">MAX</span>'}</td>
            <td>${toMax.se} SE / ${toMax.frag} Frag</td>
            <td><button class="small-btn danger" data-action="removeNode" data-id="${n.id}">✕</button></td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <div style="margin-top:10px;"><button class="primary" id="addNodeBtn">+ Add Custom Node</button></div>
    <div class="hint">Renaming a node only changes its display label here — it won't affect priority matching, which is keyed internally.</div>
  </div>`;
}

function renderSequenceTab(p) {
  const cfg = p.classKey ? PRIORITY_CONFIG[p.classKey] : null;
  const presetNames = cfg ? Object.keys(cfg.priorities) : [];

  if (!cfg || presetNames.length === 0) {
    return `<div class="panel">
      <h2>Upgrade Priority</h2>
      <div class="hint">No built-in priority order is configured for this profile yet. This can only be added by editing priorities.js.</div>
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
    if (!node) return { note: `(missing node "${key}" in this profile)` };
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
    <div class="value" style="font-size:16px;">${nextStep.node.name}: level ${nextStep.node.level} → ${nextStep.target}</div>
    <div class="hint">${nextStep.cost.se} Sol Erda / ${nextStep.cost.frag} Fragments needed for this step ${nextStep.daysFromStart != null ? `(~${nextStep.daysFromStart.toFixed(1)} days at current rate)` : ""}</div>
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
        <span class="step-info">${r.node.name} → level ${r.target}
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

function renderHexaStatsTab(p) {
  const m = MAIN_STATS[Math.min(p.hexaMain, 10)];
  const a = ADDITIONAL_STATS[Math.max(0, Math.min(p.hexaAdd, 10) - 1)] || {
    crit: 0,
    boss: 0,
    ied: 0,
    dmg: 0,
    att: 0,
    stat: 0,
  };
  return `
  <div class="panel">
    <h2>Calculator</h2>
    <div class="grid">
      <div>
        <label class="hint">Main Stat level (0-10)</label><br>
        <input type="number" id="hexaMainInput" min="0" max="10" value="${p.hexaMain}">
        <div class="hint" style="margin-top:8px;">Crit Dmg ${m.crit}% · Boss Dmg ${m.boss}% · IED ${m.ied}% · Damage ${m.dmg}% · ATT ${m.att} · Stats ${m.stat}${m.cost != null ? ` · Upgrade cost ${m.cost} (${m.prob}% chance)` : ""}</div>
      </div>
      <div>
        <label class="hint">Additional Stat level (0-10)</label><br>
        <input type="number" id="hexaAddInput" min="0" max="10" value="${p.hexaAdd}">
        <div class="hint" style="margin-top:8px;">Crit Dmg ${a.crit || 0}% · Boss Dmg ${a.boss || 0}% · IED ${a.ied || 0}% · Damage ${a.dmg || 0}% · ATT ${a.att || 0} · Stats ${a.stat || 0}</div>
      </div>
    </div>
  </div>

  <div class="panel">
    <h2>Main Stats Reference (per tree)</h2>
    <table>
      <thead><tr><th>Lvl</th><th>Crit Dmg</th><th>Boss Dmg</th><th>IED</th><th>Damage</th><th>ATT</th><th>Stats</th><th>Prob</th><th>Cost</th></tr></thead>
      <tbody>
      ${MAIN_STATS.map((r) => `<tr><td>${r.lvl}</td><td>${r.crit}%</td><td>${r.boss}%</td><td>${r.ied}%</td><td>${r.dmg}%</td><td>${r.att}</td><td>${r.stat}</td><td>${r.prob != null ? r.prob + "%" : "-"}</td><td>${r.cost != null ? r.cost : "-"}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Additional Stats Reference (per slot)</h2>
    <table>
      <thead><tr><th>Lvl</th><th>Crit Dmg</th><th>Boss Dmg</th><th>IED</th><th>Damage</th><th>ATT</th><th>Stats</th></tr></thead>
      <tbody>
      ${ADDITIONAL_STATS.map((r) => `<tr><td>${r.lvl}</td><td>${r.crit}%</td><td>${r.boss}%</td><td>${r.ied}%</td><td>${r.dmg}%</td><td>${r.att}</td><td>${r.stat}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

/* ================= EVENTS ================= */
function attachEvents() {
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        activeTab = b.dataset.tab;
        render();
      }),
  );

  const profileSelect = document.getElementById("profileSelect");
  if (profileSelect)
    profileSelect.onchange = (e) => {
      state.current = e.target.value;
      saveState();
      render();
    };

  const newBtn = document.getElementById("newProfileBtn");
  if (newBtn)
    newBtn.onclick = () => {
      const name = prompt("New profile name:");
      if (!name || state.profiles[name]) return;
      const classNames = Object.keys(PRIORITY_CONFIG);
      const classKey = prompt(
        `Base this on which class template? (${classNames.join(", ")}, or leave blank for none)`,
        "",
      );
      state.profiles[name] = defaultProfile(
        classNames.includes(classKey) ? classKey : null,
      );
      state.current = name;
      saveState();
      render();
    };
  const renameBtn = document.getElementById("renameProfileBtn");
  if (renameBtn)
    renameBtn.onclick = () => {
      const name = prompt("Rename profile to:", state.current);
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
      const blob = new Blob([JSON.stringify(state, null, 2)], {
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
          if (data.profiles && data.current) {
            state = data;
            saveState();
            render();
          } else alert("Invalid file format.");
        } catch (err) {
          alert("Could not read file.");
        }
      };
      reader.readAsText(file);
    };

  const p = curProfile();

  // Node tab events
  document.querySelectorAll('[data-action="renameNode"]').forEach(
    (el) =>
      (el.onchange = (e) => {
        const n = p.nodes.find((x) => x.id === e.target.dataset.id);
        n.name = e.target.value;
        saveState();
      }),
  );
  document.querySelectorAll('[data-action="typeNode"]').forEach(
    (el) =>
      (el.onchange = (e) => {
        const n = p.nodes.find((x) => x.id === e.target.dataset.id);
        n.type = e.target.value;
        saveState();
        render();
      }),
  );
  document.querySelectorAll('[data-action="levelNode"]').forEach(
    (el) =>
      (el.onchange = (e) => {
        const n = p.nodes.find((x) => x.id === e.target.dataset.id);
        let v = parseInt(e.target.value) || 0;
        v = Math.max(0, Math.min(MAX_LEVEL, v));
        n.level = v;
        saveState();
        render();
      }),
  );
  document.querySelectorAll('[data-action="removeNode"]').forEach(
    (el) =>
      (el.onclick = (e) => {
        const id = e.target.dataset.id;
        p.nodes = p.nodes.filter((n) => n.id !== id);
        saveState();
        render();
      }),
  );
  const addNodeBtn = document.getElementById("addNodeBtn");
  if (addNodeBtn)
    addNodeBtn.onclick = () => {
      p.nodes.push({
        id: uid(),
        key: "custom-" + uid(),
        name: "New Node",
        type: "skill12",
        level: 0,
      });
      saveState();
      render();
    };

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

  // Hexa stats tab
  const hexaMainInput = document.getElementById("hexaMainInput");
  if (hexaMainInput)
    hexaMainInput.onchange = (e) => {
      p.hexaMain = Math.max(0, Math.min(10, parseInt(e.target.value) || 0));
      saveState();
      render();
    };
  const hexaAddInput = document.getElementById("hexaAddInput");
  if (hexaAddInput)
    hexaAddInput.onchange = (e) => {
      p.hexaAdd = Math.max(0, Math.min(10, parseInt(e.target.value) || 0));
      saveState();
      render();
    };
}

render();
