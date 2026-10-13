// Custom Blockly block definitions + toolbox for Home Assistant.
// defineBlocks(Blockly) must be called after the Blockly global is loaded.

// A text field with a native, searchable <datalist> of Home Assistant
// entities / domains / services. Free text is still allowed. Options come from
// window.__haBlockly, which the panel keeps in sync with the live hass object.
function defineSearchField(Blockly) {
  if (Blockly.__haFieldSearch) return;
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
        return api.entities ? api.entities() : [];
      } catch (e) {
        return [];
      }
    }
    widgetCreate_() {
      const input = super.widgetCreate_();
      try {
        const dl = document.createElement("datalist");
        dl.id = "hab-dl-" + Math.random().toString(36).slice(2);
        for (const o of this._options()) {
          const op = document.createElement("option");
          op.value = o;
          dl.appendChild(op);
        }
        document.body.appendChild(dl);
        input.setAttribute("list", dl.id);
        input.setAttribute("autocomplete", "off");
        this._dl_ = dl;
      } catch (e) {
        /* ignore */
      }
      return input;
    }
    widgetDispose_() {
      super.widgetDispose_();
      if (this._dl_) {
        this._dl_.remove();
        this._dl_ = null;
      }
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
      args1: [{ type: "field_input", name: "TO", text: "" }],
      message2: "von (Startzustand) %1  Attribut %2",
      args2: [
        { type: "field_input", name: "FROM", text: "" },
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
