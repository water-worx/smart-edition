/**
 * S.M.A.R.T web control — renderer + transport
 *
 * Reads the session token from the URL fragment (never the query
 * string, so it stays out of Referer headers and server logs), renders
 * the manifest in commands.js, and posts commands through the relay.
 */

import { SECTIONS } from "./commands.js";
import { ctx } from "./state.js";
import { getPins, isPinned, togglePin } from "./pins.js";

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

// State tracking (reflects last sent commands, not guaranteed in-world state)
let state = {
  isOn: false,
  mode: "SEQUENCE",    // SEQUENCE, ANIMATE, HYBRID
  pattern: "P01",
  show: "stopped",
};

/**
 * Resolve a base command to what actually gets sent, based on the
 * control's fountain-scoping rule and the session's fountainId. This
 * must match the Panel's own routing exactly (fc() / fl() / bare
 * communicate() in MASTER.lsl) — see the scope docs in commands.js.
 */
function resolveCommand(cmd, scope = "fountain") {
  const fid = ctx.fountainId;
  if (fid === -1 || scope === "global") return cmd;

  if (scope === "power") return `POWER::${fid}::TOGGLE`;
  if (scope === "light") return `LIGHT::${fid}::${cmd}`;

  // "fountain" (default): insert the ID right after the first "::",
  // or append one if the command has none at all.
  const idx = cmd.indexOf("::");
  if (idx === -1) return `${cmd}::${fid}`;
  return cmd.slice(0, idx + 2) + fid + "::" + cmd.slice(idx + 2);
}

