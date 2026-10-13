// Build Blockly blocks from engine IR (used for AI-generated programs).

export function buildFromIR(workspace, ir, Blockly) {
  workspace.clear();
  if (!ir || !Array.isArray(ir.triggers) || ir.triggers.length === 0) {
    return;
  }

  // The first trigger becomes the top block carrying the action stack.
  const triggers = ir.triggers;
  const topBlock = makeTrigger(workspace, triggers[0], Blockly);
  if (!topBlock) return;

  // Attach the action stack to the first trigger's DO input.
  const actions = ir.actions || [];
  const firstStmt = buildStatements(workspace, actions, Blockly);
  if (firstStmt) {
    topBlock.getInput("DO").connection.connect(firstStmt.previousConnection);
  }

  // Place subsequent triggers as separate top blocks (documented limitation:
  // only the first trigger's action stack runs; extra triggers are visual).
  let x = 40;
  topBlock.moveBy(x, 40);
  for (let i = 1; i < triggers.length; i++) {
    const b = makeTrigger(workspace, triggers[i], Blockly);
    if (b) b.moveBy(x, 40 + i * 120);
  }

  workspace.render();
}

function newBlock(workspace, type, Blockly) {
  const block = workspace.newBlock(type);
  if (block.initSvg) block.initSvg();
  return block;
}

function setField(block, name, value) {
  if (value === undefined || value === null) return;
  try {
    block.setFieldValue(String(value), name);
  } catch (e) {
    /* field may not accept value; ignore */
  }
}

function makeTrigger(workspace, trig, Blockly) {
  if (!trig) return null;
  let block;
  switch (trig.type) {
    case "state":
      block = newBlock(workspace, "ha_on_state", Blockly);
      setField(block, "ENTITY", trig.entity);
      setField(block, "TO", trig.to || "");
      setField(block, "FROM", trig.from || "");
      setField(block, "ATTRIBUTE", trig.attribute || "");
      setField(block, "FOR", trig.for || 0);
      break;
    case "time":
      block = newBlock(workspace, "ha_on_time", Blockly);
      setField(block, "TIME", trig.at || "00:00:00");
      break;
    case "event":
      block = newBlock(workspace, "ha_on_event", Blockly);
      setField(block, "EVENT", trig.event_type || "");
      break;
    case "ha_start":
      block = newBlock(workspace, "ha_on_start", Blockly);
      break;
    default:
      return null;
  }
  return block;
}

function buildStatements(workspace, stmts, Blockly) {
  let first = null;
  let prev = null;
  for (const stmt of stmts || []) {
    const block = buildStatement(workspace, stmt, Blockly);
    if (!block) continue;
    if (!first) first = block;
    if (prev && prev.nextConnection && block.previousConnection) {
      prev.nextConnection.connect(block.previousConnection);
    }
    prev = block;
  }
  return first;
}

function buildStatement(workspace, stmt, Blockly) {
  if (!stmt) return null;
  let block;
  switch (stmt.type) {
    case "service":
      block = newBlock(workspace, "ha_call_service", Blockly);
      setField(block, "DOMAIN", stmt.domain);
      setField(block, "SERVICE", stmt.service);
      setField(block, "ENTITY", (stmt.target && stmt.target.entity_id) || "");
      if (stmt.data && Object.keys(stmt.data).length) {
        setField(block, "DATA", JSON.stringify(stmt.data));
      }
      setField(block, "DELAY", stmt.delay || 0);
      break;
    case "if":
      block = newBlock(workspace, "ha_if", Blockly);
      connectValue(block, "COND", stmt.condition, workspace, Blockly);
      connectStack(block, "DO", stmt.then, workspace, Blockly);
      connectStack(block, "ELSE", stmt.else, workspace, Blockly);
      break;
    case "set_var":
      block = newBlock(workspace, "ha_set_var", Blockly);
      setField(block, "NAME", stmt.name);
      connectValue(block, "VALUE", stmt.value, workspace, Blockly);
      break;
    case "wait":
      block = newBlock(workspace, "ha_wait", Blockly);
      connectValue(block, "SECONDS", stmt.seconds, workspace, Blockly);
      break;
    case "repeat":
      block = newBlock(workspace, "ha_repeat", Blockly);
      connectValue(block, "COUNT", stmt.count, workspace, Blockly);
      connectStack(block, "DO", stmt.do, workspace, Blockly);
      break;
    case "log":
      block = newBlock(workspace, "ha_log", Blockly);
      connectValue(block, "MESSAGE", stmt.message, workspace, Blockly);
      setField(block, "LEVEL", stmt.level || "info");
      break;
    case "notify":
      block = newBlock(workspace, "ha_notify", Blockly);
      setField(block, "SERVICE", stmt.service || "notify.notify");
      connectValue(block, "MESSAGE", stmt.message, workspace, Blockly);
      if (stmt.title) connectValue(block, "TITLE", stmt.title, workspace, Blockly);
      break;
    default:
      return null;
  }
  return block;
}

