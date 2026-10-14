// Custom Blockly block definitions + toolbox for Home Assistant.
// defineBlocks(Blockly) must be called after the Blockly global is loaded.

// A text field with a native, searchable <datalist> of Home Assistant
// entities / domains / services. Free text is still allowed. Options come from
// window.__haBlockly, which the panel keeps in sync with the live hass object.
function injectSearchFieldCss() {
  if (document.getElementById("hab-fs-style")) return;
  const st = document.createElement("style");
  st.id = "hab-fs-style";
  st.textContent = `
.hab-fs{display:flex;flex-direction:column;width:640px;max-width:94vw;
  font-family:Roboto,Arial,sans-serif;}
.hab-fs-search{padding:9px 11px;border:none;border-bottom:1px solid #e0e0e0;
  font-size:14px;outline:none;width:100%;box-sizing:border-box;background:#fff;color:#212121;}
.hab-fs-dom{margin:8px 11px 0;padding:6px 8px;border:1px solid #ddd;border-radius:6px;
  font-size:13px;background:#fff;color:#212121;}
.hab-fs.dark .hab-fs-dom{background:#1e1e1e;color:#e0e0e0;border-color:#444;}
.hab-fs-list{max-height:min(60vh,520px);overflow:auto;}
.hab-fs-item{padding:8px 11px;font-size:13px;cursor:pointer;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;color:#212121;}
.hab-fs-item:hover,.hab-fs-item.sel{background:#e8f0fe;}
.hab-fs-item .sub{color:#888;font-size:11px;margin-left:6px;}
.hab-fs-empty{padding:12px;color:#888;font-size:13px;}
.hab-fs-item.hab-fs-clear{color:#9e9e9e;font-style:italic;border-bottom:1px solid #eee;}
.hab-fs.dark .hab-fs-item.hab-fs-clear{color:#aaa;border-bottom-color:#3a3a3a;}
.hab-fs.dark .hab-fs-search{background:#1e1e1e;color:#e0e0e0;border-bottom-color:#444;}
.hab-fs.dark .hab-fs-item{color:#e0e0e0;}
.hab-fs.dark .hab-fs-item:hover,.hab-fs.dark .hab-fs-item.sel{background:#3a3a3a;}
.hab-fs.dark .hab-fs-empty{color:#999;}
/* Let only our inner list scroll, not Blockly's dropdown container (no scroll-in-scroll) */
.blocklyDropDownContent{max-height:none!important;overflow:visible!important;}
`;
  document.head.appendChild(st);
}

// Find the entity_id of a sibling "Zustand von" (ha_state) block within the
// same comparison/logic parent, so a value field can offer matching states.
function compareEntity(block) {
  if (!block || !block.getParent) return null;
  const parent = block.getParent();
  if (!parent || !parent.inputList) return null;
  for (const input of parent.inputList) {
    const conn = input.connection;
    const t = conn && conn.targetBlock && conn.targetBlock();
    if (t && t.type === "ha_state") {
      return t.getFieldValue("ENTITY");
    }
  }
  return null;
}

