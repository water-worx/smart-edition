/**
 * Dashboard pins — whole SECTION cards pinned to one place, in a
 * user-chosen order, so a live-show workflow (start a show, change
 * color, adjust settings) doesn't mean hopping across tabs.
 *
 * Stored in localStorage as an ordered array of section ids, keyed
 * per-browser (not per-session — this is a layout preference, not
 * fountain state, so it outlives any one session token).
 */

const KEY = "smart-web-pinned-sections";
const OLD_KEY = "smart-web-pins"; // pre-redesign: individual item pins

/**
 * One-time courtesy migration from the old per-item pin system: seed
 * the new pinned-*sections* list with whichever sections any old pin
 * belonged to, so switching to whole-card pinning doesn't reset
 * someone back to a blank Dashboard. The old key is left alone rather
 * than deleted — harmless dead data, no reason to risk touching it.
 */
function migrateFromItemPins() {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return [];
    const oldPins = JSON.parse(raw);
    const sections = [...new Set(oldPins.map((p) => p.section).filter(Boolean))];
    if (sections.length) writeAll(sections);
    return sections;
  } catch {
    return [];
  }
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    return migrateFromItemPins();
  } catch {
    return [];
  }
}

function writeAll(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage full or unavailable (private browsing) — order just
    // won't persist across reloads; not worth surfacing an error.
  }
}

export function getPinnedSections() {
  return readAll();
}

export function isSectionPinned(id) {
  return readAll().includes(id);
}

/** Returns the new pinned state (true = now pinned, false = now unpinned). */
export function toggleSectionPin(id) {
  const ids = readAll();
  const idx = ids.indexOf(id);
  if (idx === -1) {
    ids.push(id);
    writeAll(ids);
    return true;
  }
  ids.splice(idx, 1);
  writeAll(ids);
  return false;
}

export function reorderPinnedSections(newOrder) {
  writeAll(newOrder);
}
