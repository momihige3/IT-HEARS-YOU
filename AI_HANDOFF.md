# AI HANDOFF - IT HEARS YOU

## 2026-06-25 Deep performance pass

User report: 4K fullscreen/maximized play remains heavy even after render-resolution cap, light reduction, enemy-distance gating, and HUD/radar throttling.

### Important conclusion
The previous fixes likely missed the biggest bottleneck: many separate static `BoxGeometry` meshes were rendered as individual WebGL draw calls. In a large maze, floors, ceilings, walls, covers, and exit props create many separate scene meshes. Lowering internal resolution alone does not solve CPU/driver overhead from many draw calls.

### Changes made in this pass
- Added `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`.
- Added `mergeStaticSceneBoxes()` after static maze/cover/exit creation and before dynamic key/enemy creation.
  - It scans top-level static `BoxGeometry` meshes in `scene`.
  - It clones and transforms their geometry into world space.
  - It groups them by material and merges them into a few large meshes.
  - It removes the original separate box meshes.
  - Existing `colliders` data is kept unchanged, so movement/LOS behavior should remain intact.
- Reduced repeated per-frame UI work:
  - Cached `#noise-bar`, `#noise-value`, `#prompt`, and `#mobile-action` DOM references.
  - HUD updates throttled to `PERFORMANCE.hudHz`.
  - Interaction prompt updates throttled to `PERFORMANCE.interactionHz`.
  - Light/key animation updates throttled to `PERFORMANCE.lightHz`.
  - Radar updates reduced to `PERFORMANCE.radarHz`.
  - Enemy vision line updates reduced to `PERFORMANCE.visionHz`.
- Removed per-radar-frame vector allocation by reusing `radarForwardTemp`.
- Removed per-hidden-frame locker vector allocation by reusing `lockerInsideTemp`.
- Added on-screen performance panel at bottom-right:
  - FPS
  - WebGL draw calls
  - triangles
  - drawing buffer size

### Expected result
If the bottleneck was draw-call overhead, `draw` in the performance panel should be much lower than before. If FPS is still low while `draw` is low and drawing buffer is capped, the next suspect is browser/GPU/driver, audio, or CSS compositing rather than maze object count.

### Build status
`npm run build` completed successfully.

### Notes for next AI
Do not re-add a hard 30 FPS limiter. The user reported that made the stutter worse. Prefer actual bottleneck reduction and diagnostics.