// A searchable picker field: clicking opens a dropdown (anchored to the block)
// with a search box and a filtered, scrollable list of Home Assistant
// entities / domains / services. Free text is still allowed (Enter accepts it).
function defineSearchField(Blockly) {
  if (Blockly.__haFieldSearch) return;
  injectSearchFieldCss();

  class FieldSearch extends Blockly.FieldTextInput {
    constructor(value, variant, validator) {
      super(value == null ? "" : value, validator);
      this.variant_ = variant || "entity";
    }
    static fromJson(options) {
      return new FieldSearch(options.text, options.variant);
    }
    _options() {
      const api = window.__haBlockly || {};
      try {
        if (this.variant_ === "domain") return api.domains ? api.domains() : [];
        if (this.variant_ === "service") {
          const block = this.getSourceBlock && this.getSourceBlock();
          const dom = block ? block.getFieldValue("DOMAIN") : null;
          return api.services ? api.services(dom) : [];
        }
        if (this.variant_ === "state") {
          const block = this.getSourceBlock && this.getSourceBlock();
          const ent = block ? block.getFieldValue("ENTITY") : null;
          return api.stateOptions ? api.stateOptions(ent) : [];
        }
        if (this.variant_ === "cmpstate") {
          const block = this.getSourceBlock && this.getSourceBlock();
          const ent = compareEntity(block);
          return api.stateOptions ? api.stateOptions(ent) : [];
        }
        if (this.variant_ === "notify") {
          return api.notifyServices ? api.notifyServices() : ["notify.notify"];
        }
        return api.entities ? api.entities() : [];
      } catch (e) {
        return [];
      }
    }
    _friendly(id) {
      const api = window.__haBlockly || {};
      try {
        return api.friendlyName ? api.friendlyName(id) : "";
      } catch (e) {
        return "";
      }
    }
    _resolveStateEntity() {
      const block = this.getSourceBlock && this.getSourceBlock();
      if (this.variant_ === "cmpstate") return compareEntity(block);
      if (this.variant_ === "state") return block ? block.getFieldValue("ENTITY") : null;
      return null;
    }
    _subLabel(o) {
      const api = window.__haBlockly || {};
      try {
        if (this.variant_ === "entity") {
          const fn = this._friendly(o);
          const area = api.entityArea ? api.entityArea(o) : "";
          return area ? (fn ? fn + " · " + area : area) : fn;
        }
        if (this.variant_ === "state" || this.variant_ === "cmpstate") {
          return api.stateLabel ? api.stateLabel(this._resolveStateEntity(), o) : "";
        }
      } catch (e) {
        /* ignore */
      }
      return "";
    }
    // Open a searchable dropdown instead of the plain text editor.
    showEditor_(e) {
      const DD = Blockly.DropDownDiv;
      const dark = window.__haBlocklyTheme === "dark";
      const content = DD.getContentDiv();
      content.innerHTML = "";

      const wrap = document.createElement("div");
      wrap.className = "hab-fs" + (dark ? " dark" : "");
      const search = document.createElement("input");
      search.type = "text";
      search.className = "hab-fs-search";
      search.placeholder = "Suchen…";
      // Pre-fill with the current value and select it so it can be copied (Ctrl+C);
      // the list still shows all options until the user types.
      search.value = this.getValue() == null ? "" : String(this.getValue());
      const list = document.createElement("div");
      list.className = "hab-fs-list";
      wrap.appendChild(search);
      wrap.appendChild(list);
      content.appendChild(wrap);

      const options = this._options();
      const commit = (val) => {
        this.setValue(val);
        DD.hideIfOwner(this);
      };
      let domFilter = "";
      const render = (q) => {
        list.innerHTML = "";
        // Always offer a way to clear the field (empty value).
        const clearItem = document.createElement("div");
        clearItem.className = "hab-fs-item hab-fs-clear";
        clearItem.textContent = "— leeren —";
        clearItem.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          commit("");
        });
        list.appendChild(clearItem);
        const ql = (q || "").toLowerCase();
        const matches = [];
        for (const o of options) {
          if (domFilter && !o.startsWith(domFilter + ".")) continue;
          const fn = this._subLabel(o);
          if (!ql || o.toLowerCase().includes(ql) || (fn && fn.toLowerCase().includes(ql))) {
            matches.push([o, fn]);
            if (matches.length >= 300) break;
          }
        }
        if (!matches.length) {
          const em = document.createElement("div");
          em.className = "hab-fs-empty";
          em.textContent = q ? `Keine Treffer – Enter übernimmt „${q}"` : "Keine Einträge";
          list.appendChild(em);
          return;
        }
        for (const [o, fn] of matches) {
          const item = document.createElement("div");
          item.className = "hab-fs-item";
          item.textContent = o;
          if (fn) {
            const sub = document.createElement("span");
            sub.className = "sub";
            sub.textContent = fn;
            item.appendChild(sub);
          }
          item.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            commit(o);
          });
          list.appendChild(item);
        }
      };
      // Domain filter for entity pickers (e.g. only lights).
      if (this.variant_ === "entity") {
        const domSel = document.createElement("select");
        domSel.className = "hab-fs-dom";
        const domains = [...new Set(options.map((o) => o.split(".")[0]))].sort();
        domSel.innerHTML =
          '<option value="">Alle Domänen</option>' +
          domains.map((d) => `<option value="${d}">${d}</option>`).join("");
        domSel.addEventListener("change", () => {
          domFilter = domSel.value;
          render(search.value);
        });
        wrap.insertBefore(domSel, list);
      }
      let edited = false;
      render("");
      search.addEventListener("input", () => {
        edited = true;
        render(search.value);
      });
      search.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (!search.value.trim()) {
            commit(""); // empty box -> clear the field
            return;
          }
          const first = list.querySelector(".hab-fs-item:not(.hab-fs-clear)");
          if (edited && first) commit(first.firstChild.textContent);
          else commit(search.value); // unchanged prefill or typed text
        } else if (ev.key === "Escape") {
          DD.hideIfOwner(this);
        }
      });

      DD.setColour(dark ? "#2b2b2b" : "#ffffff", dark ? "#444444" : "#cccccc");
      DD.showPositionedByField(this, () => {});
      setTimeout(() => {
        search.focus();
        search.select();
      }, 0);
    }
  }

  Blockly.fieldRegistry.register("field_search", FieldSearch);
  Blockly.__haFieldSearch = true;
}

