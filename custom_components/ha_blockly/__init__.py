"""HA Blockly Automations integration."""
from __future__ import annotations

import logging
import os

from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import (
    DATA_ENGINE,
    DATA_STORE,
    DOMAIN,
    PANEL_ICON,
    PANEL_NAME,
    PANEL_TITLE,
    PANEL_URL,
)
from .engine import BlocklyEngine
from .store import BlocklyStore
from . import websocket_api

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
PANEL_PATH = "ha-blockly"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA Blockly from a config entry."""
    store = BlocklyStore(hass)
    await store.async_load()

    engine = BlocklyEngine(hass, store)
    await engine.async_start()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][DATA_STORE] = store
    hass.data[DOMAIN][DATA_ENGINE] = engine

    websocket_api.async_register(hass)

    # Serve the panel bundle as static files.
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_URL, FRONTEND_DIR, False)]
    )

    # Cache-bust the frontend module by the integration version so browsers
    # fetch the new bundle after every update instead of a stale cached copy.
    try:
        from homeassistant.loader import async_get_integration

        integration = await async_get_integration(hass, DOMAIN)
        frontend_ver = str(integration.version)
    except Exception:  # noqa: BLE001
        frontend_ver = str(entry.version)

    # Register the sidebar panel (custom web component served from above).
    try:
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name=PANEL_NAME,
            frontend_url_path=PANEL_PATH,
            module_url=f"{PANEL_URL}/ha-blockly-panel.js?v={frontend_ver}",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            require_admin=True,
            config={"name": PANEL_NAME, "embed_iframe": False},
            config_panel_domain=None,
        )
    except ValueError:
        # Panel already registered (e.g. reload) - ignore.
        pass

    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    _LOGGER.info("HA Blockly Automations set up")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the config entry."""
    from homeassistant.components import frontend

    data = hass.data.get(DOMAIN, {})
    engine = data.get(DATA_ENGINE)
    if engine:
        await engine.async_unload()

    try:
        frontend.async_remove_panel(hass, PANEL_PATH)
    except Exception:  # noqa: BLE001
        pass

    hass.data.pop(DOMAIN, None)
    return True


async def _async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    engine = hass.data.get(DOMAIN, {}).get(DATA_ENGINE)
    if engine:
        engine.reload()
