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
.hab-root{display:flex;flex-direction:column;height:100vh;box-sizing:border-box;
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
      </div>`;

    this._q("#hab-save").onclick = () => this._save();
    this._q("#hab-new").onclick = () => this._newRule();
    this._q("#hab-run").onclick = () => this._runCurrent();
    this._q("#hab-reload").onclick = () => this._reloadEngine();
    this._q("#hab-newfolder").onclick = () => this._createFolder();
    this._q("#hab-refresh").onclick = () => this._loadData();
    this._q("#hab-ai-go").onclick = () => this._aiGenerate();

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
    this._status("Neue Regel. Baue Blöcke und speichere.");
  }

  async _save() {
    if (!this._workspace) return;
    const name = this._q("#hab-name").value.trim() || "Unbenannt";
    const folder = this._q("#hab-folder").value;
    let ir;
    try {
      ir = compileWorkspace(this._workspace);
    } catch (err) {
      this._status("Kompilierung fehlgeschlagen: " + err.message, true);
      return;
    }
    if (!ir.triggers.length) {
      this._status("Warnung: kein Auslöser-Block. Regel wird nie ausgeführt.", true);
    }
    const workspace = this._Blockly.serialization.workspaces.save(this._workspace);
    const rule = { name, folder, workspace, ir };
    if (this._currentId) rule.id = this._currentId;
    try {
      const doc = await this._ws({ type: "ha_blockly/save", rule });
      this._currentId = doc.id;
      await this._loadData();
      this._status(`Gespeichert: „${doc.name}" (${ir.triggers.length} Auslöser, ${ir.actions.length} Aktionen).`);
    } catch (err) {
      this._status("Speichern fehlgeschlagen: " + err.message, true);
    }
  }

  async _runCurrent() {
    if (!this._currentId) {
      this._status("Bitte zuerst eine gespeicherte Regel auswählen.", true);
      return;
    }
    try {
      await this._ws({ type: "ha_blockly/run", rule_id: this._currentId });
      this._status("Regel testweise ausgeführt (Aktionen, Auslöser übersprungen).");
    } catch (err) {
      this._status("Testlauf fehlgeschlagen: " + err.message, true);
    }
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

customElements.define("ha-blockly-panel", HaBlocklyPanel);
