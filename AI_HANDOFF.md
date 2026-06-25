# AI HANDOFF - IT HEARS YOU

## 2026-06-25 visible performance diagnostic build

User reports 4K/maximized performance drop is unchanged and previous FPS overlay did not appear.

This build intentionally adds a pure HTML marker outside the app:

- Top-left: `PERF FIX ACTIVE / 960x540 render cap / 2026-06-25 visible build`
- Bottom-left JS panel: `PERF-FIX-20260625-VISIBLE-960x540 / FPS ... / draw ... / WxH`

If the top-left marker does not appear, the user is not launching this build or browser/cache is serving an older build.

Performance changes from the original source:

- WebGL drawing buffer capped to fit within 960x540.
- Canvas visually stretches to viewport with CSS; GPU render resolution remains capped.
- Pixel ratio forced to 1.
- Antialias disabled.
- Shadows disabled globally and on meshes/lights.
- Camera far plane reduced.
- Corridor point lights reduced from 10 to 3.
- Flashlight/fill/locker lights reduced.
- Tone mapping changed to NoToneMapping.

Next debugging step if marker appears but FPS remains low:

1. Ask for the bottom-left values: FPS, draw, and resolution.
2. If resolution is above 960x540, `applyRenderCap()` is not running.
3. If draw count is very high, merge/instance static geometry.
4. If draw count is low but FPS is low, suspect CSS/compositor, browser/GPU, or hardware acceleration.
