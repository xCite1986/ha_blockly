"""AI-assisted rule generation using Home Assistant's conversation agents.

Takes a natural-language description, asks the configured conversation agent
(any installed LLM, e.g. OpenAI/Anthropic/Google/local Ollama via their HA
integrations) to emit the Blockly IR JSON, and returns it so the frontend can
render it as editable blocks.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from homeassistant.core import Context, HomeAssistant

_LOGGER = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a code generator for a Home Assistant visual automation tool.
You translate a natural-language description into a JSON program (the "IR").
Respond with ONLY one JSON object, no prose, no markdown fences.

IR schema (version 1):
{
  "version": 1,
  "name": "<short rule name>",
  "triggers": [ <trigger>, ... ],
  "actions": [ <statement>, ... ]
}

Triggers:
  {"type":"state","entity":"<entity_id>","to":"<state?>","from":"<state?>","attribute":"<attr?>","for":<seconds?>}
  {"type":"time","at":"HH:MM:SS"}
  {"type":"event","event_type":"<type>","data":{<k>:<v>}}
  {"type":"ha_start"}

Statements:
  {"type":"service","domain":"<domain>","service":"<service>","target":{"entity_id":"<entity_id>"},"data":{<k>:<v>},"delay":<seconds?>}
  {"type":"if","condition":<condition>,"then":[<statement>...],"else":[<statement>...]}
  {"type":"set_var","name":"<name>","value":<expr>}
  {"type":"wait","seconds":<expr>}
  {"type":"repeat","count":<expr>,"do":[<statement>...]}
  {"type":"log","message":<expr>,"level":"info"}
  {"type":"notify","service":"notify.notify","message":<expr>,"title":<expr?>}

Conditions:
  {"type":"compare","left":<expr>,"op":"=="|"!="|">"|">="|"<"|"<=","right":<expr>}
  {"type":"logic","op":"and"|"or","items":[<condition>...]}
  {"type":"not","item":<condition>}

Expressions (anywhere a value is expected):
  {"type":"const","value":<number|string|bool>}
  {"type":"state","entity":"<entity_id>","attribute":"<attr?>"}
  {"type":"var","name":"<name>"}
  {"type":"template","template":"{{ ... }}"}
  {"type":"math","op":"+"|"-"|"*"|"/"|"%","a":<expr>,"b":<expr>}

To pass an expression as a service data value, wrap it: "data":{"brightness":{"__expr__":{"type":"const","value":255}}}.
Only use entity_ids and services that appear in the provided context. Prefer simple rules.

IMPORTANT: Do NOT output a Home Assistant automation. Do NOT use the keys
"platform", "alias", "mode", or a top-level "service" string. Use ONLY this
schema: "triggers" (with "type"), "actions" (with "type"), and split services
into "domain" + "service"."""


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    # strip markdown code fences if present
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # fallback: grab the outermost braces
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def _entity_context(hass: HomeAssistant, limit: int = 400) -> str:
    lines: list[str] = []
    for state in hass.states.async_all():
        if len(lines) >= limit:
            break
        name = state.attributes.get("friendly_name", "")
        lines.append(f"{state.entity_id} = {state.state} ({name})")
    return "\n".join(lines)


async def async_generate_ir(
    hass: HomeAssistant,
    prompt: str,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Ask the conversation agent to produce an IR for the given prompt.

    Returns {"ir": {...}} on success or {"error": "..."} on failure.
    """
    # Import lazily so the integration still loads if conversation is absent.
    try:
        from homeassistant.components import conversation
    except ImportError:
        return {"error": "The 'conversation' integration is not available."}

    user_text = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Available entities:\n{_entity_context(hass)}\n\n"
        f"User request:\n{prompt}\n\n"
        f"Return only the JSON IR object."
    )

    try:
        result = await conversation.async_converse(
            hass,
            text=user_text,
            conversation_id=None,
            context=Context(),
            language=hass.config.language,
            agent_id=agent_id or None,
        )
    except Exception as err:  # noqa: BLE001
        _LOGGER.exception("AI generation failed")
        return {"error": f"Conversation agent error: {err}"}

    try:
        speech = result.response.speech.get("plain", {}).get("speech", "")
    except AttributeError:
        speech = str(result)

    ir = _extract_json(speech)
    if ir is None:
        return {"error": "Could not parse a JSON program from the agent response.", "raw": speech}
    ir.setdefault("version", 1)
    return {"ir": ir}
