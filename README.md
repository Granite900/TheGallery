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

## Also in this repo: Latent Image

`latent-image/` is a separate game about collecting, testing and developing
old film cameras, with an Android companion app that turns your phone into
the cameras you own. See [latent-image/README.md](latent-image/README.md).

```bash
cd latent-image && npm install && npm run app
```
