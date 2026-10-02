/* ================= STATE ================= */
const STORAGE_KEY = "hexaMatrixTrackerData";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Icons live at icons/<class>/<node key>.png; missing ones just hide.
const THEME_KEY = "hexaMatrixTrackerTheme";
const THEMES = [
  ["dark", "Dark Mode (Dark)"],
  ["light", "Light Mode (Light)"],
  ["mocha", "Mocha (Dark)"],
  ["evergreen", "Evergreen (Dark)"],
  ["milk-tea", "Milk Tea (Light)"],
  ["matcha", "Matcha (Light)"],
  ["nightshade", "Nightshade (Dark)"],
  ["lavender", "Lavender (Light)"],
  ["midnight-blue", "Midnight Blue (Dark)"],
  ["cloud", "Cloud (Light)"],
];
let theme = localStorage.getItem(THEME_KEY);
if (!THEMES.some(([id]) => id === theme)) theme = "dark";
document.documentElement.dataset.theme = theme;

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

const ERDA_ICON = `<img class="cur-icon" src="icons/erda.png" alt="Sol Erda" title="Sol Erda">`;
const FRAG_ICON = `<img class="cur-icon" src="icons/fragments.png" alt="Fragments" title="Fragments">`;
const costText = (se, frag) =>
  `${fmt(se)} ${ERDA_ICON} / ${fmt(frag)} ${FRAG_ICON}`;

const fmt = (n) => n.toLocaleString("en-US");

