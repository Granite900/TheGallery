/**
 * Central tuning file for GALLERY BELOW.
 * All gameplay-relevant numbers live here so the game can be re-balanced
 * without touching system code.
 */

export interface ZoneRect {
  x1: number;
  x2: number;
  z1: number;
  z2: number;
}

/** Ordered list of the game's macro zones, used by DreadSystem's zone curve. */
export type ZoneId =
  | 'lobby'
  | 'entryCorridor'
  | 'galleryModern'
  | 'corridorMaze'
  | 'galleryClassical'
  | 'serviceCorridor'
  | 'galleryUnlisted'
  | 'exitThreshold';

export const ZONE_ORDER: ZoneId[] = [
  'lobby',
  'entryCorridor',
  'galleryModern',
  'corridorMaze',
  'galleryClassical',
  'serviceCorridor',
  'galleryUnlisted',
  'exitThreshold',
];

export const CONFIG = {
  // Runtime perf knobs — see Lighting.ts's per-frame point-light culling.
  perf: {
    // Extra radius (metres) added past each light's own falloff `distance`
    // before it's switched invisible — generous enough that fade-in/out
    // is never noticeable.
    lightCullMargin: 6,
    // Fallback "reach" for the rare point light created with distance = 0
    // (i.e. no falloff cap of its own).
    lightCullFallbackDistance: 20,
  },

  player: {
    walkSpeed: 3.5, // m/s
    sprintMult: 1.4,
    eyeHeight: 1.7, // m
    radius: 0.32, // collision capsule radius (m)
    accel: 14, // velocity smoothing (1/s)
    bobAmplitude: 0.022,
    bobFrequency: 7.5,
  },

  corridor: {
    width: 2.2,
    height: 2.6,
  },

  gallery: {
    ceilingHeight: 4,
  },

  serviceCorridor: {
    height: 2.3,
  },

  lobby: {
    ceilingHeight: 2.8,
  },

  doorHeight: 2.1,
  wallThickness: 0.16,

  interactionDistance: 2.5,

  fov: {
    corridor: 75,
    gallery: 85,
    lerpSpeed: 2.5, // per second
  },

  /**
   * Catalog correction system — the new win mechanic.
   * Three misfiled works must be returned to their correct slots to unlock
   * the exit. Picking up a slip removes the work visually; filing it at the
   * right slot restores it there. Wrong-slot attempts cost a dread penalty
   * and a brief room flicker but do not end the run.
   */
  catalog: {
    correctionsRequired: 3,
    misfileDreadPenalty: 0.08,  // dread added on a wrong-slot attempt
    correctDreadReward: 0.05,   // dread reduced on a successful filing
    lightStabilizeSeconds: 8,   // how long lights calm after a correct filing
    /** The three misfiled works, in order. */
    works: [
      { ref: '772-M',        wrongZone: 'galleryModern',   correctZone: 'serviceCorridor' },
      { ref: '1847-B',       wrongZone: 'galleryClassical', correctZone: 'galleryUnlisted' },
      { ref: '019-UNLISTED', wrongZone: 'entryCorridor',    correctZone: 'lobby' },
    ] as { ref: string; wrongZone: string; correctZone: string }[],
  },

  /**
   * Direct-address artist notes — rare, intimate, dread-gated notes that
   * speak to the player in first person. Only revealed if dread ≥ threshold
   * at first read; below that they show as normal tier-0 institutional text.
   * Max 4 total per run.
   */
  directNotes: {
    dreadThreshold: 0.55,
    maxPerRun: 4,
  },

  /**
   * Win requirements. `requireCorrections` is a hard lock;
   * the optional values only affect the ending modal copy.
   */
  win: {
    requireCorrections: 3,
    optionalPlacardsForFlavor: 6,
    optionalDreadForFlavor: 0.75,
  },

  /** Reproducible seeds for all procedural art. */
  seeds: {
    carpet: 7,
    walls: 11,
    concrete: 23,
    entryPaintings: 100, // + index
    modernPaintings: 200,
    mazePaintings: 300,
    dejaVuPainting: 313, // used twice on purpose
    classicalPaintings: 400,
    misfiled772M: 501,      // small landscape — was anchor1 seed slot
    misfiled1847B: 502,     // portrait silhouette
    unlistedPaintings: 600,
    lobbyPainting: 700,
  },

  /**
   * Flicker configuration for the service corridor.
   * `tubeIndices` are which of the 6 tubes misbehave;
   * `rates` are mean toggles per second for each flickering light.
   */
  flicker: {
    tubeIndices: [1, 3],
    rates: [2.4, 1.6],
  },

  /**
   * Floor-plan rectangles (metres, XZ plane, y-up).
   * "North" is -Z: the player starts at z ~ 6.5 (lobby) and walks toward
   * negative z for the whole tour.
   */
  zones: {
    lobby: { x1: -5, x2: 5, z1: 0, z2: 8 } as ZoneRect,
    entryCorridor: { x1: -1.1, x2: 1.1, z1: -12, z2: 0 } as ZoneRect,
    galleryModern: { x1: -8, x2: 8, z1: -26, z2: -12 } as ZoneRect,
    mazeA: { x1: 3.9, x2: 6.1, z1: -36, z2: -26 } as ZoneRect,
    mazeB1: { x1: 3.9, x2: 14.1, z1: -38.2, z2: -36 } as ZoneRect,
    mazeB2: { x1: 11.9, x2: 14.1, z1: -44, z2: -38.2 } as ZoneRect,
    mazeC: { x1: 0.9, x2: 20.1, z1: -46.2, z2: -44 } as ZoneRect,
    galleryClassical: { x1: 20.1, x2: 38.1, z1: -51.1, z2: -39.1 } as ZoneRect,
    // A full-size copy of the lobby, dropped straight onto the mandatory path
    // right after the mirror room (galleryClassical) and before the service
    // corridor / exit — the déjà-vu "haven't I been here before?" beat. Same
    // proportions and furniture as the real lobby, translated here.
    lobbyEcho: { x1: 24, x2: 34, z1: -59.1, z2: -51.1 } as ZoneRect,
    serviceCorridor: { x1: 27.9, x2: 30.1, z1: -71.1, z2: -59.1 } as ZoneRect,
    serviceAlcove: { x1: 30.1, x2: 31.7, z1: -62, z2: -60 } as ZoneRect,
    galleryUnlisted: { x1: 19, x2: 39, z1: -87.1, z2: -71.1 } as ZoneRect,
    exitThreshold: { x1: 27, x2: 31, z1: -91.1, z2: -87.1 } as ZoneRect,
  },

  playerStart: { x: 0, z: 6.5, yaw: 0 },

  /**
   * Escalating global dread (see systems/DreadSystem.ts). No fear-meter UI —
   * this only drives audio/lighting/post-processing blends. `min`/`max` are
   * the dread band a zone eases through as the player crosses it; dread
   * never drops below the `min` of the deepest zone reached (the "floor").
   * `traverseDistance` is roughly how many metres of walking fully progress
   * the zone's band (distance is the primary driver, time is secondary).
   */
  dread: {
    riseRate: 0.02, // max dread gained per second while advancing
    decayRate: 0.004, // slow decay toward the floor while backtracking
    zoneEntryBump: 0.015, // small, smoothed nudge when reaching a new deepest zone
    noteBump: 0.01, // small nudge on first read of a note
    anchorBump: 0.03, // small nudge on cataloging an anchor work
    maxBump: 0.07, // bumps never stack past this much above the base target
    bumpDecayRate: 0.006, // bumps fade back out slowly
    timeCapSeconds: 45, // time-in-zone contribution saturates after this long
    timeWeight: 0.15, // time contributes at most this fraction vs. distance
    noteTierThresholds: [0.35, 0.65] as [number, number],

    zones: {
      lobby: { min: 0.0, max: 0.08, traverseDistance: 9 },
      entryCorridor: { min: 0.08, max: 0.18, traverseDistance: 12 },
      galleryModern: { min: 0.18, max: 0.32, traverseDistance: 20 },
      corridorMaze: { min: 0.32, max: 0.52, traverseDistance: 42 },
      galleryClassical: { min: 0.52, max: 0.66, traverseDistance: 20 },
      serviceCorridor: { min: 0.66, max: 0.8, traverseDistance: 22 },
      galleryUnlisted: { min: 0.8, max: 0.95, traverseDistance: 20 },
      exitThreshold: { min: 0.95, max: 1.0, traverseDistance: 4 },
    } as Record<ZoneId, { min: number; max: number; traverseDistance: number }>,

    // Scripted glimpses of the silhouette — exactly two per playthrough,
    // each fired by a world trigger. The figure emerges from behind a real
    // wall corner (peek animation), holds for ~1.3 s with its head turning
    // toward the player, then retreats and fades. Only vanishes early if
    // the player walks within 1.2 m.
    silhouette: {
      glimpseLifetimeSec: 2.5,
    },

    fog: {
      color: 0x4c4a3c,
      maxDensity: 0.026,
      /** Fog eases in above this dread level. */
      startLevel: 0.55,
    },

    postFx: {
      vignetteMax: 0.62,
      grainMax: 0.095,
      chromaticAberration: 0.006,
      desaturateMax: 0.22,
      sicklyTint: [1.05, 1.08, 0.88] as [number, number, number],
    },

    audio: {
      humDetuneCents: 18, // max detune applied to the HVAC hum at dread 1.0
      humGainBoost: 0.3, // hum grows up to +30% louder at dread 1.0
      staticMaxGain: 0.02, // PA static bed, always quieter than the hum
      distantEventMaxChancePerCheck: 0.12,
      flickerRateMul: 0.8, // fluorescents flicker up to 1.8x more often at dread 1.0
    },
  },

  /**
   * Intentional unlit patches the player must walk through. Each dims a
   * dedicated point light to `factor` of its normal intensity while the
   * player is inside its rect. Never fully black — ambient bleed remains.
   */
  darkSpots: {
    factor: 0.1, // within the 0.05–0.15 design range
    lightIntensity: 4,
    footstepVolumeMul: 0.7, // subtle dip, never silence
    entryCorridor: [{ x1: -1.1, x2: 1.1, z1: -8.4, z2: -6.4 }] as ZoneRect[],
    corridorMaze: [
      { x1: 3.9, x2: 6.1, z1: -32.2, z2: -30.2 },
      { x1: 11.9, x2: 14.1, z1: -42.0, z2: -40.0 },
    ] as ZoneRect[],
    serviceCorridor: [
      { x1: 27.9, x2: 30.1, z1: -61.8, z2: -59.8 },
      { x1: 27.9, x2: 30.1, z1: -69.7, z2: -66.7 }, // longest, ~3m
    ] as ZoneRect[],
    galleryUnlisted: [{ x1: 27, x2: 31, z1: -77.5, z2: -75.5 }] as ZoneRect[],
  },

  /**
   * Déjà vu: a real, physically duplicated room the player walks into and
   * back out of on foot — never teleported. It's staged inside the corridor
   * maze's self-contained west dead-end branch so the golden path (anchors,
   * doors, objectives) is never touched — see the design note at the top of
   * zones/CorridorMaze.ts. `maxRepeats` is a cap, not a target: this build
   * only wires up one repeat template, leaving room to add more later.
   */
  dejaVu: {
    maxRepeats: 2,
    /** Rotation of "one wrong detail" treatments; each repeat consumes the next. */
    wrongDetailRotation: ['empty_frame', 'panel_off', 'bench_rotated', 'swap_neighbor', 'sign_flipped'],
    echoGhostAlpha: 0.25,
    echoDisappearDistance: 2, // metres
    echoLookAtSeconds: 1,
    footstepEchoDelaySec: 1.4,
    footstepEchoVolume: 0.4,
  },

  tutorial: {
    /** "Shift — sprint" HUD hint shown once, the first time the sprint note is read. */
    sprintHintEnabled: true,
    sprintHintDurationMs: 3000,
  },
};

/** Which floor-plan rectangle(s) belong to each macro zone, for dread/zone lookups. */
export const ZONE_ID_RECTS: Record<ZoneId, ZoneRect[]> = {
  lobby: [CONFIG.zones.lobby],
  entryCorridor: [CONFIG.zones.entryCorridor],
  galleryModern: [CONFIG.zones.galleryModern],
  corridorMaze: [CONFIG.zones.mazeA, CONFIG.zones.mazeB1, CONFIG.zones.mazeB2, CONFIG.zones.mazeC],
  galleryClassical: [CONFIG.zones.galleryClassical],
  serviceCorridor: [CONFIG.zones.serviceCorridor, CONFIG.zones.serviceAlcove, CONFIG.zones.lobbyEcho],
  galleryUnlisted: [CONFIG.zones.galleryUnlisted],
  exitThreshold: [CONFIG.zones.exitThreshold],
};

export type Config = typeof CONFIG;
