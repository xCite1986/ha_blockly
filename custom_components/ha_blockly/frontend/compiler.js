// Compile a Blockly workspace into the engine IR (see engine.py).

export function compileWorkspace(workspace) {
  const triggers = [];
  let actions = [];
  let actionsSet = false;
  for (const block of workspace.getTopBlocks(true)) {
    if (block.disabled || !block.isEnabled()) continue;
    const t = compileTrigger(block);
    if (!t) continue;
    triggers.push(t.trigger);
    if (!actionsSet) {
      actions = compileStatements(block.getInputTargetBlock("DO"));
      actionsSet = true;
    }
  }
  return { version: 1, triggers, actions };
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
    case "ha_on_time":
      return { trigger: { type: "time", at: field(block, "TIME") || "00:00:00" } };
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
    case "ha_math":
      return {
        type: "math",
        op: field(block, "OP") || "+",
        a: compileValue(block.getInputTargetBlock("A")),
        b: compileValue(block.getInputTargetBlock("B")),
      };
    case "ha_template":
      return { type: "template", template: field(block, "TPL") };
    default:
      return null;
  }
}
