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
.hab-fs-list{max-height:min(60vh,520px);overflow:auto;}
.hab-fs-item{padding:8px 11px;font-size:13px;cursor:pointer;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;color:#212121;}
.hab-fs-item:hover,.hab-fs-item.sel{background:#e8f0fe;}
.hab-fs-item .sub{color:#888;font-size:11px;margin-left:6px;}
.hab-fs-empty{padding:12px;color:#888;font-size:13px;}
.hab-fs.dark .hab-fs-search{background:#1e1e1e;color:#e0e0e0;border-bottom-color:#444;}
.hab-fs.dark .hab-fs-item{color:#e0e0e0;}
.hab-fs.dark .hab-fs-item:hover,.hab-fs.dark .hab-fs-item.sel{background:#3a3a3a;}
.hab-fs.dark .hab-fs-empty{color:#999;}
`;
  document.head.appendChild(st);
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
      const render = (q) => {
        list.innerHTML = "";
        const ql = (q || "").toLowerCase();
        const matches = [];
        for (const o of options) {
          const fn = this.variant_ === "entity" ? this._friendly(o) : "";
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
      let edited = false;
      render("");
      search.addEventListener("input", () => {
        edited = true;
        render(search.value);
      });
      search.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          const first = list.querySelector(".hab-fs-item");
          if (edited && first) commit(first.firstChild.textContent);
          else commit(search.value); // unchanged prefill, typed text, or empty to clear
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
  const C_TRIGGER = 230;
  const C_ACTION = 160;
  const C_LOGIC = 210;
  const C_VALUE = 65;
  const C_VAR = 330;

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
      message0: "Jeden Tag um %1 Uhr",
      args0: [{ type: "field_input", name: "TIME", text: "07:00:00" }],
      message1: "mache %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: C_TRIGGER,
      tooltip: "Löst täglich zur angegebenen Uhrzeit aus (HH:MM:SS).",
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
      args0: [{ type: "field_input", name: "SERVICE", text: "notify.notify" }],
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
  ]);
}

export const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Auslöser",
      colour: "230",
      contents: [
        { kind: "block", type: "ha_on_state" },
        { kind: "block", type: "ha_on_time" },
        { kind: "block", type: "ha_on_event" },
        { kind: "block", type: "ha_on_start" },
      ],
    },
    {
      kind: "category",
      name: "Aktionen",
      colour: "160",
      contents: [
        { kind: "block", type: "ha_call_service" },
        { kind: "block", type: "ha_wait" },
        { kind: "block", type: "ha_repeat" },
        { kind: "block", type: "ha_log" },
        { kind: "block", type: "ha_notify" },
      ],
    },
    {
      kind: "category",
      name: "Logik",
      colour: "210",
      contents: [
        { kind: "block", type: "ha_if" },
        { kind: "block", type: "ha_compare" },
        { kind: "block", type: "ha_logic" },
        { kind: "block", type: "ha_not" },
      ],
    },
    {
      kind: "category",
      name: "Werte",
      colour: "65",
      contents: [
        { kind: "block", type: "ha_state" },
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
      colour: "330",
      contents: [
        { kind: "block", type: "ha_set_var" },
        { kind: "block", type: "ha_var_get" },
      ],
    },
  ],
};