function nodeIcon(classKey, key) {
  if (!classKey) return "";
  return `<img class="node-icon" src="icons/${slug(classKey)}/${slug(key)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}

// Every class gets its Origin skill (the first skill12 node) at level 1 for free.
function isOrigin(p, n) {
  return p.nodes.find((x) => x.type === "skill12") === n;
}

function minLevel(p, n) {
  return isOrigin(p, n) ? 1 : 0;
}

function nodeCost(p, n, from, to) {
  if (!isOrigin(p, n)) return costBetween(n.type, from, to);
  return costBetween(n.type, Math.max(from, 1), Math.max(to, 1));
}

function buildNodesFromTemplate(classKey) {
  const tpl = PRIORITY_CONFIG[classKey];
  if (!tpl) return [];
  const nodes = tpl.nodes.map((n) => ({
    id: uid(),
    key: n.key,
    name: n.name || n.key,
    type: n.type,
    level: n.level,
  }));
  const origin = nodes.find((n) => n.type === "skill12");
  if (origin) origin.level = Math.max(origin.level, 1);
  return nodes;
}

const STAT_CORES = ["I", "II", "III"];
const STAT_CORE_ICONS = ["stat1.webp", "stat2.png", "stat3.png"];
const STAT_SLOTS = [
  { key: "main", label: "Main", max: 10 },
  { key: "second", label: "2nd", max: 10 },
  { key: "third", label: "3rd", max: 10 },
];

function defaultStats() {
  return STAT_CORES.map(() => ({
    main: 0,
    second: 0,
    third: 0,
    types: { main: "", second: "", third: "" },
  }));
}

const STAT_CORE_TOTAL_MAX = 20;
const STAT_OPTIONS = [
  "Critical Damage",
  "Boss Damage",
  "Ignore Defense",
  "Damage",
  "Attack/M.Attack",
  "Main Stat",
];

// Each slot caps at slot.max, and a core's three slots can total at most
// STAT_CORE_TOTAL_MAX. `others` is the sum of the core's other two slots.
function clampStat(slot, v, others = 0) {
  const cap = Math.min(slot.max, STAT_CORE_TOTAL_MAX - others);
  return Math.max(0, Math.min(cap, parseInt(v) || 0));
}

// Fill in / clamp stats on profiles saved before stats existed.
function ensureStats(p) {
  const old = Array.isArray(p.stats) ? p.stats : [];
  p.stats = defaultStats().map((d, i) => {
    let total = 0;
    const used = new Set();
    STAT_SLOTS.forEach((sl) => {
      d[sl.key] = clampStat(sl, old[i] && old[i][sl.key], total);
      total += d[sl.key];
      // A stat can only be picked once per core
      let t = old[i] && old[i].types && old[i].types[sl.key];
      if (t === "Attack") t = "Attack/M.Attack"; // renamed option
      if (STAT_OPTIONS.includes(t) && !used.has(t)) {
        d.types[sl.key] = t;
        used.add(t);
      }
    });
    return d;
  });
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
    stats: defaultStats(),
    fragOwned: 0,
    fragPerDay: 0,
  };
}

function defaultState() {
  const classKey = PRIORITY_CONFIG["Kanna"]
    ? "Kanna"
    : Object.keys(PRIORITY_CONFIG)[0];
  return { profiles: { [classKey]: defaultProfile(classKey) }, current: classKey };
}

// Saved nodes keep a copy of their display name; resync them with the template.
function syncNodeNames(st) {
  Object.values(st.profiles || {}).forEach((p) => {
    ensureStats(p);
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
      (saved.profiles || []).forEach((p) =>
        (p.nodes || []).forEach((n) => {
          n.level = Math.max(minLevel(p, n), n.level);
        }),
      );
      if (!saved.profiles || !Object.keys(saved.profiles).length) {
        return defaultState();
      }
      if (!saved.profiles[saved.current]) {
        saved.current = Object.keys(saved.profiles)[0];
      }
      return saved;
    } catch (e) {}
  }
  return defaultState();
}

// Data is always auto-saved to this browser; "unsaved" means changes made since
// the last backup export. Persisted so it survives a reload.
const DIRTY_KEY = "hexaMatrixTrackerUnsaved";
let unsaved = localStorage.getItem(DIRTY_KEY) === "1";

function setUnsaved(v) {
  unsaved = v;
  if (v) localStorage.setItem(DIRTY_KEY, "1");
  else localStorage.removeItem(DIRTY_KEY);
  const badge = document.getElementById("unsavedBadge");
  if (badge) badge.hidden = !v;
}

// markDirty = false for changes a backup doesn't capture (selection, fragments, preset)
function saveState(markDirty = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (markDirty) setUnsaved(true);
}

window.addEventListener("beforeunload", (e) => {
  if (unsaved) e.preventDefault();
});

let state = loadState();
let activeTab = "nodes";
let editingChar = null; // name of the character being renamed inline

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
  profile.stats = entry.stats;
  ensureStats(profile);
  const levelByKey = {};
  (entry.nodes || []).forEach((n) => {
    levelByKey[n.key] = n.level;
  });
  profile.nodes.forEach((n) => {
    if (levelByKey.hasOwnProperty(n.key)) {
      n.level = Math.max(
        minLevel(profile, n),
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
    <div class="page-header">
    <h1><img class="page-logo" src="icons/hexa.webp" alt="">HEXA Matrix Tracker
      <span class="help" tabindex="0" aria-label="How to use this tool"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <span class="help-tip">
          <strong>How to use</strong>
          <ul>
            <li>Use <em>+ New Character</em> to add characters, then click between them at the top.</li>
            <li><em>HEXA Tracker</em>: Enter the current level of each HEXA skill. Costs to the next level and to max update automatically.</li>
            <li><em>Upgrade Priority</em>: Follows a recommended leveling order. Enter your fragments owned and gained per day to estimate how long each step takes.</li>
            <li><em>Next Upgrade</em> shows the next step in the priority order you haven't completed yet.</li>
            <li>Progress saves automatically in this browser. Use <em>Export JSON</em> / <em>Import JSON</em> to back up or move it.</li>
          </ul>
          <div class="help-note">Costs are verified against source data. The leveling priority order is locked to a fixed configuration.</div>
        </span>
      </span>
    </h1>
    ${renderHeaderControls()}
    </div>
    ${renderTopbar()}
    <div class="tabs">
      <button data-tab="nodes" class="${activeTab === "nodes" ? "active" : ""}">HEXA Tracker</button>
      <button data-tab="sequence" class="${activeTab === "sequence" ? "active" : ""}">Upgrade Priority</button>
    </div>
    ${activeTab === "nodes" ? renderNodesTab(p) : ""}
    ${activeTab === "sequence" ? renderSequenceTab(p) : ""}
    <input type="file" id="importFile" style="display:none" accept="application/json">
  `;
  attachEvents();
}