export function defineBlocks(Blockly) {
  defineSearchField(Blockly);
  const C_TRIGGER = "#5969A4";
  const C_ACTION = "#52A58C";
  const C_LOGIC = "#6089AB";
  const C_VALUE = "#A4A96A";
  const C_VAR = "#A06594";
  const C_OTHER = "#707780";

  Blockly.defineBlocksWithJsonArray([
    // ---- Triggers --------------------------------------------------------
    {
      type: "ha_on_state",
      message0: "Wenn Entität %1 sich ändert",
      args0: [{ type: "field_search", name: "ENTITY", text: "sensor.beispiel", variant: "entity" }],
      message1: "nach (Zielzustand) %1",
      args1: [{ type: "field_search", name: "TO", text: "", variant: "state" }],
      message2: "von (Startzustand) %1  Attribut %2",
      args2: [
        { type: "field_search", name: "FROM", text: "", variant: "state" },
        { type: "field_input", name: "ATTRIBUTE", text: "" },
      ],
      message3: "für %1 Sekunden",
      args3: [{ type: "field_number", name: "FOR", value: 0, min: 0 }],
      message4: "mache %1",
      args4: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst aus, wenn sich der Zustand einer Entität ändert.",
    },
    {
      type: "ha_on_time",
      message0: "Um %1 Uhr  an %2",
      args0: [
        { type: "field_input", name: "TIME", text: "07:00:00" },
        {
          type: "field_dropdown",
          name: "WEEKDAYS",
          options: [
            ["täglich", "daily"],
            ["Mo–Fr", "mon-fri"],
            ["Sa+So", "sat-sun"],
            ["Montag", "0"],
            ["Dienstag", "1"],
            ["Mittwoch", "2"],
            ["Donnerstag", "3"],
            ["Freitag", "4"],
            ["Samstag", "5"],
            ["Sonntag", "6"],
          ],
        },
      ],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst zur angegebenen Uhrzeit (HH:MM:SS) an den gewählten Tagen aus.",
    },
    {
      type: "ha_on_calendar",
      message0: "Kalender %1 Termin %2",
      args0: [
        { type: "field_search", name: "ENTITY", text: "calendar.beispiel", variant: "entity" },
        {
          type: "field_dropdown",
          name: "EVENT",
          options: [
            ["beginnt", "start"],
            ["endet", "end"],
          ],
        },
      ],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst aus, wenn ein Kalendertermin beginnt/endet (über den Zustand der Kalender-Entität).",
    },
    {
      type: "ha_on_device",
      message0: "Bei Ereignis-Entität %1",
      args0: [{ type: "field_search", name: "ENTITY", text: "event.beispiel", variant: "entity" }],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst aus, wenn eine Ereignis-Entität auslöst (z.B. Taster/Fernbedienung, event.*).",
    },
    {
      type: "ha_on_event",
      message0: "Bei Event %1",
      args0: [{ type: "field_input", name: "EVENT", text: "my_event" }],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst aus, wenn ein Event auf dem Event-Bus ausgelöst wird.",
    },
    {
      type: "ha_on_start",
      message0: "Beim Start von Home Assistant",
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst einmalig beim Start von Home Assistant aus.",
    },

    // ---- Actions ---------------------------------------------------------
    {
      type: "ha_call_service",
      message0: "Dienst %1 . %2",
      args0: [
        { type: "field_search", name: "DOMAIN", text: "light", variant: "domain" },
        { type: "field_search", name: "SERVICE", text: "turn_on", variant: "service" },
      ],
      message1: "Ziel-Entität %1",
      args1: [{ type: "field_search", name: "ENTITY", text: "light.wohnzimmer", variant: "entity" }],
      message2: "Daten (JSON) %1",
      args2: [{ type: "field_input", name: "DATA", text: "" }],
      message3: "Verzögerung %1 Sekunden",
      args3: [{ type: "field_number", name: "DELAY", value: 0, min: 0 }],
      previousStatement: null,
      nextStatement: null,
      colour: C_ACTION,
      tooltip: "Ruft einen Home-Assistant-Dienst auf (z.B. light.turn_on).",
    },
    {
      type: "ha_set",
      message0: "setze %1 auf %2",
      args0: [
        { type: "field_search", name: "ENTITY", text: "light.beispiel", variant: "entity" },
        { type: "field_search", name: "VALUE", text: "on", variant: "state" },
      ],
      message1: "Verzögerung %1 Sekunden",
      args1: [{ type: "field_number", name: "DELAY", value: 0, min: 0 }],
      previousStatement: null,
      nextStatement: null,
      colour: C_ACTION,
      tooltip:
        "Setzt eine Entität auf einen Zustand/Wert. Der passende Dienst wird automatisch gewählt: an/aus, Rollo-Position, Auswahl-Option, Temperatur/Modus, Helligkeit usw.",
    },
    {
      type: "ha_if",
      message0: "falls %1",
      args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      message2: "sonst %1",
      args2: [{ type: "input_statement", name: "ELSE" }],
      previousStatement: null,
      nextStatement: null,
      colour: C_LOGIC,
      tooltip: "Führt Blöcke abhängig von einer Bedingung aus.",
    },
    {
      type: "ha_set_var",
      message0: "setze Variable %1 auf %2",
      args0: [
        { type: "field_input", name: "NAME", text: "x" },
        { type: "input_value", name: "VALUE" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: C_VAR,
      tooltip: "Setzt eine lokale Variable (gilt für diesen Durchlauf).",
    },
    {
      type: "ha_wait",
      message0: "warte %1 Sekunden",
      args0: [{ type: "input_value", name: "SECONDS", check: null }],
      previousStatement: null,
      nextStatement: null,
      colour: C_ACTION,
      tooltip: "Pausiert die Ausführung.",
    },
    {
      type: "ha_repeat",
      message0: "wiederhole %1 mal",
      args0: [{ type: "input_value", name: "COUNT" }],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      previousStatement: null,
      nextStatement: null,
      colour: C_ACTION,
      tooltip: "Wiederholt die enthaltenen Blöcke.",
    },
    {
      type: "ha_log",
      message0: "logge %1 Stufe %2",
      args0: [
        { type: "input_value", name: "MESSAGE" },
        {
          type: "field_dropdown",
          name: "LEVEL",
          options: [
            ["info", "info"],
            ["debug", "debug"],
            ["warnung", "warning"],
            ["fehler", "error"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: C_ACTION,
      tooltip: "Schreibt eine Nachricht ins Home-Assistant-Log.",
    },
    {
      type: "ha_notify",
      message0: "benachrichtige %1",
      args0: [{ type: "field_search", name: "SERVICE", text: "notify.notify", variant: "notify" }],
      message1: "Nachricht %1",
      args1: [{ type: "input_value", name: "MESSAGE" }],
      message2: "Titel %1",
      args2: [{ type: "input_value", name: "TITLE" }],
      previousStatement: null,
      nextStatement: null,
      colour: C_ACTION,
      tooltip: "Sendet eine Benachrichtigung über einen notify-Dienst.",
    },

    // ---- Conditions ------------------------------------------------------
    {
      type: "ha_compare",
      message0: "%1 %2 %3",
      args0: [
        { type: "input_value", name: "A" },
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            ["=", "=="],
            ["≠", "!="],
            [">", ">"],
            ["≥", ">="],
            ["<", "<"],
            ["≤", "<="],
          ],
        },
        { type: "input_value", name: "B" },
      ],
      inputsInline: true,
      output: "Boolean",
      colour: C_LOGIC,
      tooltip: "Vergleicht zwei Werte.",
    },
    {
      type: "ha_logic",
      message0: "%1 %2 %3",
      args0: [
        { type: "input_value", name: "A", check: "Boolean" },
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            ["und", "and"],
            ["oder", "or"],
          ],
        },
        { type: "input_value", name: "B", check: "Boolean" },
      ],
      inputsInline: true,
      output: "Boolean",
      colour: C_LOGIC,
      tooltip: "Logische Verknüpfung von zwei Bedingungen.",
    },
    {
      type: "ha_not",
      message0: "nicht %1",
      args0: [{ type: "input_value", name: "ITEM", check: "Boolean" }],
      output: "Boolean",
      colour: C_LOGIC,
      tooltip: "Negiert eine Bedingung.",
    },

    // ---- Values ----------------------------------------------------------
    {
      type: "ha_state",
      message0: "Zustand von %1 Attribut %2",
      args0: [
        { type: "field_search", name: "ENTITY", text: "sensor.beispiel", variant: "entity" },
        { type: "field_input", name: "ATTRIBUTE", text: "" },
      ],
      output: null,
      colour: C_VALUE,
      tooltip: "Liefert den Zustand (oder ein Attribut) einer Entität.",
    },
    {
      type: "ha_var_get",
      message0: "Variable %1",
      args0: [{ type: "field_input", name: "NAME", text: "x" }],
      output: null,
      colour: C_VAR,
      tooltip: "Liefert den Wert einer Variablen.",
    },
    {
      type: "ha_number",
      message0: "%1",
      args0: [{ type: "field_number", name: "NUM", value: 0 }],
      output: "Number",
      colour: C_VALUE,
      tooltip: "Eine Zahl.",
    },
    {
      type: "ha_text",
      message0: '" %1 "',
      args0: [{ type: "field_input", name: "TEXT", text: "" }],
      output: "String",
      colour: C_VALUE,
      tooltip: "Ein Text.",
    },
    {
      type: "ha_bool",
      message0: "%1",
      args0: [
        {
          type: "field_dropdown",
          name: "BOOL",
          options: [
            ["wahr", "true"],
            ["falsch", "false"],
          ],
        },
      ],
      output: "Boolean",
      colour: C_VALUE,
      tooltip: "Ein Wahrheitswert.",
    },
    {
      type: "ha_state_value",
      message0: "Zustandswert %1",
      args0: [{ type: "field_search", name: "VALUE", text: "on", variant: "cmpstate" }],
      output: null,
      colour: C_VALUE,
      tooltip:
        "Ein Zustandswert für den Vergleich – die Auswahlliste richtet sich nach der Entität im „Zustand von\"-Block auf der anderen Seite.",
    },
    {
      type: "ha_math",
      message0: "%1 %2 %3",
      args0: [
        { type: "input_value", name: "A" },
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            ["+", "+"],
            ["−", "-"],
            ["×", "*"],
            ["÷", "/"],
            ["mod", "%"],
          ],
        },
        { type: "input_value", name: "B" },
      ],
      inputsInline: true,
      output: "Number",
      colour: C_VALUE,
      tooltip: "Arithmetik mit zwei Werten.",
    },
    {
      type: "ha_template",
      message0: "Template %1",
      args0: [{ type: "field_input", name: "TPL", text: "{{ now() }}" }],
      output: null,
      colour: C_VALUE,
      tooltip: "Rendert ein Jinja2-Template von Home Assistant.",
    },

    // ---- More triggers ---------------------------------------------------
    {
      type: "ha_on_numeric",
      message0: "Wenn Wert von %1",
      args0: [{ type: "field_search", name: "ENTITY", text: "sensor.beispiel", variant: "entity" }],
      message1: "%1 %2",
      args1: [
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            ["überschreitet", "above"],
            ["unterschreitet", "below"],
          ],
        },
        { type: "field_number", name: "NUM", value: 0 },
      ],
      message2: "Attribut %1  für %2 Sekunden",
      args2: [
        { type: "field_input", name: "ATTRIBUTE", text: "" },
        { type: "field_number", name: "FOR", value: 0, min: 0 },
      ],
      message3: "mache %1",
      args3: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst aus, wenn ein numerischer Messwert einen Grenzwert über-/unterschreitet.",
    },
    {
      type: "ha_on_sun",
      message0: "Bei %1 Versatz %2 Sekunden",
      args0: [
        {
          type: "field_dropdown",
          name: "EVENT",
          options: [
            ["Sonnenaufgang", "sunrise"],
            ["Sonnenuntergang", "sunset"],
          ],
        },
        { type: "field_number", name: "OFFSET", value: 0 },
      ],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst zu Sonnenauf-/untergang aus (Versatz in Sekunden, negativ = vorher).",
    },
    {
      type: "ha_on_zone",
      message0: "Wenn %1 %2 Zone %3",
      args0: [
        { type: "field_search", name: "ENTITY", text: "person.ich", variant: "entity" },
        {
          type: "field_dropdown",
          name: "EVENT",
          options: [
            ["betritt", "enter"],
            ["verlässt", "leave"],
          ],
        },
        { type: "field_search", name: "ZONE", text: "zone.home", variant: "entity" },
      ],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst aus, wenn eine Person eine Zone betritt oder verlässt.",
    },

    // ---- More logic ------------------------------------------------------
    {
      type: "ha_wait_until",
      message0: "warte bis %1",
      args0: [{ type: "input_value", name: "COND", check: "Boolean" }],
      message1: "Timeout %1 Sekunden (0 = unbegrenzt)",
      args1: [{ type: "field_number", name: "TIMEOUT", value: 0, min: 0 }],
      previousStatement: null,
      nextStatement: null,
      colour: C_LOGIC,
      tooltip: "Wartet, bis eine Bedingung erfüllt ist (oder der Timeout abläuft).",
    },

    // ---- More values -----------------------------------------------------
    {
      type: "ha_trigger_value",
      message0: "Auslöser: %1",
      args0: [
        {
          type: "field_dropdown",
          name: "FIELD",
          options: [
            ["neuer Zustand", "to_state"],
            ["vorheriger Zustand", "from_state"],
            ["Entität", "entity_id"],
          ],
        },
      ],
      output: null,
      colour: C_VALUE,
      tooltip: "Daten des auslösenden Ereignisses (neuer/alter Zustand, Entität).",
    },

    // ---- More variables --------------------------------------------------
    {
      type: "ha_var_inc",
      message0: "erhöhe Variable %1 um %2",
      args0: [
        { type: "field_input", name: "NAME", text: "x" },
        { type: "input_value", name: "VALUE" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: C_VAR,
      tooltip: "Erhöht eine Variable um einen Wert.",
    },
    {
      type: "ha_var_dec",
      message0: "verringere Variable %1 um %2",
      args0: [
        { type: "field_input", name: "NAME", text: "x" },
        { type: "input_value", name: "VALUE" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: C_VAR,
      tooltip: "Verringert eine Variable um einen Wert.",
    },

    // ---- More (Weitere) --------------------------------------------------
    {
      type: "ha_scene",
      message0: "Szene aktivieren %1",
      args0: [{ type: "field_search", name: "ENTITY", text: "scene.beispiel", variant: "entity" }],
      previousStatement: null,
      nextStatement: null,
      colour: C_OTHER,
      tooltip: "Aktiviert eine Szene.",
    },
    {
      type: "ha_script",
      message0: "Skript ausführen %1",
      args0: [{ type: "field_search", name: "ENTITY", text: "script.beispiel", variant: "entity" }],
      previousStatement: null,
      nextStatement: null,
      colour: C_OTHER,
      tooltip: "Führt ein Skript aus.",
    },
    {
      type: "ha_automation",
      message0: "Automation auslösen %1",
      args0: [{ type: "field_search", name: "ENTITY", text: "automation.beispiel", variant: "entity" }],
      previousStatement: null,
      nextStatement: null,
      colour: C_OTHER,
      tooltip: "Löst eine Home-Assistant-Automation aus.",
    },
    {
      type: "ha_tts",
      message0: "Sprachausgabe (TTS) über %1",
      args0: [{ type: "field_search", name: "TTS", text: "tts.home_assistant_cloud", variant: "entity" }],
      message1: "Media-Player %1",
      args1: [{ type: "field_search", name: "MEDIA", text: "media_player.wohnzimmer", variant: "entity" }],
      message2: "Text %1",
      args2: [{ type: "field_input", name: "TEXT", text: "Hallo" }],
      previousStatement: null,
      nextStatement: null,
      colour: C_OTHER,
      tooltip: "Spricht einen Text über eine TTS-Engine auf einem Media-Player aus.",
    },
    {
      type: "ha_stop",
      message0: "Ablauf beenden",
      previousStatement: null,
      colour: C_OTHER,
      tooltip: "Beendet die Ausführung dieser Regel.",
    },
  ]);
}

export const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Auslöser",
      colour: "#5969A4",
      contents: [
        { kind: "block", type: "ha_on_state" },
        { kind: "block", type: "ha_on_numeric" },
        { kind: "block", type: "ha_on_time" },
        { kind: "block", type: "ha_on_sun" },
        { kind: "block", type: "ha_on_zone" },
        { kind: "block", type: "ha_on_calendar" },
        { kind: "block", type: "ha_on_device" },
        { kind: "block", type: "ha_on_event" },
        { kind: "block", type: "ha_on_start" },
      ],
    },
    {
      kind: "category",
      name: "Aktionen",
      colour: "#52A58C",
      contents: [
        { kind: "block", type: "ha_set" },
        { kind: "block", type: "ha_call_service" },
        { kind: "block", type: "ha_wait" },
        { kind: "block", type: "ha_repeat" },
        { kind: "block", type: "ha_log" },
      ],
    },
    {
      kind: "category",
      name: "Logik",
      colour: "#6089AB",
      contents: [
        { kind: "block", type: "ha_if" },
        { kind: "block", type: "ha_compare" },
        { kind: "block", type: "ha_logic" },
        { kind: "block", type: "ha_not" },
        { kind: "block", type: "ha_wait_until" },
      ],
    },
    {
      kind: "category",
      name: "Werte",
      colour: "#A4A96A",
      contents: [
        { kind: "block", type: "ha_state" },
        { kind: "block", type: "ha_state_value" },
        { kind: "block", type: "ha_trigger_value" },
        { kind: "block", type: "ha_number" },
        { kind: "block", type: "ha_text" },
        { kind: "block", type: "ha_bool" },
        { kind: "block", type: "ha_math" },
        { kind: "block", type: "ha_template" },
      ],
    },
    {
      kind: "category",
      name: "Variablen",
      colour: "#A06594",
      contents: [
        { kind: "block", type: "ha_set_var" },
        { kind: "block", type: "ha_var_get" },
        { kind: "block", type: "ha_var_inc" },
        { kind: "block", type: "ha_var_dec" },
      ],
    },
    {
      kind: "category",
      name: "Weitere",
      colour: "#707780",
      contents: [
        { kind: "block", type: "ha_notify" },
        { kind: "block", type: "ha_tts" },
        { kind: "block", type: "ha_scene" },
        { kind: "block", type: "ha_script" },
        { kind: "block", type: "ha_automation" },
        { kind: "block", type: "ha_stop" },
      ],
    },
  ],
};
