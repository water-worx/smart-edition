/**
 * Tiny shared mutable state between app.js and commands.js.
 *
 * fountainId: -1 for a global session, or the fountain's numeric ID
 * for a fountain-specific one. Set once by refreshState() in app.js
 * after the relay resolves the session; read by resolveCommand() when
 * deciding how (or whether) to scope a command to that fountain.
 */
export const ctx = { fountainId: -1 };
