# IT HEARS YOU

A compact browser horror prototype built with Vite + Three.js.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## 4K performance version

This build is tuned for 4K fullscreen/maximized windows.

Main performance policy:
- The visible canvas still fills the browser window.
- Internal WebGL rendering is capped at 960x540 and then upscaled.
- Hard 30 FPS limiting is not used because it caused worse stutter.
- Shadow rendering is disabled.
- Dynamic point lights are heavily reduced.
- Enemy capture/line-of-sight checks are skipped while the player is far away.
- Radar, HUD, light animation, and enemy vision debug lines are throttled or disabled.
- Fullscreen CSS gradients/shadows are simplified.

See `AI_HANDOFF.md` for implementation notes and next debugging steps.
