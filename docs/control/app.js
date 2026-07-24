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
    const r = await fetch(`${RELAY}/api/cmd`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, cmd }),
    });
    const data = await r.json().catch(() => ({}));

    if (r.ok && data.ok) {
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
    renderFountains(data.fountains || "");
    if (data.owner) document.body.classList.add("is-owner");
  } catch {
    $("#conn").className = "dot off";
  }
}

/**
 * COMM replies with `::id::name::modules::id::name::modules::…`
 * (the MC::::FOUNTAIN_LIST prefix is stripped by the bridge).
 */
function renderFountains(raw) {
  const parts = raw.split("::").filter((s) => s !== "");
  const box = $("#fountains");
  if (parts.length < 3) {
    box.textContent = "No fountains detected.";
    return;
  }
  const names = [];
  for (let i = 0; i + 1 < parts.length; i += 3) names.push(parts[i + 1]);
  box.textContent = `${names.length} online: ${names.join(", ")}`;
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
