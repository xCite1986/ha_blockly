// Compile a Blockly workspace into the engine IR (see engine.py).

export function compileWorkspace(workspace) {
  const triggers = [];
  let actions = null;
  for (const block of workspace.getTopBlocks(true)) {
    if (block.disabled || !block.isEnabled()) continue;
    const t = compileTrigger(block);
    if (t) {
      triggers.push(t.trigger);
      if (actions === null) {
        actions = compileStatements(block.getInputTargetBlock("DO"));
      }
    } else if (actions === null && block.previousConnection) {
      // An orphan action stack (no trigger attached) — use it as the actions
      // so the rule can still be test-run. Add a trigger to run it for real.
      actions = compileStatements(block);
    }
  }
  return { version: 1, triggers, actions: actions || [] };
}

function field(block, name) {
  const v = block.getFieldValue(name);
  return v == null ? "" : String(v).trim();
}

function compileTrigger(block) {
  switch (block.type) {
    case "ha_on_state": {
      const trig = { type: "state", entity: field(block, "ENTITY") };
      const to = field(block, "TO");
      const from = field(block, "FROM");
      const attr = field(block, "ATTRIBUTE");
      const forS = Number(field(block, "FOR")) || 0;
      if (to) trig.to = to;
      if (from) trig.from = from;
      if (attr) trig.attribute = attr;
      if (forS > 0) trig.for = forS;
      return { trigger: trig };
    }
    case "ha_on_numeric": {
      const trig = { type: "numeric_state", entity: field(block, "ENTITY") };
      const op = field(block, "OP");
      const num = Number(field(block, "NUM"));
      if (op === "above") trig.above = num;
      else trig.below = num;
      const attr = field(block, "ATTRIBUTE");
      if (attr) trig.attribute = attr;
      const forS = Number(field(block, "FOR")) || 0;
      if (forS > 0) trig.for = forS;
      return { trigger: trig };
    }
    case "ha_on_time":
      return { trigger: { type: "time", at: field(block, "TIME") || "00:00:00" } };
    case "ha_on_sun":
      return {
        trigger: {
          type: "sun",
          event: field(block, "EVENT") || "sunset",
          offset: Number(field(block, "OFFSET")) || 0,
        },
      };
    case "ha_on_zone":
      return {
        trigger: {
          type: "zone",
          entity: field(block, "ENTITY"),
          zone: field(block, "ZONE"),
          event: field(block, "EVENT") || "enter",
        },
      };
    case "ha_on_event":
      return { trigger: { type: "event", event_type: field(block, "EVENT") } };
    case "ha_on_start":
      return { trigger: { type: "ha_start" } };
    default:
      return null; // not a trigger (top-level orphan) -> ignored
  }
}

function compileStatements(block) {
  const out = [];
  while (block) {
    if (block.isEnabled()) {
      const stmt = compileStatement(block);
      if (stmt) out.push(stmt);
    }
    block = block.getNextBlock();
  }
  return out;
}

