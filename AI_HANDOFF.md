# AI_HANDOFF - IT HEARS YOU

## Latest update: spawn / wall plate / trap fix

### User request implemented
- Enemy must not spawn inside walls or remain embedded in walls.
- Breaker and goal plates must be wall-mounted and must not rotate to face the camera.
- Remove periodic one-frame screen flashing.
- Keys must spawn only at positions that do not overlap objects/furniture/walls/locker/breaker/goal.
- SONAR periodically places floor sound traps.

### Technical notes
- `PERF_BUILD_ID` changed to `SPAWN-PLATE-TRAP-FIX-20260626`.
- Added `hasColliderOverlap`, `isSafeSpawnPoint`, and `findSafeNode` helpers.
- Enemy spawn now uses a safe walkable node far from the player, exit, and breaker.
- Enemy update includes safety recovery: if the enemy is found inside a collider, it snaps back to nearest safe nav node.
- Goal counter was changed from `THREE.Sprite` to fixed `THREE.Mesh` plane so it stays attached to the wall.
- Added fixed wall-mounted plates for `出口` and `ブレーカー`.
- Flashlight random flicker was removed.
- Danger flash during normal play was changed to static low opacity instead of sine flicker.
- Key spawning now tries multiple offsets per walkable cell and rejects positions near colliders, lockers, breaker, exit, or other keys.
- Added `noiseTraps` system:
  - SONAR drops traps periodically.
  - Trap appears as a small floor ring.
  - If player steps on it, it plays a sound, emits a world sound event, and SONAR investigates.
  - Traps expire after a while and max active trap count is limited.

### Build note
- `npm run build` was not executed in this sandbox because dependencies are not installed here (`vite: not found`).
- GitHub Actions should install via public npm using the included workflow.

## 2026-06-26 Trap Visibility / Forced Response / Roar Shake
- Noise traps are now invisible while the breaker is OFF (`trap.mesh.visible = state.breakerOn`).
- Triggered traps force SONAR to respond regardless of distance via `forceTrapResponse`.
- Trap response interrupts pass-by/pause/lookaround and sends SONAR to the trap at max speed (`TRAP_RUSH`, speed 6.4).
- SONAR roar no longer shows toast/log text.
- SONAR roar now applies screen shake; stronger/longer shake when the player is knocked down.
- Build was not completed in this environment due npm/network timeout. GitHub Actions should build after package-lock/deploy registry fixes.


## 2026-06-26 HP / Roar / Trap / Healing Update
- Roar now shakes the screen for 3 seconds.
- If the player is inside roar range, movement is locked for 5 seconds.
- Added player HP system: max HP 100.
- Noise traps deal 40 damage and trigger a red screen flash.
- Random healing items spawn every 60-120 seconds.
- Healing items restore 30 HP and trigger a green screen flash.
- Healing items avoid walls, colliders, keys, breaker, exit, and active traps.

## Gameplay Balance Update - 2026-06-26
- HP number text removed; thick HP bar only.
- Healing item pickup no longer shows toast/log.
- Walking sound radius changed from 2 to 3 (x1.5).
- Walking sound alert gain slowed.
- Running sound alert gain increased.
- Breaker is forced onto the breaker-room wall.
- One healing item is guaranteed at game start/respawn.
- Healing items cannot be consumed while HP is full.
- Roar knockdown emits a small stumble sound with radius 6, equal to x2 walking radius, causing a small alert increase.

## 2026-06-26 Mobile / Coin / Shop Update

Implemented:
- Mobile text selection, long-press menu, pinch zoom, and double-tap zoom are disabled.
- Mobile run/light/action buttons are larger and use pointerdown handlers so they can be used while the movement pad is active.
- Base flashlight range is reduced by half.
- Coins spawn every 30 seconds at safe random map positions.
- A single shop is generated at a safe random map position.
- Shop purchases:
  - Heal: 1 coin, cannot heal at full HP.
  - Noise half: 3 coins, halves player movement noise strength and radius.
  - Breaker duration x2: 4 coins, doubles breaker ON duration.
  - Light range x2: 5 coins, doubles flashlight cone and reach from the reduced base range.
- Coin count is displayed in the HUD.

Build:
- `node node_modules/vite/bin/vite.js build` succeeded locally before node_modules/package-lock cleanup.
- package-lock.json was removed to avoid internal registry URLs in GitHub Actions.

## Mobile / Coin / Shop Fix

