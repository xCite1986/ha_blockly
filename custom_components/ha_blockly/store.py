"""Persistence for Blockly rules and folders."""
from __future__ import annotations

import time
import uuid
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION


def _now() -> float:
    return time.time()


class BlocklyStore:
    """Thin wrapper around hass storage holding rules and folders.

    Data layout::

        {
            "rules": { "<id>": { ...rule... }, ... },
            "folders": ["Heizung", "Licht/Wohnzimmer", ...]
        }

    A rule document::

        {
            "id": str,
            "name": str,
            "folder": str,          # "" for root, "/" separated otherwise
            "enabled": bool,
            "workspace": dict,      # Blockly serialization (for the editor)
            "ir": dict,             # compiled program (for the engine)
            "created": float,
            "modified": float,
        }
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {"rules": {}, "folders": []}
        self._listeners: list[Any] = []

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self._data = {
                "rules": data.get("rules", {}) or {},
                "folders": data.get("folders", []) or [],
            }

    async def _async_save(self) -> None:
        await self._store.async_save(self._data)
        for cb in list(self._listeners):
            cb()

    def add_change_listener(self, cb) -> None:
        """Register a callback fired whenever persisted data changes."""
        self._listeners.append(cb)

    # --- Rules ------------------------------------------------------------

    def list_rules(self) -> list[dict[str, Any]]:
        return list(self._data["rules"].values())

    def get_rule(self, rule_id: str) -> dict[str, Any] | None:
        return self._data["rules"].get(rule_id)

    async def async_save_rule(self, rule: dict[str, Any]) -> dict[str, Any]:
        rule_id = rule.get("id") or uuid.uuid4().hex
        existing = self._data["rules"].get(rule_id, {})
        doc = {
            "id": rule_id,
            "name": rule.get("name") or existing.get("name") or "Unbenannt",
            "folder": rule.get("folder", existing.get("folder", "")),
            "enabled": rule.get("enabled", existing.get("enabled", True)),
            "workspace": rule.get("workspace", existing.get("workspace", {})),
            "ir": rule.get("ir", existing.get("ir", {})),
            "created": existing.get("created", _now()),
            "modified": _now(),
        }
        self._data["rules"][rule_id] = doc
        # Make sure the folder exists in the registry.
        folder = doc["folder"]
        if folder and folder not in self._data["folders"]:
            self._data["folders"].append(folder)
        await self._async_save()
        return doc

    async def async_delete_rule(self, rule_id: str) -> bool:
        if rule_id in self._data["rules"]:
            del self._data["rules"][rule_id]
            await self._async_save()
            return True
        return False

    async def async_set_enabled(self, rule_id: str, enabled: bool) -> dict[str, Any] | None:
        rule = self._data["rules"].get(rule_id)
        if rule is None:
            return None
        rule["enabled"] = enabled
        rule["modified"] = _now()
        await self._async_save()
        return rule

    # --- Folders ----------------------------------------------------------

    def list_folders(self) -> list[str]:
        return list(self._data["folders"])

    async def async_create_folder(self, path: str) -> None:
        path = path.strip("/ ")
        if path and path not in self._data["folders"]:
            self._data["folders"].append(path)
            await self._async_save()

    async def async_rename_folder(self, old: str, new: str) -> None:
        old = old.strip("/ ")
        new = new.strip("/ ")
        if not old or not new:
            return
        self._data["folders"] = [
            new + f[len(old):] if (f == old or f.startswith(old + "/")) else f
            for f in self._data["folders"]
        ]
        for rule in self._data["rules"].values():
            f = rule.get("folder", "")
            if f == old or f.startswith(old + "/"):
                rule["folder"] = new + f[len(old):]
        await self._async_save()

    async def async_delete_folder(self, path: str, *, delete_rules: bool = False) -> None:
        path = path.strip("/ ")
        if not path:
            return
        self._data["folders"] = [
            f for f in self._data["folders"]
            if not (f == path or f.startswith(path + "/"))
        ]
        for rule_id, rule in list(self._data["rules"].items()):
            f = rule.get("folder", "")
            if f == path or f.startswith(path + "/"):
                if delete_rules:
                    del self._data["rules"][rule_id]
                else:
                    rule["folder"] = ""
        await self._async_save()
