# GALLERY BELOW

A short first-person exploration game set in an impossible art museum — tight
corridors covered in framed art opening into vast, silent exhibit halls.
Fluorescent light, beige carpet, institutional quiet. No combat, no enemies.

Everything is procedural: geometry, paintings, plaques, signs, and audio are
generated at runtime — no external assets of any kind.

## How to win — Misfiled Wing

The museum catalog is wrong. **Three works are filed in the wrong rooms.**
Find each misfiled piece, press `E — Remove loan slip`, carry the slip to its
correct location, and press `E — File correctly` to return it.

Fix all three to unlock the exit.

| Ref | Wrong location | Correct location |
|---|---|---|
| 772-M | Gallery A — Modern Wing (east wall) | Staff corridor alcove hook |
| 1847-B | Gallery B — Classical Wing (near mirror) | Gallery C — empty pedestal |
| 019-UNLISTED | Entry corridor (pedestal, west side) | Lobby — hook behind reception desk |

You can only carry **one slip at a time**. Filing a slip at the wrong slot
costs a brief room flicker, a dread bump, and leaves the slip in your hand
— no hard fail, find the right slot and try again.

The exit door in Gallery C stays sealed until all three corrections are done.
When it opens: `E — Submit catalog`.

**The catalog fights back once.** If the déjà vu pocket in the maze triggers
after you've already corrected 019-UNLISTED from the entry corridor, there's
a 50% chance the piece reappears at its wrong spot and the correction must be
made again. It still counts toward the same 3/3.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL (default `http://localhost:5173`) and click to enter.

Other scripts:

```bash
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build
```

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (pointer lock on click) |
| W A S D | Walk |
| Shift | Brisk pace |
| E | Interact — read notes, remove/file loan slips, open doors |
| Esc | Release the cursor / pause |

Sprint (`Shift`) is only taught via an artist note in the entry corridor —
there's no separate control overlay.

## The route

Lobby → entry corridor → Modern Wing → corridor maze (mind the west wing) →
Classical Wing → staff corridor → Gallery C → catalog all three → exit unseals.

## Atmosphere & déjà vu

There's no fear meter, no jumpscares, and nothing ever chases you — just a
slow, constant unease that builds the deeper you go.

**Dread** is a single, invisible 0→1 value (`DreadSystem`) that rises mainly
from how far you've walked into each zone (with a small, capped bonus for
lingering), plus tiny nudges when you read a note or pick up / file a slip.
It never spikes, and it never drops when you backtrack — only a slow decay
toward the deepest zone you've reached. Everything else blends against it:

- the HVAC hum slowly detunes and grows; faint, wordless PA static and the
  odd distant thud creep in, always quieter than the hum
- fluorescents flicker a bit more often — never a strobe, never dark for
  more than ~200ms
- post-processing gains chromatic aberration, heavier grain and vignette,
  a slight desaturation, and a sickly yellow-green cast late in the tour
- a still, dark humanoid silhouette shows up in the corner of your eye
  exactly twice in the run — once at the T-junction, once at the start of
  the staff corridor — gone within about a second, sooner if you look at it

**Artist Notes** each carry three tiers of text — calm, subtly wrong, then
quietly uneasy — locked by your current dread the first time you read that
note. Four notes are **direct-address**: they break the fourth wall, speaking
intimately to the player rather than labelling a work. These only activate
if dread ≥ 0.55 at first read; below that they show institutional text.
Re-reading note #3 in the staff corridor shows a longer subtext.

**Dark spots** are short, intentionally unlit patches where a dedicated
fixture dims to ~10% while you're inside — never pitch black, just wrong.
One in the entry corridor, two in the maze, three in the staff corridor, one
in Gallery C.

**Déjà vu** is a real, physically duplicated room — not a teleport trick.
Walk all the way down the maze's "closed" west wing and its far end reuses
the exact paintings from the entry corridor, with one frame now permanently
empty. Stepping into it leaves a frozen, translucent figure standing there
and plays a delayed second footstep layer 1.4 seconds behind your own.
You leave under your own steam; the dead end's own wall turns you back.

## Win sequence

When all 3 corrections are filed the exit panel turns green and the door
opens. `E — Submit catalog` triggers a **submission form** auto-filled with
your stats (corrections, misfiles, notes read, time on floor). Two buttons:

- **Accept receipt** — good ending: the catalog is corrected.
- **Request revision** — loop ending: your changes remain but review is
  pending. The lower collection is not yet closed.

If dread reached 0.75 or above the submission form notes: *"Some annotations
were not made by staff."*

## Tech

- Vite + TypeScript, three.js (r160+), no frameworks
- Procedural canvas textures & paintings (seeded, reproducible — `src/config.ts`)
- Circle-vs-AABB collision, DOM HUD, WebAudio-synthesized sound
- Post-processing: vignette + film grain + warm grade shader (`GradeShader`)
- `CatalogSystem` tracks loan-slip state; `DreadSystem` drives all atmosphere
- Mirror wall in Gallery B uses a live render target (no external textures)

All gameplay tuning lives in `src/config.ts`. Architecture overview is at
the top of `src/game/Game.ts`.
