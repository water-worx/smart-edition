/**
 * S.M.A.R.T web control — renderer + transport
 *
 * Reads the session token from the URL fragment (never the query
 * string, so it stays out of Referer headers and server logs), renders
 * the manifest in commands.js, and posts commands through the relay.
 */

import { SECTIONS } from "./commands.js";

// Change this if you deploy the relay somewhere else.
const RELAY = "https://waterworx-relay-75wh2jv80gw6.app-wx.deno.net";

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------
// Session
// ---------------------------------------------------------------

function readToken() {
  const frag = new URLSearchParams(location.hash.slice(1));
  return frag.get("s") ?? "";
}

const token = readToken();
let fountainId = -1;  // -1 = global, else fountain-specific

// State tracking (reflects last sent commands, not guaranteed in-world state)
let state = {
  isOn: false,
  mode: "SEQUENCE",    // SEQUENCE, ANIMATE, HYBRID
  pattern: "P01",
  show: "stopped",
};

// Apply fountain context to a command. If fountainId != -1, insert it after first ::
function applyFountainContext(cmd) {
  if (fountainId === -1) return cmd;
  const idx = cmd.indexOf("::");
  if (idx === -1) return cmd + "::" + fountainId;
  return cmd.slice(0, idx + 2) + fountainId + "::" + cmd.slice(idx + 2);
}

// Parse commands to update local state display
function updateStateFromCommand(cmd) {
  if (cmd.includes("⛲ ON")) state.isOn = true;
  else if (cmd.includes("⛲ OFF")) state.isOn = false;
  else if (cmd.includes("🧩 STATIC")) state.mode = "STATIC";
  else if (cmd.includes("🧩 AUTO")) state.mode = "AUTO";
  else if (cmd.includes("🧩 RANDOM")) state.mode = "RANDOM";
  else if (cmd.includes("ANIMATE::ON")) state.mode = "ANIMATE";
  else if (cmd.includes("HYBRID::ON")) state.mode = "HYBRID";
  else if (cmd.startsWith("P") && cmd.length <= 4) state.pattern = cmd;
  else if (cmd.includes("DANCE::SHOW")) {
    const show = cmd.split("::").pop();
    state.show = show !== "stop" ? show : "stopped";
  }
  updateStatusDisplay();
}

function updateStatusDisplay() {
  const statusBar = $("#status-bar");
  if (!statusBar) return;

  const statusEl = $("#fountain-status");
  const modeEl = $("#fountain-mode");
  const patternEl = $("#fountain-pattern");

  if (statusEl) {
    statusEl.textContent = state.isOn ? "🟢 ON" : "🔴 OFF";
    statusEl.className = `badge ${state.isOn ? "on" : "off"}`;
  }

  if (modeEl) {
    modeEl.textContent = state.mode;
    const modeClass = state.mode === "ANIMATE" || state.mode === "HYBRID" ? "on" : "";
    modeEl.className = `badge ${modeClass}`;
  }

  if (patternEl) {
    const display = state.show !== "stopped" ? state.show : state.pattern;
    patternEl.textContent = display;
  }

  statusBar.hidden = false;
}

// ---------------------------------------------------------------
// Transport
// ---------------------------------------------------------------

let busy = false;

async function send(cmd, el) {
  if (!token) return setStatus("No session — touch the panel in-world.", "err");
  if (busy) return;
  busy = true;
  el?.classList.add("pending");

  try {
    const finalCmd = applyFountainContext(cmd);
    const r = await fetch(`${RELAY}/api/cmd`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, cmd: finalCmd }),
    });
    const data = await r.json().catch(() => ({}));

    if (r.ok && data.ok) {
      updateStateFromCommand(finalCmd);
      setStatus(`Sent ${cmd}`, "ok");
      el?.classList.add("flash");
      setTimeout(() => el?.classList.remove("flash"), 300);
    } else if (r.status === 401) {
      setStatus("Session expired — touch the panel in-world for a new link.", "err");
    } else if (r.status === 403) {
      setStatus("Not permitted for this session.", "err");
    } else if (r.status === 504) {
      // Region restart is the overwhelmingly common cause: the panel's
      // HTTP-in URL died and it has not re-registered yet.
      setStatus("Panel unreachable — region may have restarted. Retrying shortly.", "err");
    } else {
      setStatus(`Error: ${data.error ?? r.status}`, "err");
    }
  } catch {
    setStatus("Network error.", "err");
  } finally {
    busy = false;
    el?.classList.remove("pending");
  }
}