- Fixed coin pickup freeze by adding collected guard
- Removed collected coins from scene and coins array immediately
- Added coin pickup sound
- Coin spawn capped at 10 active coins
- Coin spawn runs every 30 seconds; if 10 active coins already exist, no extra coin is added
- Updated shop prices:
  - Heal: 3 coins
  - Noise reduction: 20 coins
  - Breaker duration x2: 20 coins
  - Flashlight range x2: 10 coins
- Purchase failures now show a coin shortage message and do not spend coins
- Heal purchase is blocked when HP is full
- Mobile UI hides PC key labels
- Mobile HUD/minimap scaled up
- Mobile safe area margin added
- Internal render cap changed to 1920x1080

### Notes
- Coin pickup uses `coin.collected = true` before changing the coin count, then removes the coin via `removeCoinAt()`.
- Coin items are not physical colliders; the active pickup target list is `coinItems`, and collected coins are removed from that array immediately.
- Mobile PC-key removal is handled in `updateInteraction()` with `mobileInput.active` and in CSS by hiding `.controls` on touch landscape.

## 2026-06-28 Realism / Mobile UI / Performance Pass

- Added dynamic internal resolution tiers (`1.0`, `0.85`, `0.7`, `0.55`) that step down when FPS is low and recover gradually when FPS is stable.
- Kept the hard render cap at 1920x1080 and kept `renderer.setPixelRatio(1)` / antialias disabled.
- SONAR model was made more detailed with jaw, spine, rib, and asymmetrical body details while staying low-poly.
- SONAR roar now uses deeper procedural growl layers and forces the enemy to stop for the full roar duration.
- Key pickup now plays a lightweight procedural item pickup sound.
- Running now slowly increases detection even outside the normal direct detection range.
- Map random carving was increased for less predictable school layouts.
- Lockers are now rejected near room entrances/connectors.
- Room fixtures were expanded into recognizable 3D desks, chairs, shelves, room-specific props, and textured materials.
- Mobile interaction prompt no longer duplicates the PC prompt; mobile uses only the centered action button.
- Mobile HUD/minimap layout was separated to avoid alert gauge overlap with the minimap in landscape.

### Notes
- The provided ChatGPT image share links were not directly readable in this environment, so the enemy/map pass follows the existing SONAR + abandoned school art direction instead of exact image matching.
- Dynamic resolution is adjusted in the FPS reporting block; performance panel shows the active scale.

## 2026-06-28 Attachment Reference / Mobile Portrait Landscape Pass

- Added mobile portrait-landscape mode:
  - On touch devices held vertically, the app is rotated internally to a landscape layout.
  - The rotate-device blocking overlay is disabled.
  - `applyRenderCap()` swaps logical render width/height on portrait phones so camera aspect and internal resolution match the rotated game view.
- Adjusted mobile HUD/radar layout so the run/light buttons do not overlap the minimap.
- Updated SONAR model based on the attached reference sheets:
  - Larger thin ears with red inner vein details.
  - Dark eyeless face plate.
  - Longer vertical red mouth/slit with tooth-like details.
  - Longer arms, longer claws, digitigrade feet/toes, more exposed spine/rib detail.
- Updated school map detail based on the attached reference:
  - Added night windows, sink rows, fire extinguishers, and more recognizable school props while keeping the additions low-poly.
- Tightened capture logic:
  - Full detection no longer triggers capture by itself.
  - Capture now requires near-contact distance (`CAPTURE_DISTANCE = 0.55`) and line of sight.

### Notes
- The portrait mode uses CSS transform rotation plus the existing touch controls; any future UI using raw viewport coordinates should be checked against `body.mobile-portrait-landscape`.

## 2026-06-28 Mobile Portrait / Breaker / SONAR Quality Follow-up

- Reduced minimap size specifically for `body.mobile-portrait-landscape`.
- Added larger portrait safe margins and shrank the rotated game viewport with `svh`/safe-area units so browser URL bars and notches are less likely to clip right-side controls.
- Removed corridor window placement from `addCorridorDetails()`; night windows remain only as room-side props.
- Breaker OFF visual is now forced red on the light, panel, and switch.
- Capture cutscene, game over, and respawn now force breaker OFF visual state.
- SONAR material quality was raised with procedural wet skin/vein textures, darker face material, glossier red mouth/ear materials, and higher segment counts on major body parts.
- SONAR shape detail was increased with chest/pelvis plates, more ribs, ear rims/veins, elbows/knees, longer claws, and toes.

