/**
 * Dashboard pins — quick-access shortcuts to controls scattered across
 * tabs (e.g. "start a show" in Shows + "change color" in Lights), so
 * mid-show you tap one Dashboard tab instead of hopping across several.
 *
 * Stored in localStorage, keyed per-browser (not per-session — pins
 * are a personal layout preference, not fountain state, so they
 * outlive any one session token and don't need to touch the relay).
 */

const KEY = "smart-web-pins";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(pins) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    // Storage full or unavailable (private browsing) — pins just won't
    // persist across reloads; not worth surfacing an error for this.
  }
}

export function getPins() {
  return readAll();
}

export function isPinned(id) {
  return readAll().some((p) => p.id === id);
}

/** Returns the new pinned state (true = now pinned, false = now unpinned). */
export function togglePin(descriptor) {
  const pins = readAll();
  const idx = pins.findIndex((p) => p.id === descriptor.id);
  if (idx === -1) {
    pins.push(descriptor);
    writeAll(pins);
    return true;
  }
  pins.splice(idx, 1);
  writeAll(pins);
  return false;
}