async function refreshState() {
  if (!token) return;
  try {
    const r = await fetch(`${RELAY}/api/state?token=${encodeURIComponent(token)}`);
    const data = await r.json();
    if (!data.ok) {
      $("#region").textContent = "—";
      $("#conn").className = "dot off";
      return;
    }
    $("#conn").className = "dot on";
    $("#region").textContent = data.region || "—";

    // Update fountain context
    if (data.fountainId !== undefined) {
      fountainId = data.fountainId;
      const contextEl = document.querySelector("h1 small");
      if (contextEl) {
        contextEl.textContent = fountainId === -1 ? "(Global)" : `(Fountain #${fountainId % 10000})`;
      }
    }

    renderFountains(data.fountains || "");
    if (data.owner) document.body.classList.add("is-owner");
  } catch {
    $("#conn").className = "dot off";
  }
}

/**
 * COMM replies with `::id::name::modules::id::name::modules::…`
 * (the MC::::FOUNTAIN_LIST prefix is stripped by the bridge).
 * Display format: F-1234 or F-1234 Ⓐ (if has animate module)
 */
function renderFountains(raw) {
  const parts = raw.split("::").filter((s) => s !== "");
  const box = $("#fountains");
  if (parts.length < 3) {
    box.textContent = "No fountains detected.";
    return;
  }
  const labels = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const id = parseInt(parts[i], 10);
    const mod = parts[i + 2];
    const suffix = (id % 10000).toString().padStart(4, "0");
    let label = `F-${suffix}`;
    if (mod !== "") label += " Ⓐ";
    labels.push(label);
  }
  box.textContent = `${labels.length} online: ${labels.join(", ")}`;
}

function setStatus(msg, kind) {
  const el = $("#status");
  el.textContent = msg;
  el.className = kind ?? "";
}

// ---------------------------------------------------------------
// Rendering — generic over the manifest
// ---------------------------------------------------------------

const resolve = (v, arg) => (typeof v === "function" ? v(arg) : v);

function buildControl(c) {
  if (c.type === "button") {
    const b = document.createElement("button");
    b.className = `btn ${c.tone ?? ""}`;
    b.textContent = c.label;
    b.onclick = () => send(resolve(c.cmd), b);
    return b;
  }

  if (c.type === "grid") {
    const wrap = document.createElement("div");
    wrap.className = "grid";
    for (let i = 0; i < c.count; i++) {
      const b = document.createElement("button");
      b.className = "btn small";
      b.textContent = resolve(c.caption, i);
      b.onclick = () => send(resolve(c.cmd, i), b);
      wrap.append(b);
    }
    return wrap;
  }

  if (c.type === "slider") {
    const wrap = document.createElement("div");
    wrap.className = "slider";

    const head = document.createElement("div");
    head.className = "slider-head";
    const name = document.createElement("span");
    name.textContent = c.label;
    const val = document.createElement("output");
    val.textContent = resolve(c.format, c.value) ?? c.value;
    head.append(name, val);

    const input = document.createElement("input");
    Object.assign(input, {
      type: "range",
      min: c.min, max: c.max, step: c.step, value: c.value,
    });
    input.oninput = () => {
      val.textContent = resolve(c.format, Number(input.value)) ?? input.value;
    };
    // Fire on release only. Each command is an in-world message, and
    // per-object llHTTPRequest throttling is 25 requests / 20 seconds —
    // streaming every drag frame would trip it instantly.
    input.onchange = () => send(resolve(c.cmd, Number(input.value)), wrap);

    wrap.append(head, input);
    return wrap;
  }

  if (c.type === "select") {
    const wrap = document.createElement("div");
    wrap.className = "slider";
    const name = document.createElement("span");
    name.textContent = c.label;
    const sel = document.createElement("select");
    for (const o of c.options) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      sel.append(opt);
    }
    sel.onchange = () => send(resolve(c.cmd, sel.value), wrap);
    wrap.append(name, sel);
    return wrap;
  }

  return document.createTextNode("");
}

function render() {
  const root = $("#panel");
  for (const section of SECTIONS) {
    const s = document.createElement("section");
    s.id = `sec-${section.id}`;

    const h = document.createElement("h2");
    h.textContent = section.title;
    s.append(h);

    if (section.note) {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = section.note;
      s.append(p);
    }

    const body = document.createElement("div");
    body.className = "controls";
    for (const c of section.controls) body.append(buildControl(c));
    s.append(body);

    root.append(s);
  }
}

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------

if (!token) {
  $("#gate").hidden = false;
  $("#panel").hidden = true;
} else {
  render();
  refreshState();
  // Cheap poll. Each tick is one relay call and one in-world request;
  // 10s stays far inside the 25-per-20-seconds object throttle.
  setInterval(refreshState, 10_000);
}