function renderTopbar() {
  const tabs = Object.keys(state.profiles)
    .map((n) => {
      const active = n === state.current;
      const label =
        active && editingChar === n
          ? `<input class="char-edit" value="${escapeHtml(n)}" maxlength="30" />`
          : `<span class="char-name" ${active ? 'title="Click to rename"' : ""}>${escapeHtml(n)}</span>`;
      return `<div class="char-tab ${active ? "active" : ""}" data-char="${encodeURIComponent(n)}" role="button" tabindex="0">${label}<span class="char-class">${escapeHtml(state.profiles[n].classKey || "")}</span><button class="char-del" data-del="${encodeURIComponent(n)}" aria-label="Delete ${escapeHtml(n)}" title="Delete">×</button></div>`;
    })
    .join("");
  return `
  <div class="char-tabs">${tabs}<button id="newProfileBtn">+ New Character</button></div>`;
}

function renderHeaderControls() {
  return `<div class="header-controls">
    <span id="unsavedBadge" class="unsaved-badge" ${unsaved ? "" : "hidden"} title="Changes are saved in this browser, but not backed up to a file. Click the save icon to export a backup.">● Unsaved changes</span>
    <button id="exportBtn" class="icon-btn" data-fullname="Save backup (Export JSON)" aria-label="Export JSON">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
    </button>
    <button id="importBtn" class="icon-btn" data-fullname="Load backup (Import JSON)" aria-label="Import JSON">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M12 17v-6"/><path d="m9 14 3-3 3 3"/></svg>
    </button>
    <label style="color:var(--muted);font-size:12px;">Theme:</label>
    <select id="themeSelect">
      ${THEMES.map(([id, label]) => `<option value="${id}" ${id === theme ? "selected" : ""}>${label}</option>`).join("")}
    </select>
  </div>`;
}

const NODE_SECTIONS = [
  { title: "Origin / Ascent", types: ["skill12", "skill3"] },
  { title: "Masteries", types: ["mastery"] },
  { title: "Enhancements", types: ["boost"] },
  { title: "Common", types: ["common12", "common3"] },
];

