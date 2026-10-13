"""Constants for the HA Blockly Automations integration."""
from __future__ import annotations

DOMAIN = "ha_blockly"

# Persistent storage
STORAGE_KEY = "ha_blockly.rules"
STORAGE_VERSION = 1

# Frontend
PANEL_URL = "/ha_blockly_frontend"
PANEL_TITLE = "Blockly"
PANEL_ICON = "mdi:puzzle"
PANEL_NAME = "ha-blockly-panel"

# Config entry options
CONF_CONVERSATION_AGENT = "conversation_agent"

# Data stored on hass.data[DOMAIN]
DATA_STORE = "store"
DATA_ENGINE = "engine"
DATA_UNSUB = "unsub"

# IR (intermediate representation) version produced by the frontend generator.
IR_VERSION = 1