// Parse commands to update local state display
function updateStateFromCommand(cmd) {
  if (cmd.includes("⛲ ON") || cmd.includes("POWER::")) state.isOn = true;
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

async function send(cmd, el, scope, guard) {
  if (!token) return setStatus("No session — touch the panel in-world.", "err");
  if (guard === "no-show" && state.show !== "stopped") {
    // Mirrors CONSOLE.lsl's show_running check on PIPE_STYLE:: — refuse
    // client-side instead of sending a command the fountain will just
    // reject anyway. Based on this session's own guess of show state;
    // see the "guard" docs in commands.js for the caveat on that.
    return setStatus("⚠ Stop the show first — Pipe Style can't change while one is running.", "err");
  }
  if (busy) return;
  busy = true;
  el?.classList.add("pending");

  try {
    const finalCmd = resolveCommand(cmd, scope);
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
      ctx.fountainId = data.fountainId;
      const contextEl = document.querySelector("h1 small");
      if (contextEl) {
        contextEl.textContent = ctx.fountainId === -1 ? "(Global)" : `(Fountain #${ctx.fountainId % 10000})`;
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

// ---------------------------------------------------------------
// Dashboard pins — customize mode
// ---------------------------------------------------------------

let customizeMode = false;

/**
 * Wire a leaf button (plain button, grid item, or palette color) so it
 * either sends its command normally, or — while customize mode is on —
 * toggles as a Dashboard pin instead of firing the command. `pinId`
 * must be unique across the whole manifest; callers derive it from
 * section + control + item so two different leaves never collide.
 */
function makePinnable(b, pinId, descriptor, sendHandler) {
  b.classList.add("pinnable");
  b.dataset.pinId = pinId;
  b.classList.toggle("pinned", isPinned(pinId));

  b.onclick = () => {
    if (!customizeMode) return sendHandler();
    const nowPinned = togglePin({ id: pinId, ...descriptor });
    b.classList.toggle("pinned", nowPinned);
    renderDashboard();
  };
}

function buildControl(c, sectionId) {
  if (c.type === "button") {
    const b = document.createElement("button");
    b.className = `btn ${c.tone ?? ""}`;
    b.textContent = c.label;
    const cmd = resolve(c.cmd);
    makePinnable(
      b,
      `${sectionId}::${c.label}`,
      { label: c.label, cmd, scope: c.scope, guard: c.guard, tone: c.tone },
      () => send(cmd, b, c.scope, c.guard),
    );
    return b;
  }

  if (c.type === "grid") {
    const wrap = document.createElement("div");
    wrap.className = "grid";
    for (let i = 0; i < c.count; i++) {
      const b = document.createElement("button");
      b.className = "btn small";
      const caption = resolve(c.caption, i);
      const cmd = resolve(c.cmd, i);
      b.textContent = caption;
      makePinnable(
        b,
        `${sectionId}::${c.label}::${caption}`,
        { label: caption, cmd, scope: c.scope, guard: c.guard },
        () => send(cmd, b, c.scope, c.guard),
      );
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
    input.onchange = () => send(resolve(c.cmd, Number(input.value)), wrap, c.scope, c.guard);

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
    sel.onchange = () => send(resolve(c.cmd, sel.value), wrap, c.scope, c.guard);
    wrap.append(name, sel);
    return wrap;
  }

  if (c.type === "palette") {
    // Category pills + a color grid that swaps to match whichever
    // category is selected. The command is the color's own label text
    // (with emoji), matching the Panel's raw fl(msg) send exactly.
    const wrap = document.createElement("div");
    wrap.className = "palette";

    const cats = document.createElement("div");
    cats.className = "palette-cats";

    const colors = document.createElement("div");
    colors.className = "grid";

    function showCategory(idx) {
      const cat = c.categories[idx];
      for (const b of cats.children) {
        b.classList.toggle("active", Number(b.dataset.idx) === idx);
      }
      colors.innerHTML = "";
      for (const color of cat.colors) {
        const b = document.createElement("button");
        b.className = "btn small";
        b.textContent = color;
        makePinnable(
          b,
          `${sectionId}::palette::${color}`,
          { label: color, cmd: color, scope: c.scope },
          () => send(color, b, c.scope),
        );
        colors.append(b);
      }
    }

    c.categories.forEach((cat, idx) => {
      const b = document.createElement("button");
      b.className = "tab";
      b.dataset.idx = idx;
      b.textContent = cat.name;
      b.onclick = () => showCategory(idx);
      cats.append(b);
    });

    wrap.append(cats, colors);
    showCategory(0);
    return wrap;
  }

  return document.createTextNode("");
}

/** Renders the pinned shortcuts into the Dashboard tab's body, if it's
 * the one currently showing. Re-run after every pin/unpin so the tab
 * stays in sync even while customize mode is open on that same tab. */
function renderDashboard() {
  const body = document.querySelector("#sec-dashboard .controls");
  if (!body) return; // Dashboard isn't the active tab right now.
  body.innerHTML = "";

  const pins = getPins();
  if (pins.length === 0) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = customizeMode
      ? "Tap any control in another tab to pin it here."
      : "No pins yet — tap ✏️ Customize, then tap controls elsewhere to pin them here.";
    body.append(p);
    return;
  }

  for (const pin of pins) {
    const b = document.createElement("button");
    b.className = `btn ${pin.tone ?? ""} pinnable pinned`;
    b.textContent = pin.label;
    b.dataset.pinId = pin.id;
    b.onclick = () => {
      if (customizeMode) {
        // Only one tab's DOM exists at a time, so there's nothing on
        // "another tab" to un-badge right now — its .pinned class gets
        // recomputed fresh from localStorage next time it's opened
        // (see makePinnable's isPinned() check).
        togglePin(pin);
        renderDashboard();
        return;
      }
      send(pin.cmd, b, pin.scope, pin.guard);
    };
    body.append(b);
  }
}

/**
 * Tabbed layout: one tab per section, only the active one rendered
 * into #panel. Nothing requires scrolling past other sections to
 * reach a control — switching sections is a click, not a scroll.
 * Dashboard is a pinned pseudo-section prepended ahead of the manifest,
 * always first, so it's the default view every time the page loads —
 * exactly the tab you want live during a show.
 */
function render() {
  const tabs = $("#tabs");
  const root = $("#panel");

  function showSection(id) {
    root.innerHTML = "";

    for (const b of tabs.children) {
      b.classList.toggle("active", b.dataset.id === id);
    }

    const s = document.createElement("section");
    s.id = `sec-${id}`;

    const body = document.createElement("div");
    body.className = "controls";

    if (id === "dashboard") {
      root.append(s);
      s.append(body);
      renderDashboard();
      return;
    }

    const section = SECTIONS.find((sec) => sec.id === id) ?? SECTIONS[0];
    if (section.note) {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = section.note;
      s.append(p);
    }

    for (const c of section.controls) body.append(buildControl(c, section.id));
    s.append(body);
    root.append(s);
  }

  const dashTab = document.createElement("button");
  dashTab.className = "tab";
  dashTab.dataset.id = "dashboard";
  dashTab.textContent = "📌 Dashboard";
  dashTab.onclick = () => showSection("dashboard");
  tabs.append(dashTab);

  for (const section of SECTIONS) {
    const b = document.createElement("button");
    b.className = "tab";
    b.dataset.id = section.id;
    b.textContent = section.title;
    b.onclick = () => showSection(section.id);
    tabs.append(b);
  }

  const customizeBtn = document.createElement("button");
  customizeBtn.id = "customize-toggle";
  customizeBtn.className = "tab customize-toggle";
  customizeBtn.textContent = "✏️ Customize";
  customizeBtn.onclick = () => {
    customizeMode = !customizeMode;
    customizeBtn.textContent = customizeMode ? "✅ Done" : "✏️ Customize";
    customizeBtn.classList.toggle("active", customizeMode);
    document.body.classList.toggle("customizing", customizeMode);
    renderDashboard();
  };
  tabs.append(customizeBtn);

  // Land on Dashboard for returning users who've actually pinned
  // something (the whole point — open the link, hit the show/color
  // shortcuts, done). First-ever visit has nothing pinned yet, so
  // start on Power instead of an empty screen telling you to pin things
  // you haven't discovered exist.
  showSection(getPins().length > 0 ? "dashboard" : SECTIONS[0].id);
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