function compileStatement(block) {
  switch (block.type) {
    case "ha_call_service": {
      const stmt = {
        type: "service",
        domain: field(block, "DOMAIN"),
        service: field(block, "SERVICE"),
      };
      const entity = field(block, "ENTITY");
      if (entity) stmt.target = { entity_id: entity };
      const dataRaw = field(block, "DATA");
      if (dataRaw) {
        try {
          stmt.data = JSON.parse(dataRaw);
        } catch (e) {
          stmt.data = {};
        }
      }
      const delay = Number(field(block, "DELAY")) || 0;
      if (delay > 0) stmt.delay = delay;
      return stmt;
    }
    case "ha_set": {
      const stmt = {
        type: "set",
        entity: field(block, "ENTITY"),
        value: field(block, "VALUE"),
      };
      const delay = Number(field(block, "DELAY")) || 0;
      if (delay > 0) stmt.delay = delay;
      return stmt;
    }
    case "ha_if":
      return {
        type: "if",
        condition: compileValue(block.getInputTargetBlock("COND")),
        then: compileStatements(block.getInputTargetBlock("DO")),
        else: compileStatements(block.getInputTargetBlock("ELSE")),
      };
    case "ha_set_var":
      return {
        type: "set_var",
        name: field(block, "NAME"),
        value: compileValue(block.getInputTargetBlock("VALUE")),
      };
    case "ha_wait":
      return { type: "wait", seconds: compileValue(block.getInputTargetBlock("SECONDS")) };
    case "ha_wait_until": {
      const stmt = {
        type: "wait_until",
        condition: compileValue(block.getInputTargetBlock("COND")),
      };
      const timeout = Number(field(block, "TIMEOUT")) || 0;
      if (timeout > 0) stmt.timeout = timeout;
      return stmt;
    }
    case "ha_var_inc":
      return {
        type: "set_var",
        name: field(block, "NAME"),
        value: {
          type: "math",
          op: "+",
          a: { type: "var", name: field(block, "NAME") },
          b: compileValue(block.getInputTargetBlock("VALUE")),
        },
      };
    case "ha_var_dec":
      return {
        type: "set_var",
        name: field(block, "NAME"),
        value: {
          type: "math",
          op: "-",
          a: { type: "var", name: field(block, "NAME") },
          b: compileValue(block.getInputTargetBlock("VALUE")),
        },
      };
    case "ha_scene":
      return { type: "service", domain: "scene", service: "turn_on", target: { entity_id: field(block, "ENTITY") } };
    case "ha_script":
      return { type: "service", domain: "script", service: "turn_on", target: { entity_id: field(block, "ENTITY") } };
    case "ha_automation":
      return { type: "service", domain: "automation", service: "trigger", target: { entity_id: field(block, "ENTITY") } };
    case "ha_tts":
      return {
        type: "service",
        domain: "tts",
        service: "speak",
        target: { entity_id: field(block, "TTS") },
        data: { media_player_entity_id: field(block, "MEDIA"), message: field(block, "TEXT") },
      };
    case "ha_stop":
      return { type: "stop" };
    case "ha_repeat":
      return {
        type: "repeat",
        count: compileValue(block.getInputTargetBlock("COUNT")),
        do: compileStatements(block.getInputTargetBlock("DO")),
      };
    case "ha_log":
      return {
        type: "log",
        message: compileValue(block.getInputTargetBlock("MESSAGE")),
        level: field(block, "LEVEL") || "info",
      };
    case "ha_notify": {
      const stmt = {
        type: "notify",
        service: field(block, "SERVICE") || "notify.notify",
        message: compileValue(block.getInputTargetBlock("MESSAGE")),
      };
      const title = compileValue(block.getInputTargetBlock("TITLE"));
      if (title) stmt.title = title;
      return stmt;
    }
    default:
      return null;
  }
}

// Values AND conditions (both live on value inputs).
function compileValue(block) {
  if (!block) return null;
  switch (block.type) {
    case "ha_compare":
      return {
        type: "compare",
        left: compileValue(block.getInputTargetBlock("A")),
        op: field(block, "OP") || "==",
        right: compileValue(block.getInputTargetBlock("B")),
      };
    case "ha_logic":
      return {
        type: "logic",
        op: field(block, "OP") || "and",
        items: [
          compileValue(block.getInputTargetBlock("A")),
          compileValue(block.getInputTargetBlock("B")),
        ],
      };
    case "ha_not":
      return { type: "not", item: compileValue(block.getInputTargetBlock("ITEM")) };
    case "ha_state": {
      const expr = { type: "state", entity: field(block, "ENTITY") };
      const attr = field(block, "ATTRIBUTE");
      if (attr) expr.attribute = attr;
      return expr;
    }
    case "ha_var_get":
      return { type: "var", name: field(block, "NAME") };
    case "ha_number":
      return { type: "const", value: Number(field(block, "NUM")) };
    case "ha_text":
      return { type: "const", value: field(block, "TEXT") };
    case "ha_bool":
      return { type: "const", value: field(block, "BOOL") === "true" };
    case "ha_state_value":
      return { type: "const", value: field(block, "VALUE") };
    case "ha_math":
      return {
        type: "math",
        op: field(block, "OP") || "+",
        a: compileValue(block.getInputTargetBlock("A")),
        b: compileValue(block.getInputTargetBlock("B")),
      };
    case "ha_template":
      return { type: "template", template: field(block, "TPL") };
    case "ha_trigger_value":
      return { type: "trigger", field: field(block, "FIELD") || "to_state" };
    default:
      return null;
  }
}
