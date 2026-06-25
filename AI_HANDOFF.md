# AI_HANDOFF - IT HEARS YOU

## 2026-06-25 performance follow-up

### User-reported issue
- 4K display + maximized window still causes heavy frame drops.
- Previous builds did not visibly show the FPS/draw overlay, so the user could not confirm that the intended build was running.

### Important finding
Previous fixes mainly capped the WebGL canvas render size, but the rest of the app (`#app`, HUD, full-screen CSS overlays, radar canvas, vignette, danger flash, title screens) still used full viewport-sized fixed positioning. On a 4K maximized window, that can still force large CSS/compositor work even if WebGL itself is reduced.

### Current fix in this package
Implemented a true virtual 720p screen:
- `src/main.js`
  - Added `VIRTUAL_WIDTH = 1280` and `VIRTUAL_HEIGHT = 720`.
  - Camera aspect is fixed to 16:9 virtual resolution.
  - WebGL drawing buffer is fixed to `1280x720` with `pixelRatio = 1`.
  - `resizeVirtualScreen()` only updates CSS scale via `--game-scale`; it does **not** resize WebGL to the physical window.
  - Shadows and antialiasing are disabled.
  - HUD/radar/light/vision/interaction updates are throttled.
  - Enemy line-of-sight/capture checks are gated by distance.
  - Added always-visible diagnostic panel text: `FPS ... / draw ... / 1280x720 / TRUE 720P`.
- `src/style.css`
  - `#app` is fixed at `1280px x 720px` and scaled with CSS transform.
  - `#game` is fixed at `1280px x 720px`.
  - Full-screen UI layers were changed from viewport `position: fixed` to `position: absolute` inside the virtual 720p app where appropriate.
  - Added `#perf-panel` style with high z-index.

### Verification
- `npm run build` succeeds.
- The generated `dist/` folder is included in this ZIP.

### How to confirm the correct build is running
When launched, the bottom-left overlay must show:
`FPS -- / draw -- / 1280x720 TRUE 720P`
then update to:
`FPS <number> / draw <number> / 1280x720 / TRUE 720P`

If this text is not visible, the user is not running this build or old cached/deployed files are still being served.

### Next debugging steps if still heavy
Ask for the bottom-left overlay values:
- FPS
- draw
- resolution text

If the resolution is not `1280x720`, the deployment is stale or not using this package.
If draw count is very high, inspect scene object/material counts next.
If draw count is normal but FPS low, inspect CSS/compositor and audio scheduling next.
