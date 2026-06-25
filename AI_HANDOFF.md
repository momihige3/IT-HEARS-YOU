# AI HANDOFF - IT HEARS YOU

## 2026-06-25 performance follow-up

User report:
- 4K display fullscreen/maximized is still heavy.
- Previous fixes did not improve it; one FPS cap version made stutter worse.
- User suspected enemy capture checks might be running while far away.

Important conclusion:
- Distance-gating enemy capture/LOS is valid and remains included.
- However, unchanged heaviness suggests the main bottleneck is likely GPU fragment/light/compositing load rather than only AI distance checks.
- This version therefore avoids FPS capping and reduces light/HUD/overlay work more aggressively.

Current changes in this handoff version:
1. Internal WebGL render cap lowered from 1280x720 to 960x540.
   - Display still fills the window by CSS upscaling.
   - Do not use a fixed 30 FPS cap; it caused worse perceived stutter.
2. WebGL renderer changed to cheaper settings:
   - antialias: false
   - precision: mediump
   - NoToneMapping
   - shadows disabled
3. Dynamic light budget reduced:
   - corridor PointLights limited to 2
   - key PointLights disabled by default
   - exit PointLight disabled by default
   - flashlight remains available because it is core gameplay feedback
4. Enemy direct detection/capture remains distance-gated:
   - far player skips LOS/capture/cover detection checks
   - close capture LOS only runs when within capture distance
5. Enemy vision helper lines are disabled by default.
   - They are useful for debugging but not required in normal play.
6. HUD updates are throttled/cached:
   - DOM changes only happen when rounded values change
   - HUD refresh target: 10Hz
7. Light/key animation is throttled:
   - updateLight target: 15Hz
8. Radar/minimap is throttled:
   - 8Hz, not every frame
9. Expensive fullscreen CSS effects are simplified:
   - radial gradients/shadows/animations reduced

Files changed:
- src/main.js
- src/style.css
- README.md
- AI_HANDOFF.md

Build verification:
- `npm install --no-audit --no-fund`
- `npm run build`
- Build succeeded.
- Vite still reports a >500kB JS chunk warning because Three.js is bundled. This is not a runtime error.

Recommended next debugging if user still reports heaviness:
1. Add an in-game performance overlay showing:
   - FPS
   - renderer.info.render.calls
   - renderer.info.render.triangles
   - renderer.domElement.width/height
   - number of active lights
2. Add a settings/debug toggle to switch among:
   - 1280x720 quality
   - 960x540 performance
   - 640x360 potato mode
   - radar off
   - flashlight off
3. If even 640x360 is heavy, suspect browser/GPU driver/compositing or CSS overlay cost, not scene resolution.
4. If FPS is high but motion feels bad, inspect dt spikes and pointer-lock/mouse event handling.

Do not reintroduce a hard 30 FPS limiter unless the user explicitly asks. It made perceived stutter worse.
