/**
 * S.M.A.R.T web control — command manifest
 * ========================================
 *
 * THIS IS THE ONLY FILE YOU EDIT TO ADD A FEATURE.
 *
 * The relay forwards command strings verbatim, and the LSL bridge
 * injects them verbatim onto link channel 201 — the same channel
 * MASTER's communicate() uses. Neither layer understands the command
 * vocabulary. So anything the in-world Panel can send, the web UI can
 * send, by adding an entry here. No relay redeploy, no script change.
 *
 * Delimiter is `::`, matching every other S.M.A.R.T protocol.
 *
 * Control types
 * -------------
 *   button  { label, cmd }                     one-shot command
 *   grid    { label, count, cmd(i), caption(i) } N buttons from a template
 *   slider  { label, min, max, step, value, cmd(v) }
 *   select  { label, options:[{label,value}], cmd(v) }
 *
 * `cmd` is either a string or a function returning a string.
 *
 * Fountain scoping — `scope` (per control, default "fountain")
 * ---------------------------------------------------------------
 * Not every in-world command has a per-fountain variant. This mirrors
 * exactly how the Panel itself routes things (see MASTER.lsl's fc()
 * vs fl() vs bare communicate()), so a fountain-specific web session
 * sends the same bytes the physical Panel would:
 *
 *   "fountain" (default) — Panel uses fc(): global sends the command
 *                           as-is; fountain-specific inserts the ID
 *                           right after the first "::"
 *                           e.g. "ANIMATE::ON" -> "ANIMATE::1234::ON"
 *   "power"   — Panel's per-fountain power is TOGGLE-only (no explicit
 *               ON/OFF exists below the global level): global sends
 *               the command as-is; fountain-specific always sends
 *               "POWER::<id>::TOGGLE" regardless of which button
 *   "light"   — Panel uses fl(): global sends the command as-is;
 *               fountain-specific wraps as "LIGHT::<id>::<cmd>"
 *   "global"  — no per-fountain variant exists at all (Water sliders,
 *               Hide, Pipe Style all use communicate() directly in
 *               the Panel, even from inside a fountain's own menu);
 *               always sent as-is regardless of session context
 *
 * Show guard — `guard` (per control, optional)
 * ---------------------------------------------------------------
 * CONSOLE.lsl's show_running flag blocks exactly one command while a
 * DANCE show is playing: PIPE_STYLE:: (owner sees "⚠ Stop show first").
 * Nothing else — not shape selection, size, dynamic pipes, or Hide —
 * is gated in-world, so don't add this anywhere else.
 *
 *   "no-show" — refused client-side with a status message instead of
 *               being sent, mirroring the in-world rejection. Based on
 *               this session's own local state.show guess (set from
 *               commands *this* session has sent) — it can't see a
 *               show started elsewhere (another session, or in-world).
 */

