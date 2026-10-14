// HA Blockly Automations - sidebar panel.
// Rendered in light DOM (Blockly injects its CSS into document head and works
// best outside a shadow root). All styles are scoped under .hab-root.

import { defineBlocks, TOOLBOX } from "./blocks.js";
import { compileWorkspace } from "./compiler.js";
import { buildFromIR } from "./irloader.js";

const BLOCKLY_SRC = "/ha_blockly_frontend/vendor/blockly.min.js";

function loadBlockly() {
  if (window.Blockly) return Promise.resolve(window.Blockly);
  if (window.__haBlocklyPromise) return window.__haBlocklyPromise;
  window.__haBlocklyPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = BLOCKLY_SRC;
    s.onload = () => resolve(window.Blockly);
    s.onerror = () => reject(new Error("Blockly konnte nicht geladen werden"));
    document.head.appendChild(s);
  });
  return window.__haBlocklyPromise;
}

const STYLES = `
.hab-root{display:flex;flex-direction:column;height:100vh;overflow:hidden;box-sizing:border-box;
  background:var(--primary-background-color,#fafafa);color:var(--primary-text-color,#212121);
  font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif);}
.hab-toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;flex-wrap:wrap;
  background:var(--app-header-background-color,var(--primary-color,#03a9f4));
  color:var(--app-header-text-color,#fff);}
.hab-toolbar .title{font-size:18px;font-weight:500;margin-right:12px;}
.hab-toolbar input,.hab-toolbar select{padding:6px 8px;border-radius:6px;border:none;
  font-size:14px;background:#fff;color:#212121;}
.hab-toolbar input.name{min-width:220px;}
.hab-btn{cursor:pointer;border:none;border-radius:6px;padding:7px 12px;font-size:14px;
  background:rgba(255,255,255,.18);color:#fff;}
.hab-btn:hover{background:rgba(255,255,255,.3);}
.hab-btn.primary{background:#fff;color:var(--primary-color,#03a9f4);font-weight:500;}
.hab-body{display:flex;flex:1;min-height:0;}
.hab-editor{flex:1;min-width:0;position:relative;}
#hab-blockly{position:absolute;inset:0;}
.hab-side{width:340px;max-width:45%;display:flex;flex-direction:column;
  border-left:1px solid var(--divider-color,#e0e0e0);
  background:var(--card-background-color,#fff);overflow:hidden;}
.hab-side h3{margin:0;padding:12px 14px 6px;font-size:13px;text-transform:uppercase;
  letter-spacing:.04em;color:var(--secondary-text-color,#727272);}
.hab-side-actions{display:flex;gap:8px;padding:6px 12px;}
.hab-side-actions .hab-btn{background:var(--secondary-background-color,#e8e8e8);
  color:var(--primary-text-color,#212121);flex:1;text-align:center;}
.hab-tree{flex:1;overflow:auto;padding:4px 6px;}
.hab-folder{font-weight:500;padding:6px 8px;border-radius:6px;display:flex;align-items:center;
  gap:6px;cursor:default;color:var(--primary-text-color,#212121);}
.hab-folder .fname{flex:1;}
.hab-folder .fbtn,.hab-rule .rbtn{cursor:pointer;opacity:.55;font-size:13px;border:none;
  background:none;color:inherit;padding:2px 4px;}
.hab-folder .fbtn:hover,.hab-rule .rbtn:hover{opacity:1;}
.hab-rule{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;
  cursor:pointer;margin:1px 0;}
.hab-rule:hover{background:var(--secondary-background-color,#f0f0f0);}
.hab-rule.active{background:var(--primary-color,#03a9f4);color:#fff;}
.hab-rule .rname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hab-rule.disabled .rname{opacity:.5;text-decoration:line-through;}
.hab-ai{border-top:1px solid var(--divider-color,#e0e0e0);padding:10px 12px;}
.hab-ai textarea{width:100%;box-sizing:border-box;min-height:70px;border-radius:8px;
  border:1px solid var(--divider-color,#ccc);padding:8px;font-size:14px;resize:vertical;
  background:var(--primary-background-color,#fff);color:var(--primary-text-color,#212121);}
.hab-ai .row{display:flex;gap:8px;margin-top:8px;align-items:center;}
.hab-ai select{flex:1;padding:6px;border-radius:6px;}
.hab-ai .hab-btn{background:var(--primary-color,#03a9f4);color:#fff;}
.hab-status{font-size:12px;color:var(--secondary-text-color,#727272);padding:4px 12px;min-height:16px;}
.hab-empty{padding:16px;color:var(--secondary-text-color,#888);font-size:13px;}
.hab-btn.hab-theme{margin-left:auto;font-size:16px;line-height:1;padding:6px 10px;}
/* Toolbox category labels: fixed colours (independent of the HA theme) */
.hab-root .blocklyToolboxCategoryLabel,.hab-root .blocklyTreeLabel{
  color:#2b2b2b!important;font-size:14px!important;vertical-align:middle;}
/* Editable field boxes on blocks: Blockly's default field CSS (white fill) does
   not reach the shadow root, so the rect renders black. Set it explicitly.
   Only editable fields are targeted, so block labels keep their own colour. */
.hab-root .blocklyFieldRect{fill:#ffffff!important;stroke:#c7c7c7!important;fill-opacity:1!important;}
.hab-root .blocklyEditableText>text{fill:#202020!important;}
.hab-root[data-theme="dark"] .blocklyFieldRect{fill:#3b3b3b!important;stroke:#555555!important;}
.hab-root[data-theme="dark"] .blocklyEditableText>text{fill:#f0f0f0!important;}
/* Light mode (fixed so the toggle works regardless of HA's own theme) */
.hab-root[data-theme="light"]{background:#fafafa;color:#212121;}
.hab-root[data-theme="light"] .hab-side{background:#ffffff;border-left-color:#e0e0e0;}
.hab-root[data-theme="light"] .hab-side h3{color:#727272;}
.hab-root[data-theme="light"] .hab-side-actions .hab-btn{background:#e8e8e8;color:#212121;}
.hab-root[data-theme="light"] .hab-tree,.hab-root[data-theme="light"] .hab-folder{color:#212121;}
.hab-root[data-theme="light"] .hab-rule:hover{background:#f0f0f0;}
.hab-root[data-theme="light"] .hab-ai textarea{background:#ffffff;color:#212121;border-color:#ccc;}
.hab-root[data-theme="light"] .hab-status{color:#727272;}
.hab-root[data-theme="light"] .hab-toolbar input,.hab-root[data-theme="light"] .hab-toolbar select{background:#fff;color:#212121;}
/* Dark mode */
.hab-root[data-theme="dark"]{background:#1e1e1e;color:#e0e0e0;}
.hab-root[data-theme="dark"] .hab-side{background:#252525;border-left-color:#333;}
.hab-root[data-theme="dark"] .hab-side h3{color:#9e9e9e;}
.hab-root[data-theme="dark"] .hab-side-actions .hab-btn{background:#333;color:#e0e0e0;}
.hab-root[data-theme="dark"] .hab-tree,.hab-root[data-theme="dark"] .hab-folder{color:#e0e0e0;}
.hab-root[data-theme="dark"] .hab-rule:hover{background:#333;}
.hab-root[data-theme="dark"] .hab-ai{border-top-color:#333;}
.hab-root[data-theme="dark"] .hab-ai textarea{background:#1e1e1e;color:#e0e0e0;border-color:#444;}
.hab-root[data-theme="dark"] .hab-status{color:#9e9e9e;}
.hab-root[data-theme="dark"] .hab-toolbar input,.hab-root[data-theme="dark"] .hab-toolbar select{background:#333;color:#e0e0e0;}
.hab-root[data-theme="dark"] .blocklyToolboxCategoryLabel,.hab-root[data-theme="dark"] .blocklyTreeLabel{color:#e0e0e0!important;}
/* Execution trace + log panel */
.hab-trace{display:flex;flex-direction:column;height:220px;flex:none;
  border-top:1px solid var(--divider-color,#e0e0e0);background:var(--card-background-color,#fff);overflow:hidden;}
.hab-trace.collapsed{height:34px;}
.hab-trace-head{display:flex;align-items:center;gap:10px;padding:6px 12px;cursor:pointer;
  font-size:13px;font-weight:500;background:var(--secondary-background-color,#f2f2f2);user-select:none;}
.hab-trace-head .sp{flex:1;}
.hab-trace-head .hab-btn{background:rgba(0,0,0,.08);color:inherit;padding:4px 8px;font-size:12px;}
.hab-trace-body{flex:1;display:flex;min-height:0;}
.hab-trace-tl{width:46%;overflow:auto;padding:8px 12px;border-right:1px solid var(--divider-color,#e0e0e0);}
.hab-trace-log{flex:1;overflow:auto;padding:8px 12px;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.5;}
.hab-step{display:flex;gap:9px;align-items:flex-start;padding:3px 0;font-size:13px;}
.hab-step .lbl{flex:1;}
.hab-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;flex:none;background:#9e9e9e;}
.hab-dot.ok{background:#43a047;}
.hab-dot.error{background:#e53935;}
.hab-dot.stopped{background:#fb8c00;}
.hab-dot.trigger{background:#039be5;}
.hab-step .meta{color:var(--secondary-text-color,#888);font-size:11px;}
.hab-trace-empty{color:var(--secondary-text-color,#888);font-size:13px;padding:8px;}
.hab-log-line{white-space:pre-wrap;}
.hab-log-line.error{color:#e53935;}
.hab-log-line.stopped{color:#fb8c00;}
.hab-log-line.head{font-weight:600;margin-top:4px;}
.hab-root[data-theme="dark"] .hab-trace{background:#252525;border-top-color:#333;}
.hab-root[data-theme="dark"] .hab-trace-head{background:#2f2f2f;}
.hab-root[data-theme="dark"] .hab-trace-head .hab-btn{background:rgba(255,255,255,.1);}
.hab-root[data-theme="dark"] .hab-trace-tl{border-right-color:#333;}
.hab-root[data-theme="dark"] .hab-trace,.hab-root[data-theme="dark"] .hab-trace-log{color:#e0e0e0;}
`;

class HaBlocklyPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._rules = [];
    this._folders = [];
    this._agents = [];
    this._currentId = null;
    this._workspace = null;
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) {
      this._built = true;
      this._build();
    }
  }
  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this.style.height = "100%";
    this.style.display = "block";
  }

  async _build() {
    this.innerHTML = `
      <style>${STYLES}</style>
      <div class="hab-root">
        <div class="hab-toolbar">
          <span class="title">🧩 Blockly</span>
          <input class="name" id="hab-name" placeholder="Regelname" />
          <select id="hab-folder"></select>
          <button class="hab-btn primary" id="hab-save">Speichern</button>
          <button class="hab-btn" id="hab-new">Neu</button>
          <button class="hab-btn" id="hab-run">Test ▶</button>
          <button class="hab-btn" id="hab-reload">Engine neu laden</button>
          <button class="hab-btn hab-theme" id="hab-theme" title="Hell / Dunkel umschalten">🌙</button>
        </div>
        <div class="hab-status" id="hab-status"></div>
        <div class="hab-body">
          <div class="hab-editor"><div id="hab-blockly"></div></div>
          <div class="hab-side">
            <h3>Regeln &amp; Ordner</h3>
            <div class="hab-side-actions">
              <button class="hab-btn" id="hab-newfolder">+ Ordner</button>
              <button class="hab-btn" id="hab-refresh">Aktualisieren</button>
            </div>
            <div class="hab-tree" id="hab-tree"></div>
            <div class="hab-ai">
              <h3 style="padding:0 0 6px;">KI-Editor</h3>
              <textarea id="hab-ai-prompt" placeholder="Beschreibe die Automatisierung, z.B.: Wenn die Bewegung im Flur erkannt wird, schalte das Flurlicht für 2 Minuten an."></textarea>
              <div class="row">
                <select id="hab-ai-agent"><option value="">Standard-Agent</option></select>
                <button class="hab-btn" id="hab-ai-go">Generieren</button>
              </div>
            </div>
          </div>
        </div>
        <div class="hab-trace collapsed" id="hab-trace">
          <div class="hab-trace-head" id="hab-trace-head">
            <span id="hab-trace-caret">▸</span>
            <span>Ausführung &amp; Protokoll</span>
            <span class="sp"></span>
            <button class="hab-btn" id="hab-trace-refresh">Aktualisieren</button>
            <button class="hab-btn" id="hab-trace-clear">Log leeren</button>
          </div>
          <div class="hab-trace-body">
            <div class="hab-trace-tl" id="hab-trace-tl">
              <div class="hab-trace-empty">Noch keine Ausführung. „Test ▶" ausführen oder auf einen Auslöser warten.</div>
            </div>
            <div class="hab-trace-log" id="hab-trace-log"></div>
          </div>
        </div>
      </div>`;

    this._q("#hab-save").onclick = () => this._save();
    this._q("#hab-new").onclick = () => this._newRule();
    this._q("#hab-run").onclick = () => this._runCurrent();
    this._q("#hab-reload").onclick = () => this._reloadEngine();
    this._q("#hab-theme").onclick = () => this._toggleTheme();
    this._q("#hab-newfolder").onclick = () => this._createFolder();
    this._q("#hab-refresh").onclick = () => this._loadData();
    this._q("#hab-ai-go").onclick = () => this._aiGenerate();
    this._q("#hab-trace-head").onclick = (e) => {
      if (e.target.tagName === "BUTTON") return;
      this._toggleTrace();
    };
    this._q("#hab-trace-refresh").onclick = (e) => {
      e.stopPropagation();
      this._loadTraces();
    };
    this._q("#hab-trace-clear").onclick = (e) => {
      e.stopPropagation();
      this._q("#hab-trace-log").innerHTML = "";
    };
    this._traceOpen = false;

    this._setupAutocomplete();

    try {
      const Blockly = await loadBlockly();
      defineBlocks(Blockly);
      this._workspace = Blockly.inject(this._q("#hab-blockly"), {
        toolbox: TOOLBOX,
        renderer: "zelos",
        grid: { spacing: 22, length: 3, colour: "#ccc", snap: true },
        zoom: { controls: true, wheel: true, startScale: 0.9 },
        trashcan: true,
        move: { scrollbars: true, drag: true, wheel: true },
      });
      this._Blockly = Blockly;
      // Blockly injects its CSS into document.head, which does not cross the
      // shadow-DOM boundary of the HA panel. Clone those styles into our root
      // node so the toolbox categories and block flyout are styled/visible.
      this._injectBlocklyStyles();
      Blockly.svgResize(this._workspace);

      // Light/dark Blockly themes for the sun/moon toggle.
      this._themes = {
        light: Blockly.Theme.defineTheme("habLight", {
          name: "habLight",
          base: Blockly.Themes.Classic,
          componentStyles: {
            workspaceBackgroundColour: "#ffffff",
            toolboxBackgroundColour: "#f5f5f5",
            toolboxForegroundColour: "#2b2b2b",
            flyoutBackgroundColour: "#ffffff",
            flyoutForegroundColour: "#2b2b2b",
            scrollbarColour: "#cccccc",
          },
        }),
        dark: Blockly.Theme.defineTheme("habDark", {
          name: "habDark",
          base: Blockly.Themes.Classic,
          componentStyles: {
            workspaceBackgroundColour: "#1e1e1e",
            toolboxBackgroundColour: "#2b2b2b",
            toolboxForegroundColour: "#e0e0e0",
            flyoutBackgroundColour: "#262626",
            flyoutForegroundColour: "#e0e0e0",
            flyoutOpacity: 1,
            scrollbarColour: "#555555",
            scrollbarOpacity: 0.6,
            insertionMarkerColour: "#ffffff",
            insertionMarkerOpacity: 0.3,
          },
        }),
      };
      let saved = "light";
      try {
        saved = localStorage.getItem("ha_blockly_theme") || "light";
      } catch (e) {
        /* ignore */
      }
      this._applyTheme(saved);

      const ro = new ResizeObserver(() => Blockly.svgResize(this._workspace));
      ro.observe(this._q("#hab-blockly"));
    } catch (err) {
      this._q("#hab-blockly").innerHTML =
        `<div class="hab-empty">Fehler: ${err.message}</div>`;
    }

    await this._loadData();
    await this._loadAgents();
  }

  _q(sel) {
    return this.querySelector(sel);
  }

  _applyTheme(mode) {
    this._theme = mode === "dark" ? "dark" : "light";
    const root = this._q(".hab-root");
    if (root) root.dataset.theme = this._theme;
    const btn = this._q("#hab-theme");
    if (btn) btn.textContent = this._theme === "dark" ? "☀️" : "🌙";
    if (this._workspace && this._themes) {
      this._workspace.setTheme(this._themes[this._theme] || this._themes.light);
      if (this._Blockly) this._Blockly.svgResize(this._workspace);
    }
    try {
      window.__haBlocklyTheme = this._theme;
    } catch (e) {
      /* ignore */
    }
    try {
      localStorage.setItem("ha_blockly_theme", this._theme);
    } catch (e) {
      /* ignore */
    }
  }

  _toggleTheme() {
    this._applyTheme(this._theme === "dark" ? "light" : "dark");
  }

  _setupAutocomplete() {
    // Expose live entity/domain/service lists to the searchable Blockly fields.
    const getHass = () => this._hass;
    window.__haBlockly = {
      entities: () => {
        const h = getHass();
        return h && h.states ? Object.keys(h.states).sort() : [];
      },
      domains: () => {
        const h = getHass();
        return h && h.services ? Object.keys(h.services).sort() : [];
      },
      services: (domain) => {
        const h = getHass();
        const svc = (h && h.services) || {};
        if (domain && svc[domain]) return Object.keys(svc[domain]).sort();
        const out = [];
        for (const d in svc) for (const s in svc[d]) out.push(d + "." + s);
        return out.sort();
      },
      friendlyName: (entityId) => {
        const h = getHass();
        const st = h && h.states && h.states[entityId];
        return st && st.attributes ? st.attributes.friendly_name || "" : "";
      },
      notifyServices: () => {
        const h = getHass();
        const set = new Set();
        const svc = (h && h.services && h.services.notify) || {};
        for (const s of Object.keys(svc)) {
          if (s !== "send_message" && s !== "persistent_notification") set.add("notify." + s);
        }
        // Modern notify entities (Alexa devices, groups, …) usable via send_message.
        if (h && h.states) {
          for (const e of Object.keys(h.states)) if (e.startsWith("notify.")) set.add(e);
        }
        const out = [...set].sort();
        return out.length ? out : ["notify.notify"];
      },
      stateOptions: (entityId) => {
        const h = getHass();
        if (!entityId) return [];
        const domain = entityId.split(".")[0];
        const st = h && h.states && h.states[entityId];
        const cur = st ? st.state : null;
        const attrs = (st && st.attributes) || {};
        const BOOL = ["on", "off"];
        const map = {
          binary_sensor: BOOL, switch: BOOL, light: BOOL, input_boolean: BOOL,
          fan: BOOL, automation: BOOL, script: BOOL, remote: BOOL, siren: BOOL,
          humidifier: BOOL, update: BOOL, schedule: BOOL,
          cover: ["open", "closed", "opening", "closing"],
          lock: ["locked", "unlocked", "locking", "unlocking", "jammed", "open"],
          person: ["home", "not_home"], device_tracker: ["home", "not_home"],
          media_player: ["playing", "paused", "idle", "off", "on", "standby", "buffering"],
          climate: attrs.hvac_modes || ["off", "heat", "cool", "auto", "heat_cool", "dry", "fan_only"],
          alarm_control_panel: ["disarmed", "armed_home", "armed_away", "armed_night", "armed_vacation", "pending", "triggered", "arming"],
          vacuum: ["cleaning", "docked", "paused", "idle", "returning", "error"],
          sun: ["above_horizon", "below_horizon"],
          input_select: attrs.options || [],
          select: attrs.options || [],
          weather: ["sunny", "clear-night", "cloudy", "fog", "hail", "lightning", "partlycloudy", "pouring", "rainy", "snowy", "windy"],
        };
        let opts = map[domain] ? map[domain].slice() : [];
        if (cur != null && cur !== "unknown" && cur !== "unavailable" && opts.indexOf(cur) === -1) {
          opts.unshift(cur);
        }
        if (!opts.length && cur != null) opts = [cur];
        return opts;
      },
    };
  }

  _injectBlocklyStyles() {
    try {
      const root = this.getRootNode();
      if (!root || root === document || typeof root.querySelectorAll !== "function") {
        return;
      }
      document.querySelectorAll('style[id^="blockly-"]').forEach((s) => {
        if (root.getElementById && root.getElementById(s.id)) return;
        root.appendChild(s.cloneNode(true));
      });
    } catch (e) {
      /* non-fatal: styles may already be present */
    }
  }

  _status(msg, isError) {
    const el = this._q("#hab-status");
    if (el) {
      el.textContent = msg || "";
      el.style.color = isError ? "var(--error-color,#db4437)" : "";
    }
  }

  _ws(msg) {
    return this._hass.connection.sendMessagePromise(msg);
  }

  // --- Data -------------------------------------------------------------

  async _loadData() {
    try {
      const res = await this._ws({ type: "ha_blockly/list" });
      this._rules = res.rules || [];
      this._folders = res.folders || [];
      this._renderFolderSelect();
      this._renderTree();
    } catch (err) {
      this._status("Laden fehlgeschlagen: " + err.message, true);
    }
  }

  async _loadAgents() {
    try {
      const res = await this._ws({ type: "ha_blockly/list_agents" });
      this._agents = res.agents || [];
      const sel = this._q("#hab-ai-agent");
      for (const a of this._agents) {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = a.name;
        sel.appendChild(o);
      }
    } catch (err) {
      /* conversation not installed - keep default option */
    }
  }

  _renderFolderSelect() {
    const sel = this._q("#hab-folder");
    const current = sel.value;
    sel.innerHTML = '<option value="">(kein Ordner)</option>';
    for (const f of [...this._folders].sort()) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = f;
      sel.appendChild(o);
    }
    sel.value = current;
  }

  _renderTree() {
    const tree = this._q("#hab-tree");
    tree.innerHTML = "";
    const byFolder = {};
    for (const r of this._rules) {
      const f = r.folder || "";
      (byFolder[f] = byFolder[f] || []).push(r);
    }
    const folders = new Set([...this._folders, ...Object.keys(byFolder)]);
    folders.delete("");

    // Root-level rules first.
    (byFolder[""] || []).forEach((r) => tree.appendChild(this._ruleRow(r)));

    [...folders].sort().forEach((folder) => {
      const depth = folder.split("/").length - 1;
      const row = document.createElement("div");
      row.className = "hab-folder";
      row.style.marginLeft = depth * 14 + "px";
      row.innerHTML = `<span>📁</span><span class="fname">${
        folder.split("/").pop()
      }</span>`;
      const ren = document.createElement("button");
      ren.className = "fbtn";
      ren.textContent = "✎";
      ren.title = "Umbenennen";
      ren.onclick = () => this._renameFolder(folder);
      const del = document.createElement("button");
      del.className = "fbtn";
      del.textContent = "🗑";
      del.title = "Ordner löschen";
      del.onclick = () => this._deleteFolder(folder);
      row.appendChild(ren);
      row.appendChild(del);
      tree.appendChild(row);
      (byFolder[folder] || []).forEach((r) => {
        const rr = this._ruleRow(r);
        rr.style.marginLeft = (depth + 1) * 14 + "px";
        tree.appendChild(rr);
      });
    });

    if (!this._rules.length && !folders.size) {
      tree.innerHTML = '<div class="hab-empty">Noch keine Regeln. Lege Blöcke an und klicke „Speichern".</div>';
    }
  }

  _ruleRow(rule) {
    const row = document.createElement("div");
    row.className = "hab-rule" + (rule.id === this._currentId ? " active" : "") +
      (rule.enabled ? "" : " disabled");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = rule.enabled;
    cb.title = "Aktiviert";
    cb.onclick = (e) => {
      e.stopPropagation();
      this._setEnabled(rule.id, cb.checked);
    };
    const name = document.createElement("span");
    name.className = "rname";
    name.textContent = rule.name;
    const del = document.createElement("button");
    del.className = "rbtn";
    del.textContent = "🗑";
    del.title = "Löschen";
    del.onclick = (e) => {
      e.stopPropagation();
      this._deleteRule(rule.id);
    };
    row.appendChild(cb);
    row.appendChild(name);
    row.appendChild(del);
    row.onclick = () => this._selectRule(rule.id);
    return row;
  }

  // --- Rule actions -----------------------------------------------------

  async _selectRule(id) {
    try {
      const rule = await this._ws({ type: "ha_blockly/get", rule_id: id });
      this._currentId = id;
      this._q("#hab-name").value = rule.name || "";
      this._q("#hab-folder").value = rule.folder || "";
      if (rule.workspace && Object.keys(rule.workspace).length) {
        this._Blockly.serialization.workspaces.load(rule.workspace, this._workspace);
      } else {
        this._workspace.clear();
      }
      this._renderTree();
      this._loadTraces();
      this._status(`Regel „${rule.name}" geladen.`);
    } catch (err) {
      this._status("Konnte Regel nicht laden: " + err.message, true);
    }
  }

  _newRule() {
    this._currentId = null;
    this._q("#hab-name").value = "";
    this._workspace.clear();
    this._renderTree();
    this._renderTrace(null);
    this._status("Neue Regel. Baue Blöcke und speichere.");
  }

  async _persist() {
    // Compile the current workspace and store it. Returns { doc, ir }.
    const name = this._q("#hab-name").value.trim() || "Unbenannt";
    const folder = this._q("#hab-folder").value;
    const ir = compileWorkspace(this._workspace);
    const workspace = this._Blockly.serialization.workspaces.save(this._workspace);
    const rule = { name, folder, workspace, ir };
    if (this._currentId) rule.id = this._currentId;
    const doc = await this._ws({ type: "ha_blockly/save", rule });
    this._currentId = doc.id;
    await this._loadData();
    return { doc, ir };
  }

  async _save() {
    if (!this._workspace) return;
    let ir;
    try {
      ir = compileWorkspace(this._workspace);
    } catch (err) {
      this._status("Kompilierung fehlgeschlagen: " + err.message, true);
      return;
    }
    const v = this._validate(ir);
    if (v.errors.length) {
      const ok = window.confirm(
        "Die Regel ist unvollständig:\n\n- " + v.errors.join("\n- ") + "\n\nTrotzdem speichern?"
      );
      if (!ok) {
        this._status("Nicht gespeichert: " + v.errors.join(" "), true);
        return;
      }
    }
    try {
      const { doc } = await this._persist();
      const warn = v.warnings.length ? "  ⚠ " + v.warnings.join("; ") : "";
      this._status(
        `Gespeichert: „${doc.name}" (${ir.triggers.length} Auslöser, ${ir.actions.length} Aktionen).` + warn,
        v.warnings.length > 0
      );
    } catch (err) {
      this._status("Speichern fehlgeschlagen: " + err.message, true);
    }
  }

  _validate(ir) {
    const errors = [];
    const warnings = [];
    if (!ir.actions || !ir.actions.length) {
      errors.push("Es fehlt eine Aktion – die Regel macht nichts.");
    }
    if (!ir.triggers || !ir.triggers.length) {
      warnings.push("Kein Auslöser – die Regel läuft nur per Test, nicht automatisch.");
    }
    const ents = new Set();
    const visit = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) {
        o.forEach(visit);
        return;
      }
      for (const [k, val] of Object.entries(o)) {
        if ((k === "entity" || k === "zone" || k === "entity_id") && typeof val === "string" && val.includes(".")) {
          ents.add(val);
        } else {
          visit(val);
        }
      }
    };
    visit(ir);
    const h = this._hass;
    if (h && h.states) {
      const missing = [...ents].filter((e) => !h.states[e]);
      if (missing.length) {
        warnings.push(
          "Unbekannte Entitäten: " + missing.slice(0, 8).join(", ") + (missing.length > 8 ? " …" : "")
        );
      }
    }
    return { errors, warnings };
  }

  async _runCurrent() {
    if (!this._workspace) return;
    // Always save the current canvas first, then test exactly what is shown.
    let saved;
    try {
      saved = await this._persist();
    } catch (err) {
      this._status("Speichern vor dem Test fehlgeschlagen: " + err.message, true);
      return;
    }
    if (!saved.ir.actions || !saved.ir.actions.length) {
      this._status("Keine Aktionen zum Testen – füge Aktionsblöcke hinzu.", true);
      return;
    }
    try {
      const res = await this._ws({ type: "ha_blockly/run", rule_id: this._currentId });
      if (res && res.trace) {
        this._showTrace();
        this._renderTrace(res.trace);
        this._logTrace(res.trace);
      }
      this._status('Gespeichert & getestet – siehe „Ausführung & Protokoll" unten.');
    } catch (err) {
      this._status("Testlauf fehlgeschlagen: " + err.message, true);
    }
  }

  // --- Trace / log ------------------------------------------------------

  _toggleTrace() {
    this._traceOpen = !this._traceOpen;
    const el = this._q("#hab-trace");
    const caret = this._q("#hab-trace-caret");
    if (el) el.classList.toggle("collapsed", !this._traceOpen);
    if (caret) caret.textContent = this._traceOpen ? "▾" : "▸";
    if (this._workspace && this._Blockly) {
      setTimeout(() => this._Blockly.svgResize(this._workspace), 160);
    }
  }

  _showTrace() {
    if (!this._traceOpen) this._toggleTrace();
  }

  _statusDot(status, kind) {
    const cls = kind === "trigger" ? "trigger" : status;
    return `<span class="hab-dot ${cls || ""}"></span>`;
  }

  _fmtTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch (e) {
      return iso || "";
    }
  }

  _renderTrace(trace) {
    const tl = this._q("#hab-trace-tl");
    if (!tl) return;
    if (!trace) {
      tl.innerHTML = '<div class="hab-trace-empty">Keine Ausführung.</div>';
      return;
    }
    const statusText = { ok: "erfolgreich", error: "Fehler", stopped: "abgebrochen" }[trace.status] || trace.status;
    let html = `<div class="hab-log-line head">${trace.test ? "Test" : "Auslösung"} · ${this._fmtTime(trace.started)} · ${statusText} · ${trace.duration ?? "?"}s</div>`;
    for (const s of trace.steps || []) {
      const meta = s.detail ? `<div class="meta">${this._esc(s.detail)}</div>` : "";
      html += `<div class="hab-step">${this._statusDot(s.status, s.kind)}<div class="lbl">${this._esc(s.label)}${meta}</div><div class="meta">${this._fmtTime(s.t)}</div></div>`;
    }
    if (trace.error) {
      html += `<div class="hab-log-line error">Fehler: ${this._esc(trace.error)}</div>`;
    }
    tl.innerHTML = html;
  }

  _logTrace(trace) {
    const log = this._q("#hab-trace-log");
    if (!log || !trace) return;
    const statusText = { ok: "OK", error: "FEHLER", stopped: "ABGEBROCHEN" }[trace.status] || trace.status;
    const head = document.createElement("div");
    head.className = "hab-log-line head " + (trace.status === "ok" ? "" : trace.status);
    head.textContent = `${this._fmtTime(trace.started)}  ${trace.test ? "[TEST] " : ""}${trace.name} — ${statusText} (${(trace.steps || []).length - 1} Aktionen, ${trace.duration ?? "?"}s)`;
    log.appendChild(head);
    for (const s of trace.steps || []) {
      if (s.kind === "trigger") continue;
      const line = document.createElement("div");
      line.className = "hab-log-line " + (s.status === "ok" ? "" : s.status);
      line.textContent = `   • ${s.label}${s.detail ? " — " + s.detail : ""}  [${s.status}]`;
      log.appendChild(line);
    }
    log.scrollTop = log.scrollHeight;
  }

  async _loadTraces() {
    if (!this._currentId) {
      this._renderTrace(null);
      return;
    }
    try {
      const res = await this._ws({ type: "ha_blockly/get_traces", rule_id: this._currentId });
      const traces = (res && res.traces) || [];
      if (!traces.length) {
        this._q("#hab-trace-tl").innerHTML = '<div class="hab-trace-empty">Noch keine Ausführung für diese Regel.</div>';
        return;
      }
      this._renderTrace(traces[0]);
      const log = this._q("#hab-trace-log");
      log.innerHTML = "";
      for (const t of [...traces].reverse()) this._logTrace(t);
    } catch (err) {
      this._status("Protokoll konnte nicht geladen werden: " + err.message, true);
    }
  }

  _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  }

  async _reloadEngine() {
    await this._ws({ type: "ha_blockly/reload" });
    this._status("Engine neu geladen.");
  }

  async _setEnabled(id, enabled) {
    await this._ws({ type: "ha_blockly/set_enabled", rule_id: id, enabled });
    await this._loadData();
  }

  async _deleteRule(id) {
    if (!window.confirm("Diese Regel wirklich löschen?")) return;
    await this._ws({ type: "ha_blockly/delete", rule_id: id });
    if (this._currentId === id) this._newRule();
    await this._loadData();
    this._status("Regel gelöscht.");
  }

  // --- Folder actions ---------------------------------------------------

  async _createFolder() {
    const path = window.prompt("Ordnername (Unterordner mit / trennen):", "");
    if (!path) return;
    await this._ws({ type: "ha_blockly/folder_create", path });
    await this._loadData();
  }

  async _renameFolder(old) {
    const neu = window.prompt("Neuer Ordnername:", old);
    if (!neu || neu === old) return;
    await this._ws({ type: "ha_blockly/folder_rename", old, new: neu });
    await this._loadData();
  }

  async _deleteFolder(path) {
    const withRules = window.confirm(
      `Ordner „${path}" löschen.\n\nOK = Regeln darin ebenfalls löschen.\nAbbrechen = Regeln behalten (in Wurzel verschieben).`
    );
    await this._ws({
      type: "ha_blockly/folder_delete",
      path,
      delete_rules: withRules,
    });
    await this._loadData();
  }

  // --- AI editor --------------------------------------------------------

  async _aiGenerate() {
    const prompt = this._q("#hab-ai-prompt").value.trim();
    if (!prompt) {
      this._status("Bitte zuerst eine Beschreibung eingeben.", true);
      return;
    }
    const agent_id = this._q("#hab-ai-agent").value || null;
    this._status("KI generiert Blöcke …");
    this._q("#hab-ai-go").disabled = true;
    try {
      const res = await this._ws({ type: "ha_blockly/ai_generate", prompt, agent_id });
      if (res.error) {
        this._status("KI-Fehler: " + res.error, true);
        return;
      }
      const ir = res.ir;
      buildFromIR(this._workspace, ir, this._Blockly);
      if (ir.name) this._q("#hab-name").value = ir.name;
      this._currentId = null;
      this._status('KI-Vorschlag erstellt. Prüfen und „Speichern" klicken.');
    } catch (err) {
      this._status("KI-Anfrage fehlgeschlagen: " + err.message, true);
    } finally {
      this._q("#hab-ai-go").disabled = false;
    }
  }
}

if (!customElements.get("ha-blockly-panel")) {
  customElements.define("ha-blockly-panel", HaBlocklyPanel);
}