function renderNodeSection(p, sec) {
  const rows = p.nodes
    .map((n, idx) => ({ n, idx }))
    .filter(({ n }) => sec.types.includes(n.type))
    .map(({ n, idx }) => {
      const next =
        n.level < MAX_LEVEL
          ? nodeCost(p, n, n.level, n.level + 1)
          : { se: 0, frag: 0 };
      const toMax = nodeCost(p, n, n.level, MAX_LEVEL);
      return `<tr>
            <td class="node-name" data-fullname="${n.name}">${nodeIcon(p.classKey, n.key)}${n.name}</td>
            <td><input type="number" min="${minLevel(p, n)}" max="${MAX_LEVEL}" data-action="levelNode" data-id="${n.id}" data-idx="${idx}" value="${n.level}"></td>
            ${
              n.level < MAX_LEVEL
                ? `<td>${fmt(next.se)}</td><td>${fmt(next.frag)}</td><td>${fmt(toMax.se)}</td><td>${fmt(toMax.frag)}</td>`
                : '<td colspan="4">MAX</td>'
            }
          </tr>`;
    })
    .join("");
  return `<div class="panel">
    <h2>${sec.title}</h2>
    <table>
      <thead>
        <tr><th class="node-name" rowspan="2">Name</th><th rowspan="2">Level</th><th colspan="2">Cost to next</th><th colspan="2">Cost to max</th></tr>
        <tr><th>${ERDA_ICON}</th><th>${FRAG_ICON}</th><th>${ERDA_ICON}</th><th>${FRAG_ICON}</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" class="hint">None</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderStatsSection(p) {
  return `<div class="panel">
    <h2 class="section-title">HEXA Stats</h2>
    <div class="stat-cores">
      ${STAT_CORES.map(
        (core, ci) => `<div class="panel">
        <h2><img class="stat-core-icon" src="icons/${STAT_CORE_ICONS[ci]}" alt="${core}" title="HEXA Stat ${core}"></h2>
        <table>
          <tbody>
            ${STAT_SLOTS.map(
              (sl) => `<tr>
              <td class="stat-label">${sl.label}</td>
              <td><select data-action="typeStat" data-core="${ci}" data-slot="${sl.key}">
                <option value="">—</option>
                ${STAT_OPTIONS.map((o) => {
                  const taken = STAT_SLOTS.some(
                    (x) => x.key !== sl.key && p.stats[ci].types[x.key] === o,
                  );
                  return `<option value="${o}" ${p.stats[ci].types[sl.key] === o ? "selected" : ""} ${taken ? "disabled" : ""}>${o}</option>`;
                }).join("")}
              </select></td>
              <td><input type="number" min="0" max="${sl.max}" data-action="levelStat" data-core="${ci}" data-slot="${sl.key}" value="${p.stats[ci][sl.key]}"></td>
            </tr>`,
            ).join("")}
          </tbody>
        </table>
      </div>`,
      ).join("")}
    </div>
  </div>`;
}

// Sol Janus isn't refunded by a HEXA Reset Scroll, so it's excluded.
function renderResetScrollSection(p) {
  const used = p.nodes
    .filter((n) => !n.name.startsWith("Sol Janus"))
    .reduce(
      (s, n) => {
        const c = nodeCost(p, n, 0, n.level);
        return { se: s.se + c.se, frag: s.frag + c.frag };
      },
      { se: 0, frag: 0 },
    );
  return `<div class="panel">
    <h2>Hexa Reset Scroll</h2>
    <div class="grid">
      <div class="stat-card"><div class="label">Total used by all skills (excluding Sol Janus)</div><div class="value">${costText(used.se, used.frag)}</div></div>
    </div>
  </div>`;
}

function renderNodesTab(p) {
  const totalToMax = p.nodes.reduce(
    (s, n) => {
      const c = nodeCost(p, n, 0, MAX_LEVEL);
      return { se: s.se + c.se, frag: s.frag + c.frag };
    },
    { se: 0, frag: 0 },
  );
  const spent = p.nodes.reduce(
    (s, n) => {
      const c = nodeCost(p, n, 0, n.level);
      return { se: s.se + c.se, frag: s.frag + c.frag };
    },
    { se: 0, frag: 0 },
  );
  const pct = totalToMax.frag ? (spent.frag / totalToMax.frag) * 100 : 0;

  const cfg = p.classKey ? PRIORITY_CONFIG[p.classKey] : null;
  const presetNames = cfg ? Object.keys(cfg.priorities) : [];
  const nextStep =
    presetNames.length > 0
      ? simulateSequence(p, cfg, presetNames).nextStep
      : null;

  return `
  ${nextStep ? renderNextUpgrade(p, nextStep) : ""}

  <div class="panel">
    <h2>Summary</h2>
    <div class="grid">
      <div class="stat-card"><div class="label">Total to fully max all nodes</div><div class="value">${costText(totalToMax.se, totalToMax.frag)}</div></div>
      <div class="stat-card"><div class="label">Spent so far (based on current levels)</div><div class="value">${costText(spent.se, spent.frag)}</div></div>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="hint">${pct.toFixed(2)}% complete</div>
  </div>

  <div class="panel">
    <h2 class="section-title">HEXA Skills</h2>
    <div class="node-sections">
      ${NODE_SECTIONS.map((sec) => renderNodeSection(p, sec)).join("")}
    </div>
  </div>

  ${renderStatsSection(p)}

  ${renderResetScrollSection(p)}
`;
}

function simulateSequence(p, cfg, presetNames) {
  const presetName = cfg.priorities[p.presetName] ? p.presetName : presetNames[0];
  const seq = cfg.priorities[presetName];
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
      : nodeCost(p, node, from, target);
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
  return { rows, nextStep, runningSE, runningFrag, totalDays, presetName };
}

function renderNextUpgrade(p, nextStep) {
  return `
  <div class="panel">
    <h2>Next Upgrade</h2>
    <div class="value" style="font-size:16px;">${nodeIcon(p.classKey, nextStep.node.key)}${nextStep.node.name}: level ${nextStep.node.level} → ${nextStep.target}</div>
    <div class="hint">${costText(nextStep.cost.se, nextStep.cost.frag)} needed for this step ${nextStep.daysFromStart != null ? `(~${nextStep.daysFromStart.toFixed(1)} days at current rate)` : ""}</div>
  </div>`;
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

  const { rows, nextStep, runningSE, runningFrag, totalDays, presetName } =
    simulateSequence(p, cfg, presetNames);

  return `
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

  ${nextStep ? renderNextUpgrade(p, nextStep) : ""}

  <div class="panel">
    <h2>Priority Order — ${presetName}</h2>
    <div class="hint" style="margin-bottom:8px;">Completed steps (based on your current node levels) are dimmed and struck through.</div>
    ${rows
      .map((r, i) => {
        if (r.note)
          return `<div class="step-row note"><span class="step-num">${i + 1}</span><span class="step-info">${r.note}</span></div>`;
        return `<div class="step-row ${r.done ? "done" : ""}">
        <span class="step-num">${i + 1}</span>
        <span class="step-info">${nodeIcon(p.classKey, r.node.key)}${r.node.name} → level ${r.target}
          <span class="hint">(${costText(r.cost.se, r.cost.frag)} · running total: ${costText(r.runningSE, r.runningFrag)}${r.daysFromStart != null ? ` · ~${r.daysFromStart.toFixed(1)} days` : ""})</span>
        </span>
      </div>`;
      })
      .join("")}
  </div>

  <div class="panel">
    <h2>${FRAG_ICON}</h2>
    <div class="grid">
      <div><label class="hint">${FRAG_ICON} owned</label><br><input type="number" id="fragOwned" value="${p.fragOwned}"></div>
      <div><label class="hint">${FRAG_ICON} obtained per day</label><br><input type="number" id="fragPerDay" value="${p.fragPerDay}"></div>
    </div>
  </div>

  <div class="panel">
    <h2>Totals</h2>
    <div class="grid">
      <div class="stat-card"><div class="label">Total remaining in this order</div><div class="value">${costText(runningSE, runningFrag)}</div></div>
      <div class="stat-card"><div class="label">Est. days to complete</div><div class="value">${totalDays != null ? totalDays.toFixed(1) + " days" : `set ${FRAG_ICON}/day`}</div></div>
    </div>
  </div>`;
}

/* ================= EVENTS ================= */
/* Dialog asking for a character name and class. Resolves to
   { name, classKey }, or undefined if cancelled. */
function pickNewCharacter() {
  return new Promise((resolve) => {
    const classNames = Object.keys(PRIORITY_CONFIG).sort((a, b) =>
      a.localeCompare(b),
    );
    const dlg = document.createElement("dialog");
    dlg.style.cssText =
      "background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:16px;";
    dlg.innerHTML = `
      <form method="dialog">
        <label>Character name<br />
          <input id="charName" placeholder="Name" autocomplete="off" required />
        </label>
        <br /><br />
        <label>Class<br />
          <select id="charClass" required>
            <option value="" disabled selected>Select a class</option>
            ${classNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}
          </select>
        </label>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
          <button value="cancel" formnovalidate>Cancel</button>
          <button value="ok">Add</button>
        </div>
      </form>`;
    const nameInput = dlg.querySelector("#charName");
    const classSelect = dlg.querySelector("#charClass");
    nameInput.addEventListener("input", () => {
      const n = nameInput.value.trim();
      nameInput.setCustomValidity(
        state.profiles[n] ? "A character with that name already exists" : "",
      );
    });
    classSelect.addEventListener("change", () => {
      if (!nameInput.value.trim()) {
        nameInput.value = classSelect.value;
        nameInput.dispatchEvent(new Event("input"));
      }
    });
    dlg.addEventListener("close", () => {
      const ok = dlg.returnValue === "ok";
      const result = { name: nameInput.value.trim(), classKey: classSelect.value };
      dlg.remove();
      resolve(ok && result.name && result.classKey ? result : undefined);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    nameInput.focus();
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

  document.querySelectorAll("[data-char]").forEach((tab) => {
    const name = decodeURIComponent(tab.dataset.char);
    tab.onclick = (e) => {
      if (e.target.closest(".char-del") || e.target.closest(".char-edit")) return;
      if (name === state.current) {
        if (e.target.closest(".char-name")) {
          editingChar = name;
          render();
        }
        return;
      }
      state.current = name;
      saveState(false);
      render();
    };
  });

  document.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const name = decodeURIComponent(b.dataset.del);
      if (Object.keys(state.profiles).length <= 1) {
        alert("Can't delete the only character.");
        return;
      }
      if (!confirm(`Delete character "${name}"?`)) return;
      delete state.profiles[name];
      if (state.current === name) state.current = Object.keys(state.profiles)[0];
      editingChar = null;
      saveState();
      render();
    };
  });

  const editInput = document.querySelector(".char-edit");
  if (editInput) {
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const old = editingChar;
      const name = editInput.value.trim();
      editingChar = null;
      if (commit && name && name !== old) {
        if (state.profiles[name]) {
          alert("A character with that name already exists.");
        } else {
          // Rebuild so the renamed character keeps its position
          const renamed = {};
          Object.keys(state.profiles).forEach((k) => {
            renamed[k === old ? name : k] = state.profiles[k];
          });
          state.profiles = renamed;
          state.current = name;
          saveState();
        }
      }
      render();
    };
    editInput.onkeydown = (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    };
    editInput.onblur = () => finish(true);
    editInput.focus();
    editInput.select();
  }

  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect)
    themeSelect.onchange = (e) => {
      theme = e.target.value;
      localStorage.setItem(THEME_KEY, theme);
      document.documentElement.dataset.theme = theme;
    };

  const newBtn = document.getElementById("newProfileBtn");
  if (newBtn)
    newBtn.onclick = async () => {
      const picked = await pickNewCharacter();
      if (!picked || state.profiles[picked.name]) return;
      const { name, classKey } = picked;
      state.profiles[name] = defaultProfile(classKey);
      state.current = name;
      saveState();
      render();
    };
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn)
    exportBtn.onclick = () => {
      const exportData = {
        profiles: Object.values(state.profiles).map((prof) => ({
          name: Object.keys(state.profiles).find((k) => state.profiles[k] === prof),
          class: prof.classKey,
          nodes: prof.nodes.map((n) => ({ key: n.key, level: n.level })),
          stats: prof.stats,
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
      setUnsaved(false);
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
            const name = entry.name || entry.class;
            if (!name || !entry.class) return;
            newProfiles[name] = profileFromImportEntry(entry);
          });
          if (Object.keys(newProfiles).length === 0) {
            alert("No valid classes found in file.");
            return;
          }
          state.profiles = newProfiles;
          state.current = Object.keys(newProfiles)[0];
          saveState(false);
          setUnsaved(false); // state now matches the imported file
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
    v = Math.max(minLevel(p, n), Math.min(MAX_LEVEL, v));
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

  document.querySelectorAll('[data-action="typeStat"]').forEach((el) => {
    el.onchange = (e) => {
      p.stats[e.target.dataset.core].types[e.target.dataset.slot] =
        e.target.value;
      saveState();
      render();
    };
  });

  document.querySelectorAll('[data-action="levelStat"]').forEach((el) => {
    el.onchange = (e) => {
      const slot = STAT_SLOTS.find((sl) => sl.key === e.target.dataset.slot);
      const core = p.stats[e.target.dataset.core];
      const others = STAT_SLOTS.reduce(
        (sum, sl) => (sl === slot ? sum : sum + core[sl.key]),
        0,
      );
      const v = clampStat(slot, e.target.value, others);
      core[slot.key] = v;
      e.target.value = v;
      saveState();
    };
  });

  // Sequence tab events
  const fragOwned = document.getElementById("fragOwned");
  if (fragOwned)
    fragOwned.onchange = (e) => {
      p.fragOwned = parseInt(e.target.value) || 0;
      saveState(false);
      render();
    };
  const fragPerDay = document.getElementById("fragPerDay");
  if (fragPerDay)
    fragPerDay.onchange = (e) => {
      p.fragPerDay = parseInt(e.target.value) || 0;
      saveState(false);
      render();
    };
  const presetSelect = document.getElementById("presetSelect");
  if (presetSelect)
    presetSelect.onchange = (e) => {
      p.presetName = e.target.value;
      saveState(false);
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
