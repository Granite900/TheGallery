# Latent Image

Collect, test and develop old film cameras. A desktop game (Babylon.js +
Electron) with an Android companion app that turns your phone into the
cameras from your collection.

You inherit Ruth's flat above the harbour: her darkroom, her display cabinet
and an Olympus Trip 35. Hunt the Saturday market and estate sales for real
cameras (Canonet QL17, Yashica Electro 35, Leica M3, Yashica Mat-124G,
Rolleiflex 2.8F, Pentax K1000, Canon AE-1 Program, Nikon FM2n, Spotmatic,
Super 8…), inspect them before you haggle, shoot test rolls and write honest
reports. Every unit has hidden faults (light seals, lazy shutters, capping,
haze, fungus, lying meters, misaligned rangefinders) that only your negatives
reveal.

## Run it

```bash
npm install
npm run app        # build + open the desktop app (Electron)
npm run dev        # browser version at http://localhost:5173 (no phone link)
npm test           # simulation unit tests
```

F11 toggles fullscreen. Settings (Esc in the studio) has graphics quality,
assistance level (Guided / Standard / Purist) and roll length.

## What is simulated

- **Exposure:** EV = log2(N²/t), real scene EVs per light (sun 15, overcast
  12, dusk ~9.5…), reflected meters that are fooled by bright skies, the
  Sekonic incident meter, reciprocity failure, sunny 16. Shutter speed
  errors, capping and meter offsets come from the individual unit.
- **Optics:** each frame is rendered through the lens: depth of field from
  focal length, f-stop and focus distance; per-lens character (Helios swirl,
  cat's-eye bokeh, wide-open softness, vignetting); haze veil; hand shake
  from slow shutter speeds.
- **Film:** real stocks (Tri-X, HP5 Plus, FP4 Plus, Portra 400, Gold 200,
  Ektar, Provia, Velvia, Tri-X reversal Super 8, expired Verichrome Pan) with
  characteristic curves, latitude and grain.
- **Darkroom:** load the reel in total darkness, datasheet times (D-76,
  HC-110, Rodinal) with time/temperature compensation and push/pull,
  agitation, stop, fixer clearing time and exhaustion, wash, wetting agent;
  C-41 at 37.8 °C with colour crossover when it drifts; E-6; B&W reversal
  with re-exposure. Mistakes show up on the negatives (fog, uneven
  development, bromide drag, surge marks, milky under-fixing, drying marks,
  kinks).
- **Printing:** enlarger with grain focuser, test strips, paper grades 0–5,
  dodging/burning, and a print that comes up in the developer tray.

## Phone camera (Android companion)

The **Latent Image Camera** app makes your phone one of the cameras you own in
the game, with its viewfinder (rangefinder frame lines, mirror-reversed TLR
ground glass, SLR split prism), its dials, its wind lever and its faults. The
light is real: the phone's own exposure (shutter time and ISO) tells the app
how bright the scene is, and the exposure your chosen settings give is
worked out from that. If the phone does not report it, you pick the light
(sunny-16 style). You never see the pictures on the phone. The roll goes to
the desktop darkroom and you develop it like any other.

1. On the PC: Settings → **Phone camera** (or Go out → The real world). A QR
   code appears.
2. On the phone (same Wi-Fi): open the app → **Pair** → scan the code.
3. Pick a camera from your bag, load film from your fridge, shoot, wind on.
4. **Send** the roll. It appears in the darkroom on the PC.

If the phone cannot connect, allow Latent Image through the PC firewall for
private networks (TCP port 47820).

### Getting the APK

GitHub Actions builds it on every push that touches `latent-image/`
(`.github/workflows/latent-image-android.yml`). Open the latest
**Latent Image Camera APK** run, download the `latent-image-camera-apk`
artifact, unzip it, and install `latent-image-camera.apk` on the phone
(allow installs from unknown sources when Android asks).

To build it locally you need the Android SDK and JDK 21:

```bash
npm run android:sync
cd android && ./gradlew assembleDebug
```

Focus and depth of field cannot be measured from a phone photo, so on real
photos they are not simulated; exposure, lens vignetting/softness/haze,
light leaks and shutter faults are.

## Layout

```
electron/        desktop shell, phone-link server (LAN), preload bridge
src/sim/         pure simulation (cameras, exposure, chemistry, market, career, phone protocol)
src/render/      PBR materials, procedural textures & environments, GPU film pipeline
src/models/      procedural cameras, lenses, props and locations
src/scenes/      studio, market, shooting locations, darkroom
src/ui/          paper / label-tape interface
src/phone/       Android companion (wrapped by Capacitor in android/)
tests/           vitest
```
