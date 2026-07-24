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
 */

export const SECTIONS = [
  {
    id: "power",
    title: "Power",
    controls: [
      // Multi-fountain sync requires explicit ON/OFF, never a toggle.
      { type: "button", label: "Fountain ON", cmd: "⛲ ON ⛲", tone: "on" },
      { type: "button", label: "Fountain OFF", cmd: "⛲ OFF ⛲", tone: "off" },
      { type: "button", label: "Reset", cmd: "🔥 RESET", tone: "warn" },
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
    title: "Static patterns",
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
    id: "water",
    title: "Water",
    controls: [
      {
        type: "slider",
        label: "Height",
        min: 1, max: 10, step: 1, value: 5,
        format: (v) => `${v}`,
        cmd: (v) => `📊 ${v}`,
      },
      {
        type: "slider",
        label: "Spray thickness",
        min: 1, max: 9, step: 1, value: 3,
        format: (v) => `${v}`,
        cmd: (v) => `💧 SPRAY::${v}`,
      },
      { type: "button", label: "🌟 Glow", cmd: "🌟 GLOW" },
      { type: "button", label: "🌀 Wind", cmd: "🌀 WIND" },
      { type: "button", label: "🔔 Sound", cmd: "🔔 SOUND" },
    ],
  },

  // ---------------------------------------------------------------
  // Room to grow. Uncomment or extend — nothing else has to change.
  // ---------------------------------------------------------------
  // {
  //   id: "visibility",
  //   title: "Visibility",
  //   controls: [
  //     { type: "button", label: "Hide pipes", cmd: "👻 HIDE::PIPES" },
  //     { type: "button", label: "Hide base",  cmd: "👻 HIDE::BASE" },
  //     { type: "button", label: "Hide all",   cmd: "👻 HIDE::ALL" },
  //   ],
  // },
  // {
  //   id: "shape",
  //   title: "Shape",
  //   controls: [
  //     { type: "button", label: "Scale +", cmd: "SHAPE::SCALE::+" },
  //     { type: "button", label: "Scale -", cmd: "SHAPE::SCALE::-" },
  //     { type: "button", label: "Restore", cmd: "SHAPE::RESTORE" },
  //   ],
  // },
];
