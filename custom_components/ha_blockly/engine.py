"""Runtime that interprets compiled Blockly rules (IR) in Home Assistant.

The frontend compiles each Blockly workspace into a small JSON intermediate
representation (IR). This engine registers the triggers of every enabled rule
and executes the action list when a trigger fires. Keeping block->IR compilation
in the frontend keeps this interpreter small and language-agnostic.

IR shape (version 1)::

    { "version": 1, "triggers": [ <trigger> ], "actions": [ <statement> ] }

See README.md for the full schema.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import Any

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import template
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_sunrise,
    async_track_sunset,
    async_track_time_change,
)
import homeassistant.util.dt as dt_util

_LOGGER = logging.getLogger(__name__)


class _StopRule(Exception):
    """Raised by the 'stop' action to abort the current rule run."""


class BlocklyEngine:
    """Loads rules from the store and keeps their triggers wired up."""

    def __init__(self, hass: HomeAssistant, store) -> None:
        self._hass = hass
        self._store = store
        self._unsubs: list = []
        self._tasks: set[asyncio.Task] = set()
        # Per-rule execution traces (most recent last), capped per rule.
        self._traces: dict[str, list] = {}
        self._max_traces = 15

    def get_traces(self, rule_id: str) -> list:
        """Return recorded execution traces for a rule (most recent first)."""
        return list(reversed(self._traces.get(rule_id, [])))

    async def async_start(self) -> None:
        self.reload()

    @callback
    def reload(self) -> None:
        """Tear down all trigger listeners and re-register from the store."""
        self._teardown()
        for rule in self._store.list_rules():
            if not rule.get("enabled", True):
                continue
            try:
                self._setup_rule(rule)
            except Exception:  # noqa: BLE001 - never let one bad rule break reload
                _LOGGER.exception("Failed to set up Blockly rule %s", rule.get("name"))

    @callback
    def _teardown(self) -> None:
        while self._unsubs:
            try:
                self._unsubs.pop()()
            except Exception:  # noqa: BLE001
                pass

    async def async_run_rule(self, rule_id: str) -> dict | None:
        """Run a rule's action list immediately (ignoring triggers). For testing.

        Returns the execution trace, or None if the rule is unknown.
        """
        rule = self._store.get_rule(rule_id)
        if rule is None:
            return None
        actions = (rule.get("ir") or {}).get("actions") or []
        return await self._run(
            rule_id, rule.get("name", rule_id), actions, {"trigger": {"platform": "manual"}}, test=True
        )

    async def async_unload(self) -> None:
        self._teardown()
        for task in list(self._tasks):
            task.cancel()
        self._tasks.clear()

    # --- Trigger wiring ---------------------------------------------------

    @callback
    def _setup_rule(self, rule: dict[str, Any]) -> None:
        ir = rule.get("ir") or {}
        triggers = ir.get("triggers") or []
        actions = ir.get("actions") or []
        name = rule.get("name", rule.get("id"))
        rid = rule.get("id")

        for trig in triggers:
            ttype = trig.get("type")
            if ttype == "state":
                self._setup_state_trigger(rid, name, trig, actions)
            elif ttype == "numeric_state":
                self._setup_numeric_trigger(rid, name, trig, actions)
            elif ttype == "time":
                self._setup_time_trigger(rid, name, trig, actions)
            elif ttype == "sun":
                self._setup_sun_trigger(rid, name, trig, actions)
            elif ttype == "zone":
                self._setup_zone_trigger(rid, name, trig, actions)
            elif ttype == "event":
                self._setup_event_trigger(rid, name, trig, actions)
            elif ttype == "ha_start":
                self._unsubs.append(
                    self._hass.bus.async_listen_once(
                        EVENT_HOMEASSISTANT_STARTED,
                        lambda e, a=actions, n=name, r=rid: self._fire(r, n, a, {"trigger": {"platform": "homeassistant"}}),
                    )
                )
            else:
                _LOGGER.warning("Rule %s: unknown trigger type %s", name, ttype)

    @callback
    def _setup_state_trigger(self, rid, name, trig, actions) -> None:
        entities = trig.get("entity")
        if isinstance(entities, str):
            entities = [entities]
        if not entities:
            return
        to_state = trig.get("to")
        from_state = trig.get("from")
        attribute = trig.get("attribute")
        for_seconds = trig.get("for")
        pending: dict[str, asyncio.Task] = {}

        @callback
        def _handle(event: Event) -> None:
            new = event.data.get("new_state")
            old = event.data.get("old_state")
            if new is None:
                return

            def _val(state_obj):
                if state_obj is None:
                    return None
                if attribute:
                    return state_obj.attributes.get(attribute)
                return state_obj.state

            new_v = _val(new)
            old_v = _val(old)
            if to_state is not None and str(new_v) != str(to_state):
                return
            if from_state is not None and str(old_v) != str(from_state):
                return
            if to_state is None and from_state is None and new_v == old_v:
                return  # attribute/other change we don't care about

            ctx = {
                "trigger": {
                    "platform": "state",
                    "entity_id": event.data.get("entity_id"),
                    "from_state": old_v,
                    "to_state": new_v,
                }
            }
            if for_seconds:
                eid = event.data.get("entity_id")
                if eid in pending:
                    pending[eid].cancel()

                async def _delayed(seconds=for_seconds, a=actions, c=ctx, e=eid):
                    try:
                        await asyncio.sleep(float(seconds))
                        self._fire(rid, name, a, c)
                    except asyncio.CancelledError:
                        pass
                    finally:
                        pending.pop(e, None)

                pending[eid] = self._hass.async_create_task(_delayed())
            else:
                self._fire(rid, name, actions, ctx)

        self._unsubs.append(
            async_track_state_change_event(self._hass, entities, _handle)
        )

    @callback
    def _setup_time_trigger(self, rid, name, trig, actions) -> None:
        at = trig.get("at", "00:00:00")
        parts = [int(p) for p in str(at).split(":")]
        while len(parts) < 3:
            parts.append(0)
        h, m, s = parts[:3]

        @callback
        def _handle(now) -> None:
            self._fire(rid, name, actions, {"trigger": {"platform": "time", "now": now.isoformat()}})

        self._unsubs.append(
            async_track_time_change(self._hass, _handle, hour=h, minute=m, second=s)
        )

    @callback
    def _setup_numeric_trigger(self, rid, name, trig, actions) -> None:
        entity = trig.get("entity")
        if not entity:
            return
        above = trig.get("above")
        below = trig.get("below")
        attribute = trig.get("attribute")
        for_seconds = trig.get("for")
        pending: dict[str, asyncio.Task] = {}

        def _num(state_obj):
            if state_obj is None:
                return None
            raw = state_obj.attributes.get(attribute) if attribute else state_obj.state
            try:
                return float(raw)
            except (TypeError, ValueError):
                return None

        def _in_range(v) -> bool:
            if v is None:
                return False
            if above is not None and not (v > float(above)):
                return False
            if below is not None and not (v < float(below)):
                return False
            return above is not None or below is not None

        @callback
        def _handle(event: Event) -> None:
            nv = _num(event.data.get("new_state"))
            ov = _num(event.data.get("old_state"))
            if not (_in_range(nv) and not _in_range(ov)):
                return  # only fire on transition into range
            ctx = {
                "trigger": {
                    "platform": "numeric_state",
                    "entity_id": event.data.get("entity_id"),
                    "from_state": ov,
                    "to_state": nv,
                }
            }
            if for_seconds:
                eid = event.data.get("entity_id")
                if eid in pending:
                    pending[eid].cancel()

                async def _delayed(sec=for_seconds, a=actions, c=ctx, e=eid):
                    try:
                        await asyncio.sleep(float(sec))
                        if _in_range(_num(self._hass.states.get(entity))):
                            self._fire(rid, name, a, c)
                    except asyncio.CancelledError:
                        pass
                    finally:
                        pending.pop(e, None)

                pending[eid] = self._hass.async_create_task(_delayed())
            else:
                self._fire(rid, name, actions, ctx)

        self._unsubs.append(
            async_track_state_change_event(self._hass, [entity], _handle)
        )

    @callback
    def _setup_sun_trigger(self, rid, name, trig, actions) -> None:
        event = trig.get("event", "sunset")
        try:
            offset = timedelta(seconds=float(trig.get("offset") or 0))
        except (TypeError, ValueError):
            offset = timedelta(0)

        def _cb():
            self._fire(rid, name, actions, {"trigger": {"platform": "sun", "event": event}})

        if event == "sunrise":
            self._unsubs.append(async_track_sunrise(self._hass, _cb, offset))
        else:
            self._unsubs.append(async_track_sunset(self._hass, _cb, offset))

    @callback
    def _setup_zone_trigger(self, rid, name, trig, actions) -> None:
        person = trig.get("entity")
        zone = trig.get("zone")
        event = trig.get("event", "enter")
        if not person or not zone:
            return
        if zone == "zone.home":
            target = "home"
        else:
            zstate = self._hass.states.get(zone)
            target = (
                zstate.attributes.get("friendly_name")
                if zstate and zstate.attributes.get("friendly_name")
                else zone.split(".")[-1]
            )

        @callback
        def _handle(event_: Event) -> None:
            new = event_.data.get("new_state")
            old = event_.data.get("old_state")
            ns = new.state if new else None
            os_ = old.state if old else None
            was_in = os_ == target
            is_in = ns == target
            fire = (event == "enter" and is_in and not was_in) or (
                event == "leave" and was_in and not is_in
            )
            if fire:
                self._fire(
                    rid,
                    name,
                    actions,
                    {"trigger": {"platform": "zone", "entity_id": person, "from_state": os_, "to_state": ns}},
                )

        self._unsubs.append(
            async_track_state_change_event(self._hass, [person], _handle)
        )

    @callback
    def _setup_event_trigger(self, rid, name, trig, actions) -> None:
        event_type = trig.get("event_type")
        if not event_type:
            return
        wanted = trig.get("data") or {}

        @callback
        def _handle(event: Event) -> None:
            for k, v in wanted.items():
                if str(event.data.get(k)) != str(v):
                    return
            self._fire(rid, name, actions, {"trigger": {"platform": "event", "event": dict(event.data)}})

        self._unsubs.append(self._hass.bus.async_listen(event_type, _handle))

    # --- Execution --------------------------------------------------------

    @callback
    def _fire(self, rid: str, name: str, actions: list, ctx: dict, *, test: bool = False) -> None:
        task = self._hass.async_create_task(self._run(rid, name, actions, ctx, test=test))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _rule_log_level(self, rid: str) -> str:
        if not rid:
            return "info"
        rule = self._store.get_rule(rid)
        return (rule or {}).get("log_level", "info")

    async def _run(self, rid: str, name: str, actions: list, ctx: dict, *, test: bool = False) -> dict:
        variables: dict[str, Any] = {}
        level = self._rule_log_level(rid)
        # On a test run, call services blocking so errors surface in the trace.
        ctx["_test"] = test
        start = dt_util.now()
        trig = ctx.get("trigger") or {}
        trace: dict[str, Any] = {
            "id": str(start.timestamp()),
            "rule_id": rid,
            "name": name,
            "test": test,
            "trigger": trig,
            "started": start.isoformat(),
            "status": "ok",
            "steps": [
                {
                    "t": start.isoformat(),
                    "kind": "trigger",
                    "label": "Test-Ausführung" if test else f"Ausgelöst durch {trig.get('platform', 'Ereignis')}",
                    "status": "ok",
                }
            ],
        }
        _LOGGER.info("Blockly rule '%s' %s", name, "(Test)" if test else "triggered")
        try:
            await self._exec_block(actions, variables, ctx, trace)
        except _StopRule:
            trace["status"] = "stopped"
        except asyncio.CancelledError:
            raise
        except Exception as err:  # noqa: BLE001
            trace["status"] = "error"
            trace["error"] = str(err)
            _LOGGER.exception("Error while running Blockly rule '%s'", name)
        end = dt_util.now()
        trace["finished"] = end.isoformat()
        trace["duration"] = round((end - start).total_seconds(), 3)

        # Per-rule log level controls recording and live push (test always records).
        is_error = trace["status"] == "error"
        if test:
            record = True
        elif level == "off":
            record = False
        elif level == "error":
            record = is_error
        else:  # info, debug
            record = True

        if record and rid:
            bucket = self._traces.setdefault(rid, [])
            bucket.append(trace)
            del bucket[: max(0, len(bucket) - self._max_traces)]

        # Push a live event to the panel for real (non-test) runs.
        if not test and rid and record:
            self._hass.bus.async_fire("ha_blockly_trace", {"rule_id": rid, "trace": trace})

        if level == "debug":
            _LOGGER.warning("[Blockly:%s] %s – %s (%ss)", name, trace["status"], trig.get("platform", "?"), trace["duration"])
        return trace

    async def _exec_block(self, statements: list, variables: dict, ctx: dict, trace: dict) -> None:
        for stmt in statements or []:
            step = {
                "t": dt_util.now().isoformat(),
                "kind": "action",
                "label": self._label(stmt, variables, ctx),
                "status": "running",
                "id": stmt.get("_id"),
            }
            trace["steps"].append(step)
            try:
                await self._exec_statement(stmt, variables, ctx, trace, step)
                if step["status"] == "running":
                    step["status"] = "ok"
            except _StopRule:
                step["status"] = "stopped"
                raise
            except Exception as err:  # noqa: BLE001
                step["status"] = "error"
                step["detail"] = str(err)
                raise

    async def _exec_statement(self, stmt: dict, variables: dict, ctx: dict, trace: dict, step: dict) -> None:
        stype = stmt.get("type")
        if stype == "service":
            await self._do_service(stmt, variables, ctx)
        elif stype == "set":
            await self._do_set(stmt, variables, ctx)
        elif stype == "if":
            cond = self._eval_condition(stmt.get("condition"), variables, ctx)
            step["detail"] = "Bedingung erfüllt" if cond else "Bedingung nicht erfüllt"
            branch = stmt.get("then") if cond else stmt.get("else")
            await self._exec_block(branch or [], variables, ctx, trace)
        elif stype == "set_var":
            variables[stmt["name"]] = self._eval(stmt.get("value"), variables, ctx)
        elif stype == "wait":
            seconds = self._eval(stmt.get("seconds"), variables, ctx)
            await asyncio.sleep(float(seconds or 0))
        elif stype == "wait_until":
            ok = await self._do_wait_until(stmt, variables, ctx)
            step["detail"] = "Bedingung erfüllt" if ok else "Timeout"
        elif stype == "stop":
            raise _StopRule()
        elif stype == "repeat":
            count = int(self._eval(stmt.get("count"), variables, ctx) or 0)
            for _ in range(count):
                await self._exec_block(stmt.get("do") or [], variables, ctx, trace)
        elif stype == "log":
            level = stmt.get("level", "info")
            msg = self._eval(stmt.get("message"), variables, ctx)
            step["detail"] = str(msg)
            getattr(_LOGGER, level if level in ("debug", "info", "warning", "error") else "info")(
                "[Blockly] %s", msg
            )
        elif stype == "notify":
            await self._do_notify(stmt, variables, ctx)
        elif stype == "fire_event":
            self._hass.bus.async_fire(
                stmt.get("event_type", "ha_blockly_event"),
                self._eval_data(stmt.get("data") or {}, variables, ctx),
            )
        else:
            _LOGGER.warning("Unknown statement type: %s", stype)

    def _label(self, stmt: dict, variables: dict, ctx: dict) -> str:
        """Human-readable German label for a statement, for the trace timeline."""
        t = stmt.get("type")
        try:
            if t == "service":
                tgt = (stmt.get("target") or {}).get("entity_id")
                base = f"Dienst {stmt.get('domain')}.{stmt.get('service')}"
                return f"{base} → {tgt}" if tgt else base
            if t == "set":
                return f"setze {stmt.get('entity')} auf {self._describe(stmt.get('value'))}"
            if t == "if":
                return "falls (Bedingung)"
            if t == "set_var":
                return f"Variable {stmt.get('name')} setzen"
            if t == "wait":
                return f"warte {self._describe(stmt.get('seconds'))} Sekunden"
            if t == "wait_until":
                return "warte bis (Bedingung)"
            if t == "repeat":
                return f"wiederhole {self._describe(stmt.get('count'))}×"
            if t == "log":
                return "Log-Eintrag"
            if t == "notify":
                return f"benachrichtige {stmt.get('service')}"
            if t == "fire_event":
                return f"Event {stmt.get('event_type')}"
            if t == "stop":
                return "Ablauf beenden"
        except Exception:  # noqa: BLE001
            pass
        return str(t)

    def _describe(self, value) -> str:
        if isinstance(value, dict):
            if value.get("type") == "const":
                return str(value.get("value"))
            if value.get("type") == "state":
                return f"Zustand {value.get('entity')}"
            if value.get("type") == "var":
                return str(value.get("name"))
            return value.get("type", "?")
        return str(value)

    async def _do_service(self, stmt: dict, variables: dict, ctx: dict) -> None:
        delay = self._eval(stmt.get("delay"), variables, ctx)
        if delay:
            await asyncio.sleep(float(delay))
        domain = stmt.get("domain")
        service = stmt.get("service")
        if not domain or not service:
            return
        data = self._eval_data(stmt.get("data") or {}, variables, ctx)
        target = stmt.get("target") or {}
        if target.get("entity_id"):
            data["entity_id"] = target["entity_id"]
        await self._hass.services.async_call(domain, service, data, blocking=bool(ctx.get("_test")))

    async def _do_set(self, stmt: dict, variables: dict, ctx: dict) -> None:
        """Set an entity to a state/value, picking the right service by domain."""
        delay = self._eval(stmt.get("delay"), variables, ctx)
        if delay:
            await asyncio.sleep(float(delay))
        entity = stmt.get("entity")
        if not entity or "." not in entity:
            return
        domain = entity.split(".")[0]
        value = self._eval(stmt.get("value"), variables, ctx)
        sval = "" if value is None else str(value).strip()
        low = sval.lower()
        hass = self._hass

        async def call(dom, svc, extra=None):
            data = {"entity_id": entity}
            if extra:
                data.update(extra)
            await hass.services.async_call(dom, svc, data, blocking=bool(ctx.get("_test")))

        try:
            num = float(sval)
        except (TypeError, ValueError):
            num = None

        # Domain-specific value setters (non on/off semantics).
        if domain in ("input_select", "select"):
            await call(domain, "select_option", {"option": sval})
            return
        if domain in ("input_number", "number") and num is not None:
            await call(domain, "set_value", {"value": num})
            return
        if domain in ("input_text", "text"):
            await call(domain, "set_value", {"value": sval})
            return
        if domain == "climate":
            if num is not None:
                await call("climate", "set_temperature", {"temperature": num})
            elif low in ("off", "aus"):
                await call("climate", "turn_off")
            else:
                await call("climate", "set_hvac_mode", {"hvac_mode": low})
            return
        if domain == "cover":
            if num is not None:
                await call("cover", "set_cover_position", {"position": int(num)})
            elif low in ("open", "offen", "auf"):
                await call("cover", "open_cover")
            else:
                await call("cover", "close_cover")
            return
        if domain == "lock":
            if low in ("unlocked", "unlock", "auf", "offen"):
                await call("lock", "unlock")
            else:
                await call("lock", "lock")
            return
        if domain == "light" and num is not None:
            await call("light", "turn_on", {"brightness": int(num)})
            return
        if domain == "media_player" and num is not None:
            await call("media_player", "volume_set", {"volume_level": num})
            return

        # Generic on/off.
        if low in ("on", "true", "an", "ein", "1", "home", "playing"):
            await call("homeassistant", "turn_on")
            return
        if low in ("off", "false", "aus", "0", "not_home", "idle", "paused"):
            await call("homeassistant", "turn_off")
            return

        # Fallback: a set_value service if the domain has one, else turn_on.
        if hass.services.has_service(domain, "set_value"):
            await call(domain, "set_value", {"value": value})
            return
        await call("homeassistant", "turn_on")

    async def _do_wait_until(self, stmt: dict, variables: dict, ctx: dict) -> bool:
        """Poll a condition until it becomes true or an optional timeout elapses."""
        timeout = self._eval(stmt.get("timeout"), variables, ctx)
        try:
            deadline = float(timeout) if timeout else None
        except (TypeError, ValueError):
            deadline = None
        waited = 0.0
        interval = 1.0
        while True:
            if self._eval_condition(stmt.get("condition"), variables, ctx):
                return True
            if deadline is not None and waited >= deadline:
                return False
            await asyncio.sleep(interval)
            waited += interval

    async def _do_notify(self, stmt: dict, variables: dict, ctx: dict) -> None:
        service = stmt.get("service", "notify")
        blocking = bool(ctx.get("_test"))
        data: dict[str, Any] = {"message": str(self._eval(stmt.get("message"), variables, ctx))}
        if stmt.get("title") is not None:
            data["title"] = str(self._eval(stmt.get("title"), variables, ctx))
        # Modern notify entities (e.g. Alexa: notify.<device>_sprechen) are driven
        # via notify.send_message with the entity_id, not a legacy notify.<name> call.
        if service.startswith("notify.") and self._hass.states.get(service) is not None:
            data["entity_id"] = service
            await self._hass.services.async_call("notify", "send_message", data, blocking=blocking)
            return
        domain, _, svc = service.partition(".")
        if not svc:
            domain, svc = "notify", domain
        await self._hass.services.async_call(domain, svc, data, blocking=blocking)

    def _eval_data(self, data: dict, variables: dict, ctx: dict) -> dict:
        out: dict[str, Any] = {}
        for key, value in data.items():
            if isinstance(value, dict) and value.get("__expr__"):
                out[key] = self._eval(value["__expr__"], variables, ctx)
            else:
                out[key] = value
        return out

    # --- Expression & condition evaluation -------------------------------

    def _eval_condition(self, cond: dict | None, variables: dict, ctx: dict) -> bool:
        if not cond:
            return True
        ctype = cond.get("type")
        if ctype == "compare":
            left = self._eval(cond.get("left"), variables, ctx)
            right = self._eval(cond.get("right"), variables, ctx)
            return _compare(left, cond.get("op", "=="), right)
        if ctype == "logic":
            items = [self._eval_condition(c, variables, ctx) for c in cond.get("items", [])]
            if cond.get("op") == "or":
                return any(items)
            return all(items)
        if ctype == "not":
            return not self._eval_condition(cond.get("item"), variables, ctx)
        if ctype == "expr":
            return bool(self._eval(cond.get("value"), variables, ctx))
        return True

    def _eval(self, expr, variables: dict, ctx: dict):
        if expr is None:
            return None
        if not isinstance(expr, dict):
            return expr  # literal
        etype = expr.get("type")
        if etype == "const":
            return expr.get("value")
        if etype == "var":
            return variables.get(expr.get("name"))
        if etype == "state":
            return self._read_state(expr.get("entity"), expr.get("attribute"))
        if etype == "template":
            return self._render_template(expr.get("template", ""), variables, ctx)
        if etype == "math":
            return _math(
                self._eval(expr.get("a"), variables, ctx),
                expr.get("op", "+"),
                self._eval(expr.get("b"), variables, ctx),
            )
        if etype == "str":
            return "".join(str(self._eval(p, variables, ctx)) for p in expr.get("parts", []))
        if etype == "now":
            return dt_util.now().isoformat()
        if etype == "trigger":
            trig = ctx.get("trigger") or {}
            return trig.get(expr.get("field", "to_state"))
        return None

    def _read_state(self, entity: str | None, attribute: str | None):
        if not entity:
            return None
        state = self._hass.states.get(entity)
        if state is None:
            return None
        if attribute:
            return state.attributes.get(attribute)
        return _coerce(state.state)

    def _render_template(self, tpl: str, variables: dict, ctx: dict):
        try:
            tmpl = template.Template(tpl, self._hass)
            return tmpl.async_render({"variables": variables, "trigger": ctx.get("trigger")})
        except Exception as err:  # noqa: BLE001
            _LOGGER.error("Template error in Blockly rule: %s", err)
            return None


def _coerce(value):
    """Turn a state string into a number when it looks like one."""
    if value in (None, "unknown", "unavailable", ""):
        return value
    try:
        if "." in str(value):
            return float(value)
        return int(value)
    except (ValueError, TypeError):
        return value


_TRUE_WORDS = {
    "on", "true", "wahr", "yes", "ja", "1", "home", "open", "offen",
    "locked", "playing", "active", "detected", "heat", "cool", "auto",
}
_FALSE_WORDS = {
    "off", "false", "falsch", "unwahr", "no", "nein", "0", "not_home",
    "closed", "geschlossen", "unlocked", "idle", "standby", "paused",
    "unavailable", "unknown", "clear", "none", "",
}


def _to_bool(v):
    """Map a value to True/False for boolean-aware comparison, else None."""
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    if s in _TRUE_WORDS:
        return True
    if s in _FALSE_WORDS:
        return False
    return None


def _compare(left, op, right) -> bool:
    left = _coerce(left)
    right = _coerce(right)
    # Boolean-aware equality: compare on/off states against wahr/falsch sensibly.
    if op in ("==", "=", "!=", "<>") and (isinstance(left, bool) or isinstance(right, bool)):
        lb = _to_bool(left)
        rb = _to_bool(right)
        if lb is not None and rb is not None:
            return lb == rb if op in ("==", "=") else lb != rb
    try:
        if op in ("==", "="):
            return str(left) == str(right) if not _both_num(left, right) else left == right
        if op in ("!=", "<>"):
            return str(left) != str(right) if not _both_num(left, right) else left != right
        if op == ">":
            return float(left) > float(right)
        if op == ">=":
            return float(left) >= float(right)
        if op == "<":
            return float(left) < float(right)
        if op == "<=":
            return float(left) <= float(right)
    except (ValueError, TypeError):
        return False
    return False


def _both_num(a, b) -> bool:
    return isinstance(a, (int, float)) and isinstance(b, (int, float))


def _math(a, op, b):
    try:
        a = float(a)
        b = float(b)
    except (ValueError, TypeError):
        if op == "+":
            return f"{a}{b}"
        return None
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if op == "/":
        return a / b if b else None
    if op == "%":
        return a % b if b else None
    return None