### Notes
- No external GLB/texture files were introduced. The higher-quality SONAR pass remains procedural Three.js geometry/materials for GitHub Pages compatibility.

## 2026-06-28 Portrait Input / Placement / SONAR Shape Pass

- Fixed mobile portrait-landscape input basis:
  - Touch joystick deltas are converted from portrait device coordinates to landscape game coordinates.
  - Camera swipe deltas use the same conversion, so swipe/move controls behave like horizontal landscape play while the phone is held vertically.
- Locker placement is now rejected unless the target side actually borders a wall/non-walkable cell.
- Removed central corridor locker candidates.
- Cover object positions are nudged toward room edges instead of sitting near room/corridor centerlines.
- SONAR silhouette was changed more aggressively toward the reference three-view:
  - Added large custom membrane-shaped ears, beyond the previous flattened sphere ears.
  - Added raised back vertebrae, scapula plates, and rear tendons.
  - Kept the procedural geometry/material approach; still no external model file dependency.

## 2026-06-28 SONAR PS3-Style Quality Attempt

- Raised SONAR material fidelity:
  - Added procedural normal maps for wet skin, ears, and mouth.
  - Lowered roughness on skin/mouth for wet specular highlights.
  - Added more vein/noise texture detail.
- Reduced primitive look by applying deterministic organic vertex deformation to generated geometries.
- Added a custom vertical chest/mouth maw with curved ShapeGeometry, raised tube rims, needle teeth, and red internal glow.
- Increased SONAR base scale and fixed animation so it no longer shrinks the Y scale back to the older low-poly size.

### Notes
- This is still not a true authored PS3-era GLB sculpt. A real “three-view exact” model requires an external modeled/rigged asset pipeline, but this pass pushes the in-code model further toward that visual without adding external dependencies.

## 2026-06-28 External SONAR OBJ / Moving Capture Fix

- Added external model asset generation:
  - `scripts/generate-sonar-obj.mjs` generates `public/models/sonar.obj`.
  - `src/main.js` imports `OBJLoader` and loads `./models/sonar.obj` at runtime.
  - On successful OBJ load, procedural in-code SONAR meshes are hidden and used only as fallback.
- External OBJ follows the SONAR three-view concept with large membrane ears, eyeless head, vertical maw, long claws, digitigrade legs, exposed spine/ribs/tendons.
- Existing procedural high-fidelity materials are assigned to OBJ parts by object name, so external geometry uses wet skin/ear/mouth materials.
- Capture logic now uses `MOVING_CAPTURE_DISTANCE = 1.18` when the player is moving/noisy, while stationary capture remains `CAPTURE_DISTANCE = 0.55`.

### Notes
- Regenerate the OBJ with `node scripts/generate-sonar-obj.mjs` if the model generator changes.

## 2026-06-28 Mobile Orientation Flicker / Goal Tap Lock Fix

- Portrait-landscape viewport detection now uses `matchMedia('(orientation: portrait)')` plus `visualViewport` long/short sides instead of raw `innerWidth > innerHeight`.
- Render-cap/layout updates are debounced on mobile resize/URL-bar changes, and orientationchange waits briefly before applying.
- Added `stopMobileGameplayInput()` to clear move stick state, running toggle, camera swipe pointer, and mobile action visibility.
- `endGame()` and HP-zero game over now call `stopMobileGameplayInput()` so tapping the goal on mobile does not leave stale touch input/UI state.

## 2026-06-28 External SONAR OBJ Fix / Texture Assignment

- Fixed generated OBJ face indices:
  - Each object now offsets face indices by the total vertex count already written.
  - Previous OBJ could collapse later parts into the first vertices, making the enemy look like a stretched rod.
- Regenerated `public/models/sonar.obj` with wider torso/chest/head, larger ears, and thicker limbs so the silhouette is closer to the three-view reference.
- External OBJ continues to receive procedural CanvasTexture/normalMap materials in `loadExternalSonarModel()`:
  - `sonarSkinMat` for skin parts
  - `sonarEarMat` for ear parts
  - `sonarMouthMat` for mouth/rib/spine/tendon parts
  - `paperMat` for claws/teeth/toes

### Notes
- No separate PNG texture files were added; textures are generated in `src/main.js` and assigned to the external OBJ by mesh name.