function connectStack(parent, inputName, stmts, workspace, Blockly) {
  const first = buildStatements(workspace, stmts, Blockly);
  if (first) {
    const input = parent.getInput(inputName);
    if (input && input.connection && first.previousConnection) {
      input.connection.connect(first.previousConnection);
    }
  }
}

function connectValue(parent, inputName, expr, workspace, Blockly) {
  const block = buildValue(workspace, expr, Blockly);
  if (block) {
    const input = parent.getInput(inputName);
    if (input && input.connection && block.outputConnection) {
      input.connection.connect(block.outputConnection);
    }
  }
}

function buildValue(workspace, expr, Blockly) {
  if (expr === null || expr === undefined) return null;
  // Bare literals -> const blocks
  if (typeof expr !== "object") {
    return literalBlock(workspace, expr, Blockly);
  }
  let block;
  switch (expr.type) {
    case "const":
      return literalBlock(workspace, expr.value, Blockly);
    case "state":
      block = newBlock(workspace, "ha_state", Blockly);
      setField(block, "ENTITY", expr.entity);
      setField(block, "ATTRIBUTE", expr.attribute || "");
      break;
    case "var":
      block = newBlock(workspace, "ha_var_get", Blockly);
      setField(block, "NAME", expr.name);
      break;
    case "template":
      block = newBlock(workspace, "ha_template", Blockly);
      setField(block, "TPL", expr.template || "");
      break;
    case "math":
      block = newBlock(workspace, "ha_math", Blockly);
      setField(block, "OP", expr.op || "+");
      connectValue(block, "A", expr.a, workspace, Blockly);
      connectValue(block, "B", expr.b, workspace, Blockly);
      break;
    case "compare":
      block = newBlock(workspace, "ha_compare", Blockly);
      setField(block, "OP", expr.op || "==");
      connectValue(block, "A", expr.left, workspace, Blockly);
      connectValue(block, "B", expr.right, workspace, Blockly);
      break;
    case "logic":
      block = newBlock(workspace, "ha_logic", Blockly);
      setField(block, "OP", expr.op || "and");
      connectValue(block, "A", (expr.items || [])[0], workspace, Blockly);
      connectValue(block, "B", (expr.items || [])[1], workspace, Blockly);
      break;
    case "not":
      block = newBlock(workspace, "ha_not", Blockly);
      connectValue(block, "ITEM", expr.item, workspace, Blockly);
      break;
    default:
      return null;
  }
  return block;
}

function literalBlock(workspace, value, Blockly) {
  let block;
  if (typeof value === "boolean") {
    block = newBlock(workspace, "ha_bool", Blockly);
    setField(block, "BOOL", value ? "true" : "false");
  } else if (typeof value === "number") {
    block = newBlock(workspace, "ha_number", Blockly);
    setField(block, "NUM", value);
  } else {
    block = newBlock(workspace, "ha_text", Blockly);
    setField(block, "TEXT", value == null ? "" : String(value));
  }
  return block;
}