export const SECTIONS = [
  {
    id: "power",
    title: "Power",
    controls: [
      // Multi-fountain sync requires explicit ON/OFF, never a toggle —
      // but a single fountain only has a toggle. See "power" scope above.
      { type: "button", label: "Fountain ON", cmd: "⛲ ON ⛲", tone: "on", scope: "power" },
      { type: "button", label: "Fountain OFF", cmd: "⛲ OFF ⛲", tone: "off", scope: "power" },
      { type: "button", label: "Reset", cmd: "🔥 RESET", tone: "warn", scope: "global" },
    ],
  },

  {
    id: "shows",
    title: "Shows",
    note: "Turn the fountain on before starting a show.",
    controls: [
      { type: "button", label: "🎆 Grand Opening", cmd: "DANCE::SHOW::grand" },
      { type: "button", label: "💕 Romantic", cmd: "DANCE::SHOW::romantic" },
      // "energetic" is the Panel's alias for Moonlight Sonata; SHOW
      // HELPER's parse_show_name() accepts both.
      { type: "button", label: "🌙 Moonlight", cmd: "DANCE::SHOW::energetic" },
      { type: "button", label: "💖 Love", cmd: "DANCE::SHOW::love" },
      { type: "button", label: "🧛 Vampire", cmd: "DANCE::SHOW::vampire" },
      { type: "button", label: "🔄 Toggle Loop", cmd: "DANCE::LOOP" },
      { type: "button", label: "⏹ Stop Show", cmd: "DANCE::SHOW::stop", tone: "off" },
      {
        type: "slider",
        label: "Music volume",
        min: 0, max: 1, step: 0.1, value: 0.5,
        format: (v) => `${Math.round(v * 100)}%`,
        cmd: (v) => `DANCE::MUSIC_VOLUME::${v}`,
      },
      { type: "button", label: "🔇 Music Stop", cmd: "DANCE::MUSIC::STOP" },
    ],
  },

  {
    id: "patterns",
    title: "Patterns",
    note: "P01–P26 are the public pattern codes; ENGINE uses 0–25 internally.",
    controls: [
      { type: "button", label: "🧩 Auto", cmd: "🧩 AUTO" },
      { type: "button", label: "🎲 Random", cmd: "🧩 RANDOM" },
      {
        type: "grid",
        label: "Pattern",
        count: 26,
        // Public P01..P26 maps to internal 0..25.
        caption: (i) => `P${String(i + 1).padStart(2, "0")}`,
        cmd: (i) => `🧩 STATIC::${i}`,
      },
    ],
  },

  {
    id: "motion",
    title: "Motion",
    controls: [
      { type: "button", label: "Animate ON", cmd: "ANIMATE::ON", tone: "on" },
      { type: "button", label: "Animate OFF", cmd: "ANIMATE::OFF", tone: "off" },
      { type: "button", label: "Neutral", cmd: "ANIMATE::NEUTRAL" },
      { type: "button", label: "Hybrid ON", cmd: "ANIMATE::HYBRID::ON" },
      { type: "button", label: "Hybrid OFF", cmd: "ANIMATE::HYBRID::OFF" },
      {
        type: "slider",
        label: "Animate speed",
        min: 0.25, max: 4, step: 0.25, value: 1,
        format: (v) => `${v}×`,
        cmd: (v) => `ANIMATE::SPEED::${v}`,
      },
      // How far the pipes lean. ANIMATE clamps to 0.1-3.0 and pushes the
      // value to both ANIMATE HELPER scripts via CONFIG::, which is what
      // actually scales patterns 21-46.
      {
        type: "slider",
        label: "Tilt intensity",
        min: 0.1, max: 3, step: 0.1, value: 1,
        format: (v) => `${v}×`,
        cmd: (v) => `ANIMATE::TILT_MULT::${v}`,
      },
      {
        type: "slider",
        label: "Cycle time",
        min: 0.5, max: 10, step: 0.5, value: 2,
        format: (v) => `${v}s`,
        cmd: (v) => `SPEED::${v}`,
      },
    ],
  },

  {
    id: "lights",
    title: "Lights",
    controls: [
      { type: "button", label: "🔴🟢🔵 RGB", cmd: "RGB", scope: "light" },
      { type: "button", label: "🌈 Rainbow", cmd: "RAINBOW", scope: "light" },
      { type: "button", label: "🎨 Multi", cmd: "MULTI", scope: "light" },
      {
        type: "grid",
        label: "Theme",
        count: 10,
        caption: (i) => ["Neon", "Xmas", "Cute", "Love", "Snow", "Sky", "Sunset", "Gold", "Forest", "Blood"][i],
        cmd: (i) => ["NEON", "XMAS", "CUTE", "LOVE", "SNOW", "SKY", "SUNSET", "GOLD", "FOREST", "BLOOD"][i],
        scope: "light",
      },
      // Palette colors: category selector + a 6-color grid for whichever
      // category is picked. Commands are the exact button text (with
      // emoji) the Panel itself sends via fl(msg) — see get_palette() in
      // MASTER HELPER.lsl for the source of truth on these 8x6 colors.
      {
        type: "palette",
        label: "Palette",
        scope: "light",
        categories: [
          { name: "🔴 Reds", colors: ["🟥 RED", "🟥 CRIMSON", "🟥 DK-RED", "🟥 INDIANRED", "🟥 ORANGERED", "🟥 CORAL"] },
          { name: "🟠 Oranges", colors: ["🟧 ORANGE", "🟧 DK-ORANGE", "🟧 SALMON", "🟧 PEACH", "🟧 AMBER", "🟧 BROWN"] },
          { name: "🟡 Yellows", colors: ["🟨 YELLOW", "🟨 GOLD", "🟨 LT-YELLOW", "🟨 GOLDENROD", "🟨 GR-YELLOW", "🟨 LEMON"] },
          { name: "🟢 Greens", colors: ["🟩 GREEN", "🟩 LIMEGREEN", "🟩 LT-GREEN", "🟩 DK-GREEN", "🟩 FT-GREEN", "🟩 EMERALD"] },
          { name: "🔵 Blues", colors: ["🟦 BLUE", "🟦 SKYBLUE", "🟦 DK-BLUE", "🟦 TEAL", "🟦 CYAN", "🟦 AZURE"] },
          { name: "💖 Pinks", colors: ["🟪 PINK", "🟪 HOTPINK", "🟪 LT-PINK", "🟪 DK-PINK", "🟪 ROSE", "🟪 FUCHSIA"] },
          { name: "🟣 Violets", colors: ["🟪 VIOLET", "🟪 PURPLE", "🟪 LAVENDER", "🟪 PLUM", "🟪 ORCHID", "🟪 INDIGO"] },
          { name: "⬜ Grays", colors: ["⬜ WHITE", "⬜ SILVER", "⬜ GRAY", "⬜ DK-GRAY", "⬜ LT-GREY", "⬜ BLACK"] },
        ],
      },
    ],
  },

  {
    id: "shapes",
    title: "Shapes",
    note: "From Global, shapes apply to every fountain in the region. Open Web UI from a specific fountain's menu to target just that one.",
    controls: [
      {
        type: "grid",
        label: "Shape",
        count: 13,
        caption: (i) => ["Line", "Circle", "Arc", "Wave", "S-Curve", "V-Form", "Fan", "Oval", "Diamond", "Horseshoe", "Teardrop", "Eye", "Heart"][i],
        cmd: (i) => `SHAPE::${["LINE", "CIRCLE", "ARC", "WAVE", "SPLINE", "V-SHAPE", "FAN", "OVAL", "DIAMOND", "HORSESHOE", "TEARDROP", "LENS", "HEART"][i]}::2.0`,
      },
      { type: "button", label: "➕ Bigger", cmd: "SHAPE::SCALE::+" },
      { type: "button", label: "➖ Smaller", cmd: "SHAPE::SCALE::-" },
      { type: "button", label: "⬆ Raise", cmd: "SHAPE::OFFSET::+" },
      { type: "button", label: "⬇ Lower", cmd: "SHAPE::OFFSET::-" },
      { type: "button", label: "↩ Restore", cmd: "SHAPE::RESTORE", tone: "warn" },
      { type: "button", label: "🔗 Dynamic ON", cmd: "SHAPE::DYNAMIC::ON" },
      { type: "button", label: "🔗 Dynamic OFF", cmd: "SHAPE::DYNAMIC::OFF" },
      { type: "button", label: "➕ Add pipe", cmd: "SHAPE::PIPES::ADD" },
      { type: "button", label: "➖ Remove pipe", cmd: "SHAPE::PIPES::REMOVE" },
    ],
  },

  {
    id: "settings",
    title: "Settings",
    note: "These apply to every fountain in the region — the Panel itself has no per-fountain variant for them. Pipe Style can't change while a show is running (from this session) — stop it first.",
    controls: [
      {
        type: "slider",
        label: "Height",
        min: 1, max: 10, step: 1, value: 5,
        format: (v) => `${v}`,
        cmd: (v) => `📊 ${v}`,
        scope: "global",
      },
      {
        type: "slider",
        label: "Spray thickness",
        min: 1, max: 9, step: 1, value: 3,
        format: (v) => `${v}`,
        cmd: (v) => `💧 SPRAY::${v}`,
        scope: "global",
      },
      { type: "button", label: "🌟 Glow", cmd: "🌟 GLOW", scope: "global" },
      { type: "button", label: "🌀 Wind", cmd: "🌀 WIND", scope: "global" },
      { type: "button", label: "🔔 Sound", cmd: "🔔 SOUND", scope: "global" },
      // Pipe Style is the one command CONSOLE.lsl actually refuses while
      // a DANCE show is running ("⚠ Stop show first"). Nothing else in
      // Shapes/Settings is gated — see `guard` docs above.
      { type: "button", label: "📏 Tall pipes", cmd: "PIPE_STYLE::TALL", scope: "global", guard: "no-show" },
      { type: "button", label: "⚫ Round pipes", cmd: "PIPE_STYLE::ROUND", scope: "global", guard: "no-show" },
      { type: "button", label: "🔲 Square pipes", cmd: "PIPE_STYLE::CUBE", scope: "global", guard: "no-show" },
      { type: "button", label: "👻 Hide pipes", cmd: "👻 HIDE::PIPES", scope: "global" },
      { type: "button", label: "👻 Hide base", cmd: "👻 HIDE::BASE", scope: "global" },
      { type: "button", label: "👻 Hide/show all", cmd: "👻 HIDE::ALL", scope: "global" },
    ],
  },
];
