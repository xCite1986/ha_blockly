"""WebSocket API for the Blockly panel frontend."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .ai import async_generate_ir
from .const import DATA_ENGINE, DATA_STORE, DOMAIN


def _ctx(hass: HomeAssistant) -> tuple[Any, Any]:
    data = hass.data[DOMAIN]
    return data[DATA_STORE], data[DATA_ENGINE]


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_save)
    websocket_api.async_register_command(hass, ws_delete)
    websocket_api.async_register_command(hass, ws_set_enabled)
    websocket_api.async_register_command(hass, ws_run)
    websocket_api.async_register_command(hass, ws_get_traces)
    websocket_api.async_register_command(hass, ws_reload)
    websocket_api.async_register_command(hass, ws_folder_create)
    websocket_api.async_register_command(hass, ws_folder_rename)
    websocket_api.async_register_command(hass, ws_folder_delete)
    websocket_api.async_register_command(hass, ws_ai_generate)
    websocket_api.async_register_command(hass, ws_list_agents)


@websocket_api.websocket_command({vol.Required("type"): "ha_blockly/list"})
@websocket_api.async_response
async def ws_list(hass, connection, msg) -> None:
    store, _ = _ctx(hass)
    connection.send_result(
        msg["id"],
        {"rules": store.list_rules(), "folders": store.list_folders()},
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "ha_blockly/get", vol.Required("rule_id"): str}
)
@websocket_api.async_response
async def ws_get(hass, connection, msg) -> None:
    store, _ = _ctx(hass)
    rule = store.get_rule(msg["rule_id"])
    if rule is None:
        connection.send_error(msg["id"], "not_found", "Rule not found")
        return
    connection.send_result(msg["id"], rule)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_blockly/save",
        vol.Required("rule"): dict,
    }
)
@websocket_api.async_response
async def ws_save(hass, connection, msg) -> None:
    store, engine = _ctx(hass)
    doc = await store.async_save_rule(msg["rule"])
    engine.reload()
    connection.send_result(msg["id"], doc)


@websocket_api.websocket_command(
    {vol.Required("type"): "ha_blockly/delete", vol.Required("rule_id"): str}
)
@websocket_api.async_response
async def ws_delete(hass, connection, msg) -> None:
    store, engine = _ctx(hass)
    ok = await store.async_delete_rule(msg["rule_id"])
    engine.reload()
    connection.send_result(msg["id"], {"success": ok})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_blockly/set_enabled",
        vol.Required("rule_id"): str,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_set_enabled(hass, connection, msg) -> None:
    store, engine = _ctx(hass)
    rule = await store.async_set_enabled(msg["rule_id"], msg["enabled"])
    engine.reload()
    if rule is None:
        connection.send_error(msg["id"], "not_found", "Rule not found")
        return
    connection.send_result(msg["id"], rule)


@websocket_api.websocket_command(
    {vol.Required("type"): "ha_blockly/run", vol.Required("rule_id"): str}
)
@websocket_api.async_response
async def ws_run(hass, connection, msg) -> None:
    _, engine = _ctx(hass)
    trace = await engine.async_run_rule(msg["rule_id"])
    if trace is None:
        connection.send_error(msg["id"], "not_found", "Rule not found")
        return
    connection.send_result(msg["id"], {"success": True, "trace": trace})


@websocket_api.websocket_command(
    {vol.Required("type"): "ha_blockly/get_traces", vol.Required("rule_id"): str}
)
@websocket_api.async_response
async def ws_get_traces(hass, connection, msg) -> None:
    _, engine = _ctx(hass)
    connection.send_result(msg["id"], {"traces": engine.get_traces(msg["rule_id"])})


@websocket_api.websocket_command({vol.Required("type"): "ha_blockly/reload"})
@websocket_api.async_response
async def ws_reload(hass, connection, msg) -> None:
    _, engine = _ctx(hass)
    engine.reload()
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {vol.Required("type"): "ha_blockly/folder_create", vol.Required("path"): str}
)
@websocket_api.async_response
async def ws_folder_create(hass, connection, msg) -> None:
    store, _ = _ctx(hass)
    await store.async_create_folder(msg["path"])
    connection.send_result(msg["id"], {"folders": store.list_folders()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_blockly/folder_rename",
        vol.Required("old"): str,
        vol.Required("new"): str,
    }
)
@websocket_api.async_response
async def ws_folder_rename(hass, connection, msg) -> None:
    store, engine = _ctx(hass)
    await store.async_rename_folder(msg["old"], msg["new"])
    engine.reload()
    connection.send_result(
        msg["id"], {"folders": store.list_folders(), "rules": store.list_rules()}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_blockly/folder_delete",
        vol.Required("path"): str,
        vol.Optional("delete_rules", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_folder_delete(hass, connection, msg) -> None:
    store, engine = _ctx(hass)
    await store.async_delete_folder(msg["path"], delete_rules=msg["delete_rules"])
    engine.reload()
    connection.send_result(
        msg["id"], {"folders": store.list_folders(), "rules": store.list_rules()}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_blockly/ai_generate",
        vol.Required("prompt"): str,
        vol.Optional("agent_id"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_ai_generate(hass, connection, msg) -> None:
    result = await async_generate_ir(hass, msg["prompt"], msg.get("agent_id"))
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "ha_blockly/list_agents"})
@websocket_api.async_response
async def ws_list_agents(hass, connection, msg) -> None:
    agents: list[dict[str, str]] = []
    try:
        from homeassistant.components import conversation

        manager = conversation.get_agent_manager(hass)
        for info in manager.async_get_agent_info():
            agents.append({"id": info.id, "name": info.name})
    except Exception:  # noqa: BLE001 - older/newer cores differ; degrade gracefully
        pass
    connection.send_result(msg["id"], {"agents": agents})
