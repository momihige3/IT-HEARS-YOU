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

## 2026-06-28 SONAR Texture / Mobile Portrait / Capture / Search Fix

- External SONAR now uses the existing PNG texture files:
  - `sonar_skin_wet.png`
  - `sonar_ear_red.png`
  - `sonar_mouth_dark.png`
- Added runtime UV generation for loaded OBJ meshes so PNG textures are visible even when the OBJ has no `vt` UV data.
- Lightened SONAR material color multipliers and increased normal intensity so the texture does not collapse into flat black.
- Mobile portrait landscape mode now uses stable `screen.width/height` for the virtual landscape viewport and writes `--game-landscape-w/h` CSS vars to reduce URL-bar/knockdown resize flicker.
- Portrait CSS now sizes the rotated game shell from those stable vars instead of recalculating only from `svh/svw`.
- Moving capture distance increased to `1.55`; running during HUNTING can trigger near-contact capture at `0.88` without requiring perfect overlap.
- High-alert blocked chase no longer immediately clears alert/pass-by. It switches to SEARCHING, preserves detection, and routes to cover near the player.
- SEARCHING look-around is now continuous 360-degree sweep instead of a narrow side-to-side oscillation.

## 2026-06-28 Blender SONAR Model Implementation

- Created a Blender-authored SONAR review model with `scripts/create-sonar-blender-model.py`.
- Blender review outputs live under `model_review/sonar_blender_v1/`:
  - `sonar_blender_v1.blend`
  - `sonar_blender_v1.glb`
  - `preview_front.png`, `preview_side.png`, `preview_back.png`
- Copied the approved runtime GLB candidate to `public/models/sonar_blender_v1.glb`.
- `src/main.js` now imports `GLTFLoader` and loads `./models/sonar_blender_v1.glb` first.
- GLB runtime scale is set to `0.49` with `position.y = 0.49` so the existing enemy group scale keeps the visible height near the intended ~2.4m.
- The previous OBJ loader remains as fallback if the GLB fails to load; procedural SONAR remains the final fallback.
- Game behavior/collision is still driven by the existing enemy group/AI logic; only the visible model asset was replaced.

## 2026-06-28 Coin Spawn / Pounce / Wall Sound AI Fix

- Coin spawn interval changed from 30 seconds to 10 seconds while keeping the max active coin cap at 10.
- Movement alert gain changed:
  - Running out-of-range passive detection gain doubled from `1.25` to `2.5`.
  - Walking now slowly raises detection with `0.38` gain.
- Added `setEnemyDestinationNear()` so the enemy can path to a reachable node near a target point instead of only the closest exact node.
- Wall-blocked sound response now checks line of sight from enemy to sound position:
  - If blocked, enemy paths to a nearby reachable node around the sound source.
  - Blocked sound investigation speed is raised and repath is kept alive for 8 seconds.
- Added pounce logic:
  - Tracks `lastSawPlayerAt` and `lastSeenPlayerPosition`.
  - If player was visible within the last 5 seconds, alert is HUNTING/detection > 70, LoS is currently blocked, and distance is within 2m, enemy enters `POUNCING`.
  - Pounce lasts 1 second, arcs toward the last seen player point, and captures if the player is still within near-contact range.
- Existing direct capture logic remains in place for clear line-of-sight contact.

## 2026-06-28 Distant Noise / Pounce Capture Follow-up

- Fixed out-of-hearing-range player noise being ignored completely:
  - Distant footsteps now add a small detection increase with distance falloff.
  - Distant sounds still do not force pathing unless they are inside hearing range, so the enemy should not instantly know the exact location from far away.
- Increased passive movement alert gain so running/walking outside detection range can visibly raise alert instead of being canceled by calm-down decay:
  - Running gain: `8.5`
  - Walking gain: `5.0`
- Pounce target now uses the player's current position at trigger time, not only the last remembered sight point.
- Pounce capture radius widened and a landing capture check was added, so close blocked chases should no longer fail just because the player is moving or hugging an obstacle.
- Running close-capture distance was raised to `1.25` while stationary direct capture remains unchanged.

## 2026-06-28 Alert Balance / Persistent Coins / Pickup Placement

- Reduced out-of-detection passive alert buildup:
  - Distant sound detection gain is now roughly one fifth of the previous follow-up value.
  - Passive walking/running alert gain was reduced to `1.0` / `1.7`.
- If the enemy remains in a blocked wall/object chase for more than 10 seconds without capturing, it clears active chase, drops detection to the current key-based floor, and passes by.
- Coins are now persisted in `localStorage` under `it-hears-you-coins`.
  - Coin pickups save immediately.
  - Shop spending saves immediately.
  - Respawn/game over/clear/reload no longer resets the coin wallet.
- Heal item spawning now strongly favors the nurse room when valid spawn points exist there.
- Key spawn placement now uses stricter collider/cover spacing and avoids unsafe fallback positions that could overlap furniture or objects.
- Key pickups now raise the minimum detection floor by 10% per key, up to 50% at five keys.
- High alert/search memory now makes enemy roaming and cover search choose from a wider map-wide pool instead of staying mostly near the last local point.

## 2026-06-28 Fire Extinguisher / Slow Alert Buildup / Chase Give-up Fix

- Removed corridor fire extinguisher generation entirely.
- Restored slow continuous alert buildup while the player is moving outside direct detection:
  - Walking gain is now `4.75`.
  - Running gain is now `5.25`.
  - This is intended to slightly beat natural calm-down without returning to the previous rapid buildup.
- Fixed blocked chase give-up timer:
  - It no longer requires `enemyData.mode === 'HUNTING'` only.
  - The timer now continues through HUNTING/SEARCHING/INVESTIGATING while the player was recently seen or detection remains high and line of sight is blocked.
  - This prevents the 10-second give-up timer from resetting immediately after the AI switches from HUNTING to SEARCHING.

## 2026-06-28 Wall Pin Capture / Debug UI Removal

- Added wall-pin close capture handling:
  - When the enemy reaches within `2.05m` of the player during high alert/recent sight and no obstacle is between them, the enemy stops, faces the player, and captures.
  - This is intended to catch wall-edge cases where the player is pinned against a wall but the enemy cannot fully overlap the player.
  - Capture still requires line of sight, so walls/objects between enemy and player should block it.
- Removed visible debug UI:
  - Removed the startup build marker from `index.html`.
  - Removed the FPS/draw/render `perf-panel` from `index.html`.
  - Removed related CSS.
  - Internal FPS sampling remains because dynamic resolution still depends on it.

## 2026-06-28 Super Alert / Wall Hug AI

- Added `SUPER_ALERT` state displayed as `超警戒`.
  - If detection exceeds 70% while the player is not currently visible, the enemy enters map-wide SEARCHING instead of immediate HUNTING.
  - Super alert search lasts at least 30 seconds and repeatedly picks wider/farther search routes.
  - If the player becomes visible while detection is above 70%, the enemy switches to normal HUNTING.
- Enemy wall clearance was reduced:
  - `canEnemyMoveTo()` collider padding changed from `0.34` to `0.16`.
  - Enemy safety snap check now uses `0.18` padding.
- Added wall-slide movement when enemy collides:
  - On blocked forward movement, the AI tries left/right slide vectors along the obstacle before clearing the path.
  - If sliding fails, existing repath/pass-by/super-alert route recovery remains as fallback.

## 2026-06-28 Smarter Navigation / Shop Purchased Visual

- Improved enemy navigation when the player is behind walls:
  - `setEnemyDestination()` / `setEnemyDestinationNear()` now start from `nearestReachableNode()` instead of a purely nearest node.
  - This avoids selecting a wall-separated nav node as the enemy's current node and reduces direct wall ramming.
- Added stuck recovery:
  - Enemy tracks progress toward the current path target.
  - If movement does not meaningfully improve for a short time, `recoverEnemyNavigation()` snaps to a nearby reachable node when safe and repaths.
  - Recovery prefers player-near routing during high detection, last-heard routing during wall-sound response, otherwise roaming/searching.
- Wall collision fallback now tries slide movement first, then uses navigation recovery instead of repeatedly clearing the path in place.
- Shop one-time upgrades now visually show purchased state:
  - Noise reduction, breaker duration x2, and flashlight range x2 buttons get a green purchased style and `購入済み` label after purchase.
  - Heal remains reusable and does not get purchased styling.

## 2026-06-28 Corridor Routing / Roar Voice / Continue Regeneration

- Improved routing to sound/player positions behind walls:
  - `setEnemyDestinationNear()` now scores reachable candidates by path length, corridor preference, and final line-of-sight to the target point.
  - Added `setEnemyDestinationViaCorridor()` and switched sound/trap/wall-heard routing to it.
  - This should reduce direct wall pushing and favor wider corridor routes toward the sound source.
- Added more map route variety:
  - Random room-to-room connector paths are carved in addition to the central spine.
  - Rooms still remain reachable from the main route, but some routes can now connect room-to-room without always returning to the center.
- Alert/search movement was widened:
  - Super alert routing favors farther nodes.
  - SEARCHING can choose broader super-alert routes instead of repeatedly checking the same nearby cover.
- Added more voice-like roar audio:
  - `playSonarRoar()` now includes an extra sawtooth voice/formant layer.
- Added clear SE:
  - `playClearSound()` plays a short ascending clear sound when `endGame(true)` runs.
- Continue after capture now regenerates the map:
  - Caught cutscene completion reloads the page instead of calling `respawnPlayer()`.
  - Coin persistence remains handled by localStorage.

## 2026-06-28 Locker Calmdown / Forced Center Detour

- Locker hiding now rapidly lowers detection over 5 seconds:
  - On `enterLocker()`, stores the current detection and hide start time.
  - While hidden, `updatePlayer()` eases detection down to the key-based detection floor over 5 seconds.
  - Key-based minimum detection still applies.
- Wall-blocked sound routing now forces a center-corridor detour:
  - `setEnemyDestinationViaCorridor()` accepts `forceCenterRoute`.
  - When sound line of sight is blocked, routing becomes `enemy -> center corridor node -> reachable sound-side node`.
  - Recovery from wall-sound investigation also uses the forced center route.
- Goal is to prevent the enemy from sticking to the wall facing a sound source on the other side.

## 2026-06-28 Detection / Shop Persistence / Mobile Safe Area / Anti Ping-Pong

- Rebalanced out-of-detection alert:
  - Passive movement detection gain reduced to walking `0.7`, running `1.75`.
  - Out-of-sight calm-down increased: base `7.5`, searching/investigating `4.2`, minimum `1.6`.
- Shop one-time upgrade state is now persisted in localStorage:
  - Key: `it-hears-you-shop-upgrades`.
  - Noise reduction, breaker duration x2, and flashlight range x2 now survive reload/continue.
- Enemy anti ping-pong targeting:
  - Added `recentTargetKeys` memory.
  - Route commits remember recent destinations and roaming/super-alert route selection avoids recent targets when possible.
  - Super-alert and cover-search routes require farther target distances to reduce local back-and-forth loops.
- Mobile layout:
  - Portrait-forced-landscape app now uses full `100svh x 100svw` instead of shrinking by margins.
  - Landscape safe-area margins increased using `env(safe-area-inset-*) + px` so UI avoids notches more reliably.

## 2026-06-28 Alert Vision / Breaker HUD / 2F Mansion

- Enemy vision now scales with alert/detection:
  - 3D red vision rays and minimap vision cone both use dynamic length/width.
  - Detection, alert memory, SUPER_ALERT, and HUNTING extend the visible range and cone width.
- Roar SE was reinforced:
  - `playSonarRoar()` now has an additional throat/formant oscillator layer for a more monster-like voice.
  - The enemy still stops while roaring.
- Breaker interaction changed:
  - Breaker can be manually toggled ON/OFF from the interaction prompt.
  - ON toast/log was removed.
  - HUD now shows `ブレーカー：残り m:ss` in real time, or `OFF`.
- AI wall-running mitigation:
  - Blocked high-alert chasing now forces corridor detour routing instead of repeatedly choosing cover-near-player routes.
  - Stuck recovery during high detection also forces corridor detour routing.
- Added a 2F area:
  - Implemented as a stair-linked separate play area to avoid breaking current 1F navigation/collision logic.
  - 2F uses an old ruined mansion visual theme with wood floors, stained walls, shelves/desks, and dim lamps.
  - Player can use the stair prompt to move 1F ↔ 2F.
- Added a 2F enemy:
  - White-robed woman enemy patrols the 2F mansion area.
  - Every 30 seconds it phases through walls for 1 second.
  - It can catch the player on 2F at close range.
- Note:
  - The main SONAR enemy still uses the existing 1F navigation graph.
  - The 2F mansion is intentionally separated and handled by its own simple enemy movement logic.

## 2026-06-28 School / Mansion Select Rework

- Removed the previous 1F ↔ 2F stair gameplay path:
  - Mansion is no longer entered via stairs.
  - Title screen now has separate start buttons for `学校` and `屋敷`.
- Expanded mansion content:
  - Mansion map is now much larger than the previous small 2F area and uses a more complex wing/room layout.
  - Mansion has its own exit, breaker panel, shop stand, lockers/wardrobes, shelves/desks, dim lamps, and mansion-themed materials.
  - The same five pickup objects are reused as `お札` in mansion mode and are randomly placed in the mansion.
- Mansion ghost updates:
  - White-robed woman enemy was upgraded with a robe cone, long black hair strands, face shadow, ragged hem pieces, and hands.
  - Ghost reacts to sound events in mansion mode and uses the shared detection HUD.
  - Ghost visual cone is shown on the minimap and 3D red vision rays follow the active mansion enemy.
  - Ghost still phases every 30 seconds for 1 second.
- Mansion systems:
  - Noise meter, sound ripples, radar, breaker HUD, shop UI, lockers, pickups, and exit interaction work in mansion mode.
  - Flashlight slows the ghost to half speed while aimed at it with line of sight.
  - Battery drains 10x while the flashlight is actively hitting the ghost.
- Trap change:
  - Trap activation now deploys a 10m water puddle at the player's feet instead of only a small trigger marker.
  - While standing in water, footstep SE volume is multiplied by 3 and emitted noise radius is multiplied by 2.
- Notes:
  - Mansion is implemented as a separate far-away play area in the same Three.js scene, selected from the title screen.
  - Current mansion enemy navigation is direct/slide based, not a full graph pathfinder.

## 2026-06-28 Mansion Performance / Ghost Stun / Radar Markers

- Reduced ghost proximity performance spikes:
  - Removed per-frame `group.traverse()` material opacity updates for the mansion ghost.
  - Ghost phase opacity now updates only when the phase state changes.
  - Ghost vision checks are cached for short intervals instead of running full line-of-sight every frame.
  - Flashlight-hit checks are cached within a frame to avoid duplicate line-of-sight work.
- Mansion water trap behavior changed:
  - Ghost traps now deploy water immediately at the ghost position instead of waiting for the player to step on a trigger.
  - Water puddles last 180 seconds.
  - Mansion water traps are capped at 10 active puddles; oldest puddle is removed when over cap.
  - Water still makes player footsteps louder and doubles emitted noise radius.
- Added ghost flashlight stun:
  - Holding flashlight on the ghost for 5 seconds stuns it for 10 seconds.
  - During stun, ghost sight/hearing are disabled.
  - 3D red vision lines and minimap vision cone are hidden while stunned.
- Minimap utility markers:
  - Breaker and shop are shown on the minimap.
  - If outside minimap range, edge markers show `ブ` and `シ` to indicate direction.
- Mansion locker view:
  - Mansion wardrobes now define their own inside/outside eye height so hiding no longer drops the camera to floor level.

## 2026-06-29 Enemy Search Optimization / Mansion Access / Ofuda

- Reduced constant enemy-search cost in mansion mode:
  - Mansion 3D vision rays no longer raycast against every collider; they use a fixed visual cone for display.
  - Mansion vision-line refresh rate is reduced to 5Hz.
  - Ghost player sight checks are throttled to roughly every 0.28 seconds.
  - This targets the heavy frame drops that occurred when enemy search was effectively active all the time.
- Mansion breaker access:
  - Mansion generation now force-carves a route and room around the breaker area.
  - Start-side route to the breaker is kept walkable so the breaker can reliably be reached.
- Mansion pickups:
  - Mansion pickup visuals now switch from the key model to an ofuda/paper talisman model.
  - School mode still uses the key model.
- Capture rules:
  - Capture now requires the player to be inside the active sight check.
  - School enemy running/contact capture and wall-pin capture now require `visible`.
  - Pounce capture requires line of sight at the capture moment.
  - Mansion ghost close capture requires `ghostSeesPlayer`; distance alone no longer captures.

## 2026-06-29 Mansion Spawn / Ghost Facing Performance

- Fixed mansion start soft-lock:
  - Mansion generation now protects the start cell and breaker route from furniture placement.
  - Mansion start uses `nearestSafeMansionNode()` as a fallback so the camera does not spawn on top of a table or shelf.
- Reduced frame drops when looking at the mansion ghost:
  - Lowered ghost mesh segment counts.
  - Reduced independent hair strand meshes from 13 to 6.
  - Reduced ragged hem meshes from 9 to 5.
  - Reduced ghost point-light intensity and distance.
  - Added a simple LOD: if FPS is below 50 while the ghost is nearby, small hair/hem detail meshes are hidden temporarily.

## 2026-06-29 Light / AI / Trap Performance Pass

- Investigated likely sources of persistent frame drops:
  - Point lights staying active even when far from the player.
  - Line-of-sight ray checks iterating all colliders.
  - Flashlight-vs-ghost checks running every frame.
  - Water traps continuing animation/render work even when far away.
- Added broad-phase skipping for line/ray checks:
  - `hasLineOfSight()` now skips colliders outside the segment AABB.
  - `visionRayDistance()` now skips colliders outside the ray AABB.
- Reduced flashlight hit-check cost:
  - Ghost flashlight hit result is cached for 0.12 seconds.
- Added light culling:
  - Distant school/mansion point lights are hidden based on player distance.
  - Non-active-map breaker lights are hidden.
  - Key/ofuda, heal, and coin point lights are hidden when far away.
- Reduced trap cost:
  - Far mansion water puddles are hidden and skip animation/material opacity updates.
  - Expired far puddles are removed without doing per-frame visual work.
- Reduced AI node overhead:
  - Mansion nearest-node helpers now use linear best search instead of allocating/filtering/sorting arrays.

## 2026-06-29 Map Select Loading / Deferred Heavy Assets

- Added a loading overlay:
  - `#loading-screen` displays map loading status after selecting `学校` or `屋敷`.
  - `startGame()` is now async and yields frames between loading phases.
- Deferred selected-map initialization:
  - Mansion generation no longer runs at title startup.
  - `buildMansionSecondFloor()` is called only when `屋敷` is selected.
  - SONAR external GLB/OBJ loading no longer runs at title startup.
  - `loadExternalSonarModel()` is called only when `学校` is selected.
  - The loader guard prevents duplicate mansion generation or duplicate SONAR model loads.
- Reduced title/loading processing:
  - Radar/minimap update now returns before doing work if the game has not started or loading is active.
  - During loading, the main animation loop renders only the loading frame and skips gameplay/AI/radar/audio updates.
- Remaining technical note:
  - The school base map is still generated at module startup because school generation, exit, keys, enemy start, and several shared systems are currently top-level dependencies.
  - A full “only generate school after school selection” refactor requires splitting the school map factory and moving dependent item/enemy initialization under that factory.
  - Current patch removes the heavier mansion generation and SONAR external model loading from startup, and stops unselected/loading processing.
## 2026-06-29 Selected Map Runtime Purge

- Added a selected-map cleanup pass during `startGame(mode)`:
  - Mansion selection now purges school scene objects inside school bounds after mansion generation.
  - School selection purges mansion scene objects if mansion data exists.
  - Unselected-map colliders, lockers, active pickup items, traps, sound ripples, sonar reveals, and map point lights are removed from runtime arrays.
- Marked shared objects so they survive map cleanup:
  - Global lights, key/ofuda item groups and lights, flashlight/fill/locker lights, enemy vision line renderer, and the mansion ghost group.
- School-only pickup loops are now disabled in mansion mode:
  - Coin and heal spawn/update no longer run while the mansion map is active.
  - Initial school coin/heal scheduling is skipped for mansion starts.
- Notes:
  - This is a practical separation pass layered on top of the current top-level school construction.
  - The mansion remains lazily generated only after mansion selection.
  - Further memory reduction would require moving school creation itself into a factory, but the current patch prevents selected-map gameplay from processing leftover unselected-map colliders/pickups/lights.

## 2026-06-29 Mansion Scale / Culling / Vision Optimization

- Reduced mansion map scale:
  - Mansion generation grid changed from roughly 17x27 cells to roughly 13x19 cells.
  - Mansion start, exit, breaker route, and protected spawn/breaker areas were moved to match the smaller layout.
- Reduced vision rendering cost:
  - Enemy vision debug/radar line count changed from 13 rays to 5 rays.
  - Vision ray distance now uses collider clipping for mansion mode too.
  - Detection at 40% or lower halves vision distance and width.
- Added mansion distance culling:
  - Mansion meshes/lights registered during generation are hidden when farther than 30m from the player.
  - Mansion key/ofuda item groups and lights are also hidden outside 30m.
  - Mansion ghost skips expensive vision/flashlight/chase processing outside 30m.
- Mansion interaction/placement fixes:
  - Mansion breaker panel moved onto a wall.
  - Mansion lockers increased from 5 to 10.
  - Mansion shop now has a collider so the player cannot walk through it.
- Ghost phasing fix:
  - If the ghost is still inside a wall when wall-phasing ends, it keeps phasing until it exits into a valid position.

## 2026-06-29 Mansion Start / Ghost Stun Reticle / Trap Spacing

- Mansion start camera now faces the opposite direction so the player no longer starts looking into a wall.
- Ghost flashlight stun logic was narrowed for performance and clarity:
  - Stun charge now requires the ghost to be within 10m.
  - Stun charge now requires the ghost to be near the screen center, not merely visible somewhere on screen.
  - Line-of-sight checks run only after the distance and center checks pass.
  - Flashlight hit cache interval increased slightly to reduce repeated checks.
- Added a center stun reticle:
  - A blue circular marker appears only while the flashlight stun condition is active.
  - The inner blue fill grows from the center and triggers stun when it reaches the ring.
- Reduced ghost view cost:
  - Close-range or low-FPS ghost detail parts are hidden more aggressively.
- Mansion water traps now avoid overlap:
  - Trap water uses a shared 10m radius constant.
  - New mansion water traps search nearby nodes and skip spawning if every valid spot overlaps existing water.
  - Triggered trap water also cancels if it would overlap an existing water area.

## 2026-06-29 Locker / Capture / Darkness Follow-up

- Ghost now loses the player when the player hides in a locker:
  - Cached sight is cleared.
  - Current ghost target is cleared.
  - Ghost stun charge UI is hidden while hiding.
  - Detection drops faster while hidden.
- Flashlight stun reticle color changed from blue to red for readability.
- Mansion visibility beyond the 30m render range is now made much darker:
  - Mansion mode forces black background.
  - Mansion mode uses dense black fog while skipping the school lighting override.
- Capture cutscene no longer reloads the page:
  - It now respawns the player on the current map after the cutscene.
  - Mansion capture camera now focuses the ghost instead of the school SONAR enemy.
- School shop now has a collider so the player cannot walk through it.

## 2026-06-29 Mansion Ghost / Shop / Ofuda / Exit Follow-up

- School shop placement now prefers room interiors only:
  - Shop candidates must be inside a school room.
  - Candidates near room entrances are rejected so the shop should not block corridors.
  - Fallback also prefers room cells over corridor cells.
- Mansion/player trap separation:
  - Player-triggered trap conversion to water is disabled in mansion mode.
  - Mansion water traps are now only created by the ghost's own trap drop routine.
- Ghost phasing behavior changed:
  - Ghost now stops for a short charge motion before phasing.
  - During charge/phasing, the ghost becomes semi-transparent.
  - A small pulsing motion is applied during the charge.
- Locker hiding AI follow-up:
  - While the player is hidden, the ghost periodically redirects to a random mansion node away from the player.
  - This prevents the ghost from continuing to run into the last chase target or nearby objects.
- Ofuda model improved:
  - Added paper edging, seal core, more ink strokes, and paper fiber strips.
- Mansion exit visibility improved:
  - Added door/glass pieces and an exit sign object.
  - Wall text helper now supports north/south facing signs.

## 2026-06-29 Shop / Locker / Breaker / Stun Follow-up

- Shop placement/collision fixes:
  - School shop now uses room wall-side placement instead of room center placement.
  - Mansion shop is now selected from mansion floor nodes and offset toward a side, instead of being fixed near the start route.
  - Shop colliders now rotate with the shop so they block the object shape without sealing passages.
- Locker placement fixes:
  - School locker wall offset reduced so lockers are less likely to sink into walls.
  - Mansion lockers are now generated from valid mansion floor nodes instead of fixed coordinates.
  - Mansion lockers are skipped if their chosen wall-side position overlaps an existing collider.
- Mansion breaker lighting fix:
  - Mansion mode now updates ambient/hemisphere light, exposure, and mansion point lights when the breaker is ON.
  - This replaces the school-lighting path that is intentionally skipped in mansion mode.
- Ghost stun pose:
  - While stunned, the ghost rotates down into a fallen pose.
  - On recovery/respawn/map start, rotation and scale are reset.

## 2026-06-29 Mansion Maze / Ghost Audio / Fake Ofuda / Coins

- Mansion map generation adjusted toward a circular maze:
  - Cells outside an ellipse are skipped.
  - A small central plaza and three route spokes are favored.
  - Ring-like corridor bands are favored to make the mansion less rectangular.
- Mansion breaker initial color is forced to OFF after the mansion breaker is generated.
- Ghost phasing visuals strengthened:
  - Phasing materials now disable depth write and force material updates while transparent.
  - Phasing still starts with a short stop/charge window before movement.
- Mansion detection performance reduced:
  - Ghost line-of-sight cache interval increased.
  - Mansion vision-line update interval increased to 0.5 seconds.
  - Mid-distance ghost detection gain reduced.
- Mansion ghost audio changed:
  - Heartbeat/near-enemy gain no longer uses ghost proximity.
  - Ghost remains silent; school SONAR enemy footsteps are unchanged.
  - Ghost hover height/amplitude increased for floating movement.
- Fake ofuda added to mansion:
  - Fake ofuda use the same visual model as real ofuda.
  - Picking one sets detection to 100 for 13 seconds.
  - Ghost teleports to a floor node about 15m in front of the player and spends 3 seconds emerging from the floor.
- Mansion coins enabled:
  - Coin spawning now uses mansion nodes while in mansion mode.
  - Mansion respawns also schedule coin spawning.
- Out-of-detection running alert gain doubled.

## 2026-06-30 Random Map / Breaker / Fake Ofuda Emerge Fix

- School map generation changed from a fixed central hallway with room branches to a randomized maze-first layout:
  - A DFS-style corridor maze is carved before attaching school rooms.
  - Extra loop branches are added so the route is not just a straight central corridor.
  - Start-side cells are explicitly carved so the player spawn remains connected.
- Mansion maze generation fixed:
  - Breaker route, breaker room, start route, and exit route are protected from the ellipse/outside-cell skip.
  - This prevents the breaker route from being removed and keeps the breaker reachable inside the generated map.
  - Maze retention is slightly stricter to keep the mansion closer to a small central plaza plus surrounding labyrinth.
- Mansion breaker placement fixed:
  - Breaker panel/switch/light are now anchored to the nearest valid mansion floor node instead of fixed world coordinates.
  - Breaker visual is reset to OFF after generation.
- Fake ofuda trap presentation improved:
  - Added a floor sigil/ripple effect where the ghost emerges.
  - Fake ofuda now starts the visible effect immediately when triggered.
  - During the 3-second emergence, the effect expands/fades while the ghost rises from below the floor.

## 2026-06-30 School Route / Mansion Labyrinth Correction

- School random map reachability fixed:
  - Added a guaranteed bent route from the front/start side to the far/back rooms.
  - The guaranteed route bends through multiple grid positions instead of restoring the old straight central hallway.
  - Every room doorway is connected back to this guaranteed route so random maze carving cannot isolate required rooms.
- Mansion generation changed to be much more wall-heavy:
  - Replaced the broad center/ring/room-cluster retention logic with a corridor-first maze set.
  - Central plaza is now intentionally tiny, with only the center and three exits guaranteed.
  - Breaker/start/exit routes are carved as narrow required paths.
  - Random branches and short loops are grown from those required paths to make a labyrinth instead of one giant open plaza.
  - Mansion start cell at z=28 is now included as a valid generated cell.

## 2026-06-30 Mansion Breaker / Exit Reachability Tightening

- Mansion required routes are now force-carved so the ellipse boundary cannot remove intermediate route cells.
- Breaker route, start route, and exit route are split into bent forced segments to keep them reachable without becoming a wide open plaza.
- Mansion exit is now anchored to a guaranteed valid floor node, with the visible door placed on the edge wall of that node.
- Mansion random branches were reduced significantly:
  - Branch seeds reduced from 18 to 7.
  - Branch length reduced.
  - Extra loop connectors reduced from 10 to 3.
  - This should make the mansion much more wall-heavy and labyrinth-like.

## 2026-06-30 Mansion Locker Clearance / Maze Branch Balance

- Mansion locker placement now validates the exit/standing area before placing a locker:
  - Rejects lockers if the player exit point overlaps furniture/colliders.
  - Checks side clearance around the exit point so a desk/shelf cannot trap the player immediately after leaving.
  - Uses more candidate nodes while still capping placed mansion lockers at 10.
- Mansion maze generation rebalanced away from a single path:
  - Branch seeds increased from 7 to 12.
  - Branches keep a short initial direction so they form visible side corridors instead of tiny stubs.
  - Branch length and small loop count were slightly increased while keeping the wall-heavy layout.

## 2026-06-30 Mansion Outer Loop / Locker Furniture Clearance

- Mansion outer-edge accessibility improved:
  - Added a forced one-cell-wide outer circulation loop around the mansion grid.
  - Added several forced connectors from the inner route network to the outer loop.
  - The outer loop is treated as a protected route so random furniture is not placed on it.
- Locker furniture clearance tightened:
  - Desk/shelf colliders are now tagged as `furniture`.
  - Mansion locker placement rejects any locker whose exit/standing area has furniture within about 1m.
  - Wall collision checks remain separate so lockers can still be placed against walls.

## 2026-06-30 High Quality Mansion Ghost Model

- Added an external Blender-generated ghost model:
  - Source script: `scripts/create-yurei-woman-model.py`
  - Review files: `model_review/yurei_woman_v1/`
  - Runtime GLB: `public/models/yurei_woman_v1.glb`
- The model is an original long-haired white-robed vengeful ghost design inspired by classic Japanese horror imagery, not a direct copyrighted character copy.
- Visual details include:
  - Long wet black hair curtain and side locks.
  - Torn aged white robe with ragged hem pieces.
  - Pale hidden face/skin, bony hands, long gray nails.
  - Dirt and dried dark-red stain geometry on the robe.
- Mansion ghost now loads `./models/yurei_woman_v1.glb` through `GLTFLoader`.
- Existing procedural ghost remains as fallback if GLB loading fails.
- On successful GLB load:
  - Procedural ghost parts are hidden.
  - External model materials are registered for phasing/transparent visual effects.
  - Loaded model is rotated 180 degrees so the visual facing direction matches the existing AI forward vector.

## 2026-06-30 Mobile Exit Input Freeze Fix

- Fixed a mobile-only freeze/lockup risk when tapping the center action button to escape:
  - Mobile center action now triggers on `pointerup` via `requestAnimationFrame` instead of mutating game/end UI during `pointerdown`.
  - Pointer capture is released before running the interaction.
  - End-game now marks `allowExit = true`, clears locker visual state, hides the mobile action prompt, and disables the mobile control overlay.
  - Mobile controls are re-enabled on respawn/game start.
  - Restart button now also supports mobile `pointerup`, not only desktop-style `click`.

## 2026-06-30 Full Map / Locker Light / Mansion Ghost Events

- Added soft spotlights to school and mansion lockers so hiding spots are easier to notice in dark areas.
- Added a full-map overlay:
  - PC opens/closes it with `M`.
  - Mobile opens it by tapping the radar/minimap panel.
  - The overlay shows walkable corridors, implied walls, lockers, breaker, shop, exit, and the player position.
  - Gameplay simulation pauses while the full map is open.
- Mansion ghost balance updated:
  - Base movement speed is doubled.
  - When the flashlight is hitting the ghost within 5m, the ghost slows to 20% speed.
  - Beyond 5m, existing flashlight slow remains lighter.
- Added mansion ghost doppelganger event:
  - Spawns after 60 seconds at a reachable mansion point away from the player.
  - Patrols/searches for up to 60 seconds.
  - Touching the player causes a 5-second seated/stumble state instead of capture, then the doppelganger disappears.
  - The event repeats on a 60-second cooldown.
- Added mansion eye-scare event:
  - Every 2–5 minutes in mansion mode, a close-up eye fades in/out for about 1 second.
- Technical note:
  - Locker spotlights add both the light and target to the shared light/object lists; update loops now skip non-light targets where needed.

## 2026-06-30 Fake Ofuda / Ghost Double Visual Fix

- Fixed fake-ofuda trap emergence cleanup:
  - The mansion ghost now forcibly resets position height, X/Z rotation, and scale after the floor-emerge animation.
  - This prevents the ghost from continuing to move while lying down after a fake ofuda trigger.
- Fake ofuda visuals were brightened:
  - Ofuda paper now uses a lightweight unlit material so it does not collapse into a black object in dark mansion lighting.
  - Fake ofuda uses a slightly larger/red-tinted cursed paper variant.
- Reduced locker-light overhead:
  - Locker highlight lights were changed from SpotLight + target objects to cheaper PointLights.
- Ghost doppelganger visual now matches the mansion ghost:
  - After `yurei_woman_v1.glb` loads, the doppelganger receives a cloned GLB model instead of keeping the old procedural fallback.
  - Doppelganger materials are cloned separately and kept semi-transparent.

## 2026-06-30 Ghost Stun / Breaker Minigame Update

- Flashlight stun targeting was widened:
  - The stun charge now checks several points around the ghost's head/body instead of a single fixed center point.
  - This lets the stun meter continue charging while aiming around the ghost, not only at the initial exact point.
- Mansion ghost balance:
  - Flashlight stun requirement changed from 5 seconds to 3 seconds.
  - Ghost wall-phasing duration changed to 10 seconds after its 1-second charge.
  - Ghost movement now attempts a mansion-node route toward the player when direct movement is blocked by walls/objects.
  - During phasing, direct wall movement remains allowed.
- Shop update:
  - Added `ライトスタン時間半減：20コイン`.
  - The upgrade is persisted with the existing shop-upgrade storage and changes stun charge from 3 seconds to 1.5 seconds.
- Breaker update:
  - Turning the breaker OFF remains immediate.
  - Turning the breaker ON now opens a 3x3 sequence minigame.
  - The player must press 5 lit cells in order, similar to the Among Us breaker/memory task.
  - Gameplay pauses while the breaker minigame is open.

## 2026-06-30 Breaker Minigame / Pickup Placement / Ghost Facing Fix

- Breaker minigame timing adjusted:
  - The sequence now starts after a 3-second countdown once the minigame screen is visible.
  - The 5-cell sequence now uses unique grid positions and does not repeat the same cell in one round.
- Pickup placement tightened:
  - School keys avoid breaker and lockers within 3m.
  - School shop placement already rejects positions within 3m of keys, preserving the same separation.
  - Mansion real ofuda and fake ofuda now avoid breaker, shop, and lockers within 3m.
- Enemy movement visual fix:
  - Mansion ghost and ghost doppelganger now face their actual movement vector.
  - This prevents visible sideways sliding when sliding along walls or correcting around obstacles.

## 2026-06-30 Eye Scare Asset / Full Map Visibility Update

- Eye scare presentation updated:
  - Added `public/images/eye_scare.png` from the provided close-up eye reference.
  - Added three provided voice clips under `public/audio/`.
  - Eye scare now uses the provided image instead of CSS-generated gradients.
  - Eye scare interval changed to 30 seconds for effect checking.
  - Eye scare overlay z-index was raised so it can appear over the breaker minigame.
  - A random provided voice clip plays whenever the eye scare triggers.
- Full map rendering improved:
  - Full-map bounds now only include lockers from the currently active map, preventing the map from being pushed left with empty space on the right.
  - Full map is centered in the canvas using the actual scaled map size.
  - Full map now draws thick wall edges around walkable cells so school/classroom walls are easier to read.
- School wall visibility improved:
  - School room/corridor wall thickness increased from 0.18 to 0.36 world units.

## 2026-06-30 Eye Scare Volume Tweak

- Eye scare voice volume reduced to one third of the normal SE volume.
- Eye scare voice playback is triggered immediately at the scare start frame before the overlay timer is set.
- `doko_ni_iruno.mp3` is now treated as a calm-only eye scare voice and will not play when detection is 50 or higher.

## 2026-06-30 Mansion Ghost Facing / Stun Pose Fix

- Mansion ghost GLB local forward axis adjusted:
  - The external yurei model now uses a 90-degree local yaw offset so the visible model faces the same direction as the AI movement vector.
  - The ghost doppelganger clone receives the same local yaw correction.
- Mansion ghost rotation during movement is now set directly from actual movement delta instead of smoothed toward it.
  - This reduces visible sideways sliding at corners and wall-correction movement.
- Stun pose hardened:
  - On stun trigger, the ghost immediately snaps to a fallen pose.
  - While stunned, X/Z rotation and low position are forced every frame instead of lerped, preventing the ghost from standing upright during stun.

## 2026-07-01 Placement / Map / Ghost Upright Fix

- Important object placement was tightened:
  - Shop, breaker, exit, real key items, and fake ofuda now keep wider spacing from each other.
  - School key placement now rejects non-walkable / out-of-map cells and verifies the final pickup point with movement collision checks.
  - School shop placement no longer uses a fallback that can block the exit or overlap important pickups.
- Full-map bounds now use walkable cells as the source of truth:
  - This keeps the school/mansion map centered on playable space and avoids misleading empty-map offset.
- Mansion ghost pose was corrected:
  - During normal movement and fake-ofuda emergence, the ghost is forced upright and no longer uses crawl/lean rotations.
  - The GLB forward correction remains at the tested 90-degree offset to prevent sideways sliding.
  - Stun pose now rotates the GLB on the X axis only, so it lies sideways without flipping upside down.
  - Recovery and respawn reset the ghost back to a fully upright pose.

## 2026-07-01 Mansion Ghost GLB Axis Correction

- Fixed the mansion ghost starting and moving while lying sideways:
  - The exported `yurei_woman_v1.glb` uses a model axis where the character height is not aligned with Three.js world Y.
  - Runtime now applies a permanent local `+90deg X` upright correction during normal movement, spawn, fake-ofuda emergence, and recovery.
  - The stun pose intentionally removes that upright correction so the ghost lies down only while stunned.
  - The ghost doppelganger clone receives the same upright correction.

## 2026-07-01 Ghost Axis / Continue / Trap / Shop / Map Fix

- Corrected the mansion ghost upright correction again:
  - The previous X-axis correction was inverted and made the ghost appear upside down.
  - Runtime now uses the opposite local X correction for the GLB upright pose.
- Continue/respawn safety:
  - On mansion respawn, the ghost is placed at a mansion node at least 22m away from the player when possible.
  - This prevents immediate repeat game-over loops after continuing.
- School trap fix:
  - School/classroom traps no longer convert into mansion ghost water traps when stepped on.
  - They now trigger as a short-lived noise trap only.
- Shop update:
  - Added a persistent `breakerSkip` upgrade for 50 coins.
  - When purchased, turning the breaker ON skips the 3x3 minigame and powers it immediately.
- Full map wall display:
  - Wall colliders now keep a `wall` flag.
  - Full map draws those wall colliders as black rectangles so thin school walls are represented.

## 2026-07-01 Classroom Trap / Mansion Ghost Illusion Update

- Classroom/school trap behavior restored:
  - School traps still no longer create mansion water.
  - On trigger, they now apply seated state for 5 seconds and deal trap damage again.
  - Triggered trap visuals remain short-lived instead of becoming water circles.
- Added mansion ghost illusion scare:
  - Ghost stun successes are counted per run.
  - After the ghost has been stunned at least 2 times, a scare timer starts.
  - Every 1-2 minutes, up to 5 translucent ghost illusions spawn around the player and rush directly toward them.
  - Illusions do not damage, capture, or apply seated state; they disappear on contact or after a short lifetime.
  - Illusions reuse the external yurei GLB when loaded and fall back to the procedural ghost otherwise.
  - Continue/start resets stun count, illusion timer, and active illusion state.

## 2026-07-01 Ghost Doppelganger Phasing Movement

- Mansion ghost doppelganger movement was changed to always phase through walls/furniture:
  - Removed `canEnemyMoveTo` checks from the doppelganger spawn/move loop.
  - The doppelganger now moves directly toward random mansion targets without collision blocking.
  - Repath timing was shortened and movement speed increased so it keeps roaming aggressively instead of getting stuck.

## 2026-07-01 Sequential Ghost Illusions / Mansion Locker Placement

- Ghost illusion scare was made lighter:
  - Illusion pool increased to 10, but only 1 illusion is active at a time.
  - After an illusion disappears, the next one spawns after a random 1-10 second delay.
  - A full scare wave now consists of 10 sequential illusions instead of multiple simultaneous illusions.
- Mansion locker placement was wall-biased:
  - Locker candidate sides now require a non-walkable/wall area behind the locker.
  - Locker offsets were moved farther toward the wall so lockers are less likely to sit in the middle of corridors.

## 2026-07-01 Randomized Ghost Illusion Spawn

- Ghost illusion scare spawn positions were randomized:
  - Each illusion now chooses a random angle around the player and a random 6-13m distance.
  - Spawn points are snapped to nearby mansion walkable nodes when possible.
  - This replaces the previous fixed front/back/left/right spawn candidate list.

## 2026-07-01 Input Stability Fix

- Added `clearMovementInput()` and use it when:
  - Settings open/close.
  - Pointer lock is released.
  - Browser window loses focus.
  - Page visibility becomes hidden.
- Movement key state is now tracked only for WASD/Shift.
- Movement keys are ignored while menus/maps/minigames are open or pointer lock is not active.
- Pointer lock `unlock` no longer automatically opens the settings screen.
  - This prevents random settings popups and the need to close settings twice.
- ESC while the shop is open now stops propagation after closing the shop, preventing it from also toggling settings.

## 2026-07-01 Pointer Lock / Flicker Reduction

- Pointer lock reacquisition was strengthened:
  - Added throttled pointer-lock attempts to avoid repeated lock spam.
  - Gameplay canvas now requests pointer lock on pointerdown/click when normal gameplay is active and menus are closed.
  - Click lock guards now also respect shop/full-map/breaker minigame state.
- Reduced periodic dark flicker:
  - Dynamic resolution changes are now skipped during active pointer-locked gameplay.
  - This prevents `renderer.setSize()` from running during normal play, which could briefly show a dark/black frame.
  - Resolution adjustment can still occur outside active gameplay, such as menus/loading/unlocked states.

## 2026-07-01 Pointer Lock Start / ESC / School Map Wall Fix

- Pointer lock is now requested immediately from the map start button click handler before async loading begins.
  - This keeps the request inside the browser's user-activation window and prevents the OS cursor from continuing to move behind the game.
- Pointer lock unlock now opens settings only during normal focused gameplay.
  - ESC should now unlock and open settings in one action instead of requiring a second ESC.
  - A short ESC suppression window prevents the same ESC event from instantly closing settings again.
- School full-map wall rendering was strengthened:
  - Missing-neighbor boundaries around walkable school cells now draw as thick black wall lines.
  - This is in addition to black wall collider rectangles, so thin/light walls should be visible as wall marks on the map.

## 2026-07-01 Pointer Lock Reliability Hotfix

- `lockPointer()` now uses standard pointer lock instead of `unadjustedMovement:true`.
  - The unadjusted/raw mouse request can fail asynchronously in some browsers, leaving the OS cursor active over the game.
  - Start-game, post-loading, and settings-return paths now force a fresh standard pointer-lock attempt.
- `lockPointer(force)` can bypass the short retry throttle for user-confirmed transitions such as starting the game or closing settings.

## 2026-07-01 Pointer Resume / School Room Map Walls

- Settings/full-map close now routes through a shared gameplay pointer-lock resume helper.
  - The game canvas is focused before requesting pointer lock.
  - A forced pointer-lock attempt is made immediately, with one animation-frame retry if gameplay is still active.
- Full map now unlocks the pointer while open and resumes pointer lock when closed by ESC/M/close controls.
- Added a capture-phase mousemove guard while pointer-locked:
  - Ignores the first short burst after pointer lock.
  - Drops extremely large movement deltas to reduce sudden camera jumps when turning left/right.
- School full-map rendering now draws explicit room perimeter walls:
  - Each classroom/room perimeter is painted as black wall segments.
  - Only the configured entrance side/door cell is left open.
  - This is layered in addition to collider walls and missing-neighbor boundaries, so room walls should remain visible on the map.

## 2026-07-01 4K Performance Optimization Pass

- Re-enabled dynamic render downscaling during active gameplay when FPS drops.
  - Gameplay can now step down through the existing resolution tiers instead of staying at the 1920x1080 internal cap.
  - Upscaling is still blocked during active gameplay to avoid repeated resize flicker.
- Added a spatial bucket index for colliders.
  - Player movement, enemy movement, line-of-sight, and vision ray checks now test nearby collider buckets instead of scanning every collider.
- Cached mansion pathfinding adjacency.
  - Mansion ghost routing no longer rebuilds neighbor candidates by scanning all mansion nodes on each path request.
- Reduced recurring update cost:
  - Removed radar floor-cell sonar reveal rendering and its per-node scan.
  - Radar update rate reduced to 4Hz.
  - Mansion distance culling reduced to 4Hz.
  - School global light intensity updates now run only on breaker state changes or about every 0.35s.

## 2026-07-01 Ghost Roar / Eye Scare / Visibility Performance Pass

- Removed `playSonarRoar()` calls from mansion ghost-only events.
  - Fake ofuda emergence no longer plays the Sonar roar.
  - Ghost phasing no longer plays the Sonar roar.
  - Ghost illusion spawn no longer plays the Sonar roar.
- Eye scare performance was reduced:
  - Eye image is preloaded at startup.
  - Eye scare voice clips are pre-created and reused instead of creating `new Audio()` on each scare.
  - Eye scare DOM class/style updates now avoid repeated inactive-state writes.
- Added view-based throttling for off-screen gameplay objects:
  - Traps outside the player view no longer run animation or trigger checks.
  - Heal items, coins, mansion ofuda, and fake ofuda only animate/light when near and in view.
  - Mansion culling now also respects player view for ofuda/fake ofuda visibility.
- Expanded dynamic resolution tiers down to 0.32 and begins lowering at a higher FPS threshold to recover from 4K slowdowns faster.
- Water trap membership check now exits outside mansion and uses squared distance to avoid unnecessary per-frame work.

## 2026-07-01 Locker / Ghost Illusion / Flicker Fix

- Added locker placement fallbacks:
  - School now guarantees at least 5 wall-side lockers by scanning additional safe wall-adjacent walkable cells if fixed candidates fail.
  - Mansion now falls back to a looser wall-side placement pass to guarantee at least 6 lockers if strict placement yields too few.
- Fixed the post-stun ghost illusion sequence:
  - On the second successful ghost stun, the 10-illusion queue is now scheduled 3 seconds later instead of waiting 60-120 seconds.
  - Later stun events can reschedule a short follow-up if no illusion event is pending.
- Reduced recurring black flicker risk:
  - Active gameplay again blocks dynamic renderer resizing, preventing periodic `renderer.setSize()` flicker.
  - 4K/large viewport now picks a lower starting resolution before gameplay begins instead.
  - Eye scare overlay no longer has its own black background and will not show until its image is loaded.
- Mansion key/ofuda placement now guarantees all 5 required items:
  - All 5 mansion positions are regenerated each map placement/continue.
  - Placement relaxes spacing/safety in stages but still prefers reachable mansion nodes away from utilities/start/exit.
  - Near ofuda remain visible even if outside the current view cone, avoiding cases where nearby required items appear missing.

## 2026-07-02 Off-detection Movement Suspicion Fix

- Restored suspicion gain from player movement outside direct detection for both school and mansion.
- Added `updateAmbientMovementSuspicion()` after enemy/ghost AI updates so the gain is not immediately erased by non-visible calm-down logic.
- Running now raises detection slowly but reliably outside sight/hearing; walking raises it very gradually.
- Water trap movement still amplifies the off-detection gain.

## 2026-07-02 Runtime Performance Optimization Pass

- Added school-side chunk-style render culling:
  - Static school meshes created through `addBox()` are registered in `schoolRuntimeObjects`.
  - `updateSchoolDistanceCulling()` hides school static meshes outside the near radius or behind the player, while keeping collision data active.
  - Mansion distance culling remains active and is still called on the same 0.25s cadence.
- Reduced far enemy AI update frequency:
  - School enemy AI now updates every frame only when close, hunting, or detection is high.
  - If the school enemy is farther than 20m and not urgent, updates are reduced to 0.5s or 1.0s intervals.
  - Mansion ghost AI uses the same 20m/34m distance thresholds unless hunting, seeing the player, stunned, or high detection.
  - Ghost doppelganger/illusion updates are skipped while inactive and throttled while waiting.
- Collision/raycast optimization status:
  - Existing collider spatial buckets remain in use for movement, enemy movement, line-of-sight, and vision rays.
  - Ray checks already query nearby AABB buckets instead of scanning every collider.
- Audio detection status:
  - Sound detection remains event-driven through `emitWorldSound()` / `reactToSoundEvent()` / `reactWomanToSoundEvent()`.
  - Player footstep sound events are emitted at step intervals from `updateAudio()`, not every frame.
- Dynamic light policy:
  - No new non-flashlight dynamic lights were added in this pass.
  - Existing static/item lights continue to be distance/view culled.
- Runtime performance metrics:
  - Added `recordPerformanceSnapshot()` every 5 seconds.
  - Latest sample is available at `window.__IT_HEARS_YOU_PERF__` and localStorage key `it-hears-you-last-perf`.
  - Snapshot fields: `fps`, `drawCalls`, `triangles`, `points`, `lines`, `geometries`, `textures`, `resolution`, `map`, `time`.
  - Codex environment did not have a browser automation dependency installed, so a reliable before/after FPS/CPU measurement could not be captured here.
  - CPU usage is not directly available from browser JavaScript; use browser Task Manager/DevTools Performance for CPU comparison.
- Deferred/high-risk items:
  - Full `THREE.InstancedMesh` conversion for walls/floors/lockers/desks and long-wall mesh merging were not applied in this pass because current code often expects concrete mesh/group references for collision, visibility, cleanup, and interactions.
  - Recommended future safe path: introduce an instanced static-prop layer for non-interactive repeated furniture first, then move wall/floor generation after collision generation has been decoupled from render meshes.

## 2026-07-02 Mansion Locker / Ghost Patrol / School Flicker Follow-up

- Fixed mansion locker regression:
  - Existing mansion locker groups are now tagged as lockers.
  - Mansion locker objects are kept visible while mansion mode is active.
  - Added a final guaranteed placement pass so mansion generation produces at least 8 lockers even when strict wall-side placement fails.
- Fixed school periodic black flicker regression:
  - Disabled school static mesh distance/view culling because the periodic visibility pass could hide floor/wall meshes during active play.
  - School runtime objects are now simply shown in school mode and hidden outside school mode.
- Reduced ghost patrol ping-pong:
  - Mansion ghost AI updates every frame again while mansion mode is active.
  - Free-roam targets now avoid recently visited nodes and prefer farther map nodes, making repeated short back-and-forth movement less likely.

## 2026-07-02 Shop Map/Radar and Map Cache Update

- Added new shop items:
  - Full map unlock: 50 coins.
  - Radar unlock: 100 coins.
- Shop upgrades now track ownership separately from ON/OFF state:
  - Purchased upgrades can be toggled ON/OFF from the shop.
  - Older save data is migrated by treating legacy true flags as purchased and enabled.
- Radar is locked until purchased:
  - The minimap shows a lightweight locked display instead of enemy/sound/utility tracking.
  - This also skips the heavier radar drawing while locked.
- Full map is locked until purchased:
  - M key / mobile radar tap shows a toast until the map item is bought and enabled.
- Coin spawn interval changed from 10 seconds to 20 seconds.
- School utility placement is more random:
  - Breaker room is now selected from a random non-exit room instead of always using the fixed breaker room.
  - Existing random shop/exit placement remains active.
- Added selected-map cache bookkeeping:
  - School is treated as prebuilt/cached after initial generation.
  - Mansion is built once on selection, then marked cached so repeated setup uses the existing generated data instead of rebuilding.

## 2026-07-02 Shop UI / Radar Visibility / Placement Follow-up

- Radar UI now hides completely when radar is not unlocked or is toggled OFF.
- Shop screen layout changed to a two-column grid with scroll safety to avoid vertical clipping.
- Map unlock UI added:
  - PC shows an `M マップ` button in the movement panel when map is enabled.
  - Mobile shows a map button at the bottom center when map is enabled.
- School breaker room label changed to storage (`倉庫`).
- School breaker placement now uses the selected room wall coordinate directly instead of offsetting from a random room node, keeping the breaker on the wall.
- Mansion breaker placement is now randomized from wall-adjacent reachable mansion nodes instead of a fixed anchor.
- Mansion water trap rendering no longer depends on view direction:
  - Water is double-sided.
  - Visible distance increased.
  - Mansion water visibility uses distance only, avoiding flicker when the camera angle changes.
- Furniture placement safety improved:
  - Desks and shelves now check nearby colliders, lockers, shop, and breaker before spawning.
  - This reduces wall/furniture overlap in school rooms and locker/table overlap in mansion generation.

## 2026-07-02 Mansion Exit Randomization / Fake Ofuda Visual Tuning

- Mansion exit placement is now randomized:
  - Exit candidates are selected from reachable mansion nodes that have a wall-adjacent outward side.
  - Door mesh, sign, and glow are placed according to the selected wall direction instead of the previous fixed south-east outer-loop location.
- Mansion breaker remains randomly selected from wall-adjacent reachable nodes and now avoids the randomized exit position.
- Fake ofuda visuals were made less obvious:
  - Fake paper size is closer to the real ofuda.
  - Red curse overlay opacity reduced substantially.
  - Fake border/edge geometry is thinner and closer to the real ofuda color.
  - Seal red is darker and less saturated.

## 2026-07-02 Mansion Placement Fixed-Position Root Cause Fix

- Investigated why mansion breaker/exit still appeared fixed.
- Root causes found:
  - Mansion selection reused the existing `mansionBuilt` / selected-map cache, so a generated mansion could be reused instead of regenerated.
  - Wall-mounted breaker/exit candidates were rejected by the normal collider overlap check because the wall collider itself counted as an obstruction, causing fallback fixed coordinates to be used.
- Fixes:
  - Mansion selection now clears prior mansion runtime objects, mansion colliders, mansion lockers/lights, cached key/ofuda mansion positions, and path cache before rebuilding.
  - Added a non-wall collider overlap check for wall-mounted mansion breaker/exit candidates.
  - Mansion desk/shelf groups are now registered as mansion runtime objects so they can be cleaned up before regeneration.
- Verification note:
  - Repeated mansion starts should now rebuild mansion layout and reselect breaker/exit candidates instead of using stale or fallback fixed positions.

## 2026-07-02 Mansion Breaker / Exit Randomization Follow-up

- Further widened mansion breaker/exit placement so candidates can be selected from more wall-facing corridor nodes instead of over-restricting to a small set of far outer-wall candidates.
- Replaced `sort(() => Math.random() - 0.5)` candidate shuffling for these placements with a Fisher-Yates shuffle using Web Crypto randomness when available.
- Invalidated the collider spatial cache after mansion runtime cleanup so regenerated mansion wall/object collision checks cannot reuse stale buckets.
- Fallback positions are now selected from shuffled reachable mansion nodes instead of fixed hardcoded coordinates.

## 2026-07-02 Locker Front Clearance Fix

- Added a locker-door front clearance zone so desks/shelves cannot spawn in the usable space directly in front of lockers.
- Furniture placement now rejects objects that would block any existing locker doorway.
- Mansion locker placement, including fallback/forced locker passes, now rejects locker positions whose doorway would face existing furniture.
- This should prevent getting stuck immediately after exiting a locker because a desk or shelf spawned in front of it.

## 2026-07-03 Mansion Utility Wall-Offset / Mobile Eye Scare Fix

- Mansion exit fallback now prefers wall-facing candidates before any generic fallback.
- Mansion exit interaction/glow/marker position now uses the wall-side door position instead of the corridor cell center, preventing the exit from appearing in the middle of the hallway.
- Mansion breaker fallback now also prefers wall-facing candidates.
- Mansion locker placement now avoids exit, breaker, and shop positions so lockers cannot be generated behind/in front of breaker panels.
- Mobile eye scare rendering now uses `background-size: contain` and a reduced JS scale pulse so the full image remains visible on phone screens.

## 2026-07-03 Mansion Wall-Snap Correction

- Corrected mansion exit/breaker mount offsets to snap their visible mesh against the inner wall surface instead of using loose center-based offsets.
- Exit door and breaker panel centers are now calculated from wall inner surface minus half the object thickness.
- Breaker switch and light are offset back toward the corridor side after the panel is wall-mounted.
- Emergency mansion utility fallbacks no longer use arbitrary shuffled sides first; wall-facing candidates remain preferred to avoid corridor-center placement.

## 2026-07-03 Mansion Wall Candidate Probe Fix

- Fixed the mansion wall-facing candidate test:
  - Previous logic probed about 2m from the current cell, which is still inside the same 4m cell span and could incorrectly treat open corridor directions as walls.
  - New logic probes one full `CELL` away, so only directions without an adjacent mansion node are treated as real walls.
- Applied the same full-cell wall probe to mansion locker wall checks.
- Fixed north/south `makeWallTextPlate` orientation and offset so exit signs face the corridor instead of the wall/back side.

## 2026-07-03 Mansion Utility Fixed-Position Regression Fix

- Root cause found for repeated left/top fixed placement:
  - `nearestMansionNode()` intentionally falls back to `mansionNodes[0]` when no node is found, so it was unsafe for wall-existence checks.
  - Wall checks using it could report a node even when no adjacent node existed, emptying placement candidates and forcing fallback behavior.
- Added `hasMansionNodeNear()` for exact wall-neighbor checks without fallback.
- Exit/breaker placement now uses `choosePlacement()` and `randomWallPlacement()`:
  - Randomized wall placements are selected from valid wall candidates.
  - Interior maze-wall candidates are preferred when enough exist, avoiding repeated map-edge placement.
  - Final fallbacks are randomized instead of fixed `mansionNodes[0]`.
- Breaker fallback now also requires distance from the exit approach cell where possible, preventing breaker and exit from spawning together.

## 2026-07-04 School Enemy Anti-Stuck / Player Bob Removal

- Removed walk/run camera bob from `updatePlayer()` so movement no longer adds vertical sway.
- School enemy destination selection now prefers pathable nodes that `canEnemyMoveTo()`.
- Added `nearestPathableNodeTo()` to avoid routing toward furniture/wall-blocked node centers.
- Strengthened school enemy wall recovery:
  - Added diagonal, side, and back-side wall-slide options.
  - Increased minimum slide step to avoid tiny wall-edge jitter.
  - Added `wallSlideAttempts` tracking and earlier recovery when sliding is not improving.
  - Recovery now snaps to a reachable nearby node if the enemy is stuck/inside collision.
- School enemy AI updates more frequently at non-urgent distances to reduce large-step collision/stuck behavior.

## 2026-07-04 School Enemy Desk Gap Fix

- Increased desk-set collider footprint to include the chair/desk group rather than only the tabletop area.
- Enemy movement collision now adds extra safety padding around furniture colliders.
- This is intended to stop the school enemy from routing into narrow desk-to-desk gaps and getting stuck there.
- Added oscillation recovery for school enemy:
  - Tracks when the enemy remains in a tiny area while moving.
  - If stuck oscillating in a room, jumps the enemy to that room's connector/entrance node.
  - The jump has a cooldown and then resumes chasing/searching/roaming depending on alert state.
- Added narrow-space handling:
  - School enemy can perform a short furniture-hop that ignores furniture collision only.
  - Furniture-hop is blocked by wall collision and by a wall line test, so it cannot pass through walls.
  - Corridor oscillation can now escape to a nearby junction/farther pathable node.
- Pathfinding now uses a passable connected-area check:
  - BFS skips nodes the enemy cannot actually stand on.
  - If the requested target is not connected, destination is replaced by the closest reachable node in the same passable component.

## 2026-07-04 Startup Regression Fix

- Fixed a startup/runtime regression caused by the previous pathing helper patch being inserted into the wrong function.
- `colliderCandidatesInAabb()` was accidentally returning filtered path-node data instead of collider candidates; restored it to return collider data.
- Moved `reachableSchoolNodesFrom()` to the pathfinding section after `findPath()`.
- Verified locally on a clean strict dev port:
  - Title screen appears.
  - School start enters gameplay.
- Note: port `5173` was serving a different Vite app during debugging, so use a strict/open port when validating this project locally.

## 2026-07-05 School Enemy Science Room / Sound Chase Fix

- Loosened school enemy furniture padding while keeping wall collision strict, so the enemy can enter furniture-heavy rooms such as the science room more reliably.
- Pathfinding now treats furniture-blocked-but-wall-clear nodes as usable for the school enemy, relying on short furniture hops during movement.
- Replaced instant enemy relocation used by stuck/oscillation recovery with a visible recovery jump:
  - Enemy follows a short arc from current position to the recovery point.
  - The jump is blocked by walls and only helps escape furniture/narrow-object traps.
- Running player footstep hearing radius increased from 21m to 31.5m.
- Added precise sound-source routing for max-alert school enemy behavior:
  - When detection is 100% or alert memory is maxed, heard noise routes to the reachable node closest to the emitted sound source.

## 2026-07-05 Science Room Door / Source Chase Follow-up

- Added school doorway/connector clearance checks for furniture and cover objects.
- Prevented cover objects from spawning in room entrances; this specifically targets the science-room entrance blockage case.
- Moved science-room fixtures toward room edges and reduced central clutter so the school enemy has enough width to enter and pass between objects.
- Removed extra furniture padding from school enemy movement checks while preserving wall collision.
- School breaker placement now avoids school lockers, doorway connectors, and existing non-wall objects more aggressively.
- Mansion locker utility clearance was widened so lockers are less likely to appear in front of/behind breaker panels.
- Sound-source chasing now stores the original emitted sound point and appends an exact final target when wall-clear.
- At high detection, sound chase speed ramps up gradually up to roughly double speed instead of staying at normal investigate speed.

## 2026-07-05 Object Restore / Room Sound Pursuit Fix

- Reverted the overly broad school furniture doorway/connector exclusion that caused many room objects to disappear.
- Cover objects now only avoid the immediate room-door sign area instead of all room connector path cells.
- Restored science/nurse/music room special objects to always render while keeping the newer wall-side placement.
- Restored sink rows so they render and keep furniture collision.
- Sound-source routing now detects the room containing the emitted sound and prioritizes path nodes inside that same room.
- Sound-source pursuit now retries routing while the enemy has not reached the original source point, instead of ending at a nearby wall-side node.
- Sound pursuit acceleration now applies during investigating/searching too, not only full hunting.

## 2026-07-05 Room-Aware Sound Pursuit / Object Density Fix

- Sound events now include the school room ID where the sound was emitted.
- School enemy sound pursuit uses the emitted room ID and prioritizes nodes inside that room, preventing wall-side/outside nodes from satisfying the pursuit.
- Sound pursuit now disables the blocked-wall give-up logic while an original sound source is active.
- Re-routing preserves the sound room ID so repeated path attempts still target the room interior.
- Furniture placement no longer uses oversized circular spacing; it now uses actual object half-width/half-depth spacing to preserve object density.
- Enemy collision against furniture was loosened while wall collision remains strict, allowing the enemy to pass between tighter object gaps.
- Entrance clear zones remain explicit and localized so objects avoid doorways without deleting most room props.

## 2026-07-05 Object Generation Density Restore

- Removed the remaining hard placement rejection from school desk and shelf generation.
- Desks and shelves now always render instead of disappearing when close to walls/furniture.
- Desk and shelf collider footprints were reduced slightly rather than enlarging object spacing.
- Cover objects near a doorway are moved deeper into the room instead of being skipped, preserving object count while keeping entrances clear.
- This keeps room prop density high while relying on looser enemy-vs-furniture collision for navigation.

## 2026-07-05 School Layout / Prop Visual Fix

- Increased school map scale by enlarging the grid cell size, making the school roughly twice as spacious.
- Darkened/thickened desk leg rods so the four white-stick artifact near desks is no longer prominent.
- Fixed nurse-room bed accessory placement so the pillow/bed item stays aligned with the bed.
- Entrance-adjacent cover objects are pushed deeper into the room instead of blocking doorways.
- Room boundary walls now respect carved adjacent walkable cells, allowing more room-to-room passages.
- Added more random room-to-room carve paths.
- Blackboard/shelf props are skipped on room edges that have been opened as passages so they do not visually block new openings.
- School enemy detects repeated local oscillation sooner and switches to an outer/perimeter route instead of staying in the same spot.
- Flashlight battery drain increased 3x.

## 2026-07-05 Room Wall / AI Route Regression Fix

- Fixed room walls being removed too broadly:
  - Rooms now register only 2-3 explicit openings.
  - All non-opening room edges are walled again.
- Added right-side school rooms to make the wider horizontal map actually populated.
- Expanded school width by increasing `GRID_W`.
- Enemy corridor routing now considers multiple vertical lanes (`gx` 6/12/18), not only the old left-side lane.
- Desk chair backs were removed/flattened to eliminate the bright white vertical stick artifact.
- Blackboard/shelf removal now only happens on actual registered room openings, not merely adjacent walkable cells.

## 2026-07-05 Bounds / Map Sync / Collision Loop Fix

- Removed the `beforeunload` page refresh warning.
- Fixed school bounds to derive from `GRID_W`, `GRID_H`, and `CELL` instead of old hardcoded values; this prevents the expanded right side from becoming an unmanaged/white area.
- Full-map room wall rendering now respects registered room openings, matching the actual generated walls after thin/open wall changes.
- Enemy no longer repeats the same object collision loop indefinitely:
  - After repeated slide attempts, sound pursuit re-routes to the source.
  - Normal routes skip the stuck node or switch to an outer route.

## 2026-07-05 Expanded Wing Route / Enemy Empty-Path Fix

- Added guaranteed right-wing school corridors:
  - Horizontal lanes at gz 2/9/16 from gx 6 to gx 18.
  - Vertical lanes at gx 12 and gx 18.
- Increased school corridor lights from 4 to 12 so the expanded right wing is not a black void.
- Fixed enemy destination selection treating an empty path/current node as a successful route when the intended point was still far away.
- Random enemy roaming now tries multiple distant candidates and avoids selecting near/current nodes that produce no movement.

## 2026-07-05 Cell Size Regression Fix

- Reverted global `CELL` from 5.6 back to 4.
- Root cause:
  - `CELL` is shared by school and mansion generation.
  - Enlarging `CELL` broke mansion floor/wall/ceiling placement and contributed to void/black areas.
- School horizontal expansion is now handled by `GRID_W = 25` and added right-wing rooms/corridors, not by changing cell size.
- Build verified after the revert.

## 2026-07-05 Map Void Root Fix

- Root cause found after continued black/void areas:
  - Mansion coordinates overlapped the expanded school coordinate range.
  - Coordinate-based cleanup could delete valid floor/ceiling meshes from the other map.
  - Keeping map caches around after switching also risked half-deleted map geometry.
- Moved mansion generation farther away from the school with `MANSION_OFFSET_X`.
- Replaced hard-coded mansion bounds with constants derived from mansion grid limits.
- Restored active-map cleanup so only the selected stage remains during play.
- Added map surface registration for generated floors and ceilings.
- Added `validateMapIntegrity(mode, repair)` and browser debug hook:
  - `window.__validateMapIntegrity('school', true)`
  - `window.__validateMapIntegrity('mansion', true)`
  - `await window.__debugWalkAllMapCells('school')`
  - `await window.__debugWalkAllMapCells('mansion')`
- Game start now validates the selected map and repairs missing floor/ceiling surfaces before play begins.
- Verified:
  - `node --check src/main.js`
  - `npm run build`

## 2026-07-05 Out-of-Range Running Alert Retune

- Increased out-of-range running alert gain from `0.75` to `1.5`.
- Walking ambient alert gain was left unchanged.

## 2026-07-05 Key Pickup Enemy Position Alert

- Added enemy notification when a real key item / real ofuda is picked up.
- School:
  - Sends the pickup position and room id to SONAR.
  - Starts a routed search/hunt path to that pickup location.
  - Raises detection to at least 58 and increases alert memory slightly.
- Mansion:
  - Sends the pickup position to the ghost route target when not stunned.
  - Raises detection to at least 52.
- Fake ofuda trap behavior was left unchanged.

## 2026-07-05 Train / Daruma Stage Added

- Added a third title-screen map option: train stage.
- Added public audio assets for the Daruma chant:
  - `daruma_da1.mp3`, `daruma_ru.mp3`, `daruma_ma.mp3`, `daruma_sa.mp3`, `daruma_n1.mp3`, `daruma_ga.mp3`, `daruma_ko.mp3`, `daruma_ro.mp3`, `daruma_n2.mp3`, `daruma_da2.mp3`, `daruma_da3.mp3`
- Train stage:
  - Generates a lightweight vertical 10-car train map.
  - Uses a simple Daruma monster at the end of each car.
  - Only forward movement is allowed; running, radar, map, back/left/right movement are disabled.
  - Right mouse button closes the player's eyes while held.
  - The chant UI shows `だるまさんがころんだ`; read characters turn gray.
  - The final `だ` randomly uses `daruma_da2` or `daruma_da3`, turns red, and scales up for 2 seconds.
  - Moving 0.3 seconds after the final `だ` until the next round starts causes Daruma game over.
  - From game 4 onward, a red-eyed ghost can appear behind Daruma; if eyes are open it deals 5 HP every 0.1 seconds.
  - Touching Daruma on game 10 triggers 1 second of noise and resets the player for an 11th final round.
  - Winning the 11th round and touching Daruma clears the stage.
- Verified:
  - `node --check src/main.js`
  - `npm run build`

## 2026-07-05 Train / Daruma Stage Retune

- Title screen:
  - Moved the settings button to the top-right so it no longer clips.
  - Changed the train start button background to red.
- Train stage:
  - Continue now restarts the Daruma train stage from game 1 instead of returning to title.
  - Fixed player start direction to face forward down the train.
  - Added a rear wall behind the start point.
  - Tripled train car length / Daruma distance.
  - Daruma faces away during the chant, turns around on the final `だ`, and faces away again on the next `だ1`.
  - Changed the stop/game-over check to be computed only during the final-`だ` freeze window, preventing stale always-on detection.
  - Moved the Daruma phrase UI below the HP area and reduced size to avoid HUD overlap/clipping.
- Note:
  - The in-app browser instance was unavailable/closed during this handoff, so live browser traversal should be rerun from DevTools using the hooks above if visual confirmation is needed.

## 2026-07-05 Entrance Placement / Enemy Close-Stuck Fix

- Excluded room entrance/connector/opening zones from school window placement.
- Excluded room entrance/connector/opening zones from school breaker and school exit placement.
- Excluded mansion entrance-like junction nodes from mansion breaker and mansion exit placement.
- Added enemy close-range stuck watchdog:
  - If SONAR stays within 5m of the player and fails to escape the local area for 5 seconds, it builds a forced route to the player's nearest room.
  - If SONAR is only looking around within 5m for more than 2.2 seconds, it also tries the same route immediately.
- Added route generation toward the player's nearest room through room connectors/interior nodes.
- Verified after change:
  - `node --check src/main.js`
  - `npm run build`
  - Browser debug walk:
    - School: 331 walkable cells, no missing floor/ceiling
    - Mansion: 131 walkable cells, no missing floor/ceiling

## 2026-07-05 SONAR Global Stuck Recovery Fix

- Removed the 5m-only limitation from SONAR stuck recovery.
- Added global stuck watchdog:
  - If SONAR should be navigating but remains in the same local area, it now forces an unstuck route regardless of distance to the player.
  - Empty-path look-around states recover faster, preventing endless left/right turning.
- Added `forceEnemyUnstuckRoute()`:
  - Clears pause/look-around/cover peek state.
  - Prioritizes route generation to the player's nearest room.
  - Falls back to outer-loop route, then a valid recovery jump if needed.
- Sonar roar no longer clears the current path; it only pauses briefly so roar cannot leave SONAR stuck turning in place.
- Verified:
  - `node --check src/main.js`
  - `npm run build`
  - Browser debug walk:
    - School: 327 walkable cells, no missing floor/ceiling
    - Mansion: 123 walkable cells, no missing floor/ceiling

## 2026-07-05 Mansion Ghost / Roar Damage / Locker Spacing Fix

- Mansion placement:
  - Furniture now checks corridor clearance before spawning.
  - Mansion lockers require wider clearance from furniture and their front/exit points.
  - Forced mansion locker placement also avoids nearby furniture.
- Mansion ghost:
  - Normal movement now ignores furniture/object colliders and only respects walls.
  - Wall phasing remains temporary and now triggers on a 60-second cadence.
  - Mansion path graph now ignores furniture, so furniture clusters should not trap the ghost route.
- Ghost double:
  - If the player is running, the double directly rushes the player from anywhere on the map.
  - It accelerates while the player keeps running.
  - When the player stops running, it loses the player and returns to roaming.
- Ghost illusion event:
  - Each illusion now rushes to the player position captured at spawn time.
  - If it touches the player, it clings to the screen for 5 seconds before disappearing.
- SONAR roar:
  - Roar hit now deals 20 damage if the player is within 30m and not hiding.
  - During the roar, the player takes 1 damage every 0.2 seconds while within 30m and not hiding.
- Verified:
  - `node --check src/main.js`
  - `npm run build`
  - Browser debug walk:
    - School: 330 walkable cells, no missing floor/ceiling
    - Mansion: 126 walkable cells, no missing floor/ceiling

## 2026-07-05 Roar Damage / Alert Gain / Furniture Spacing Fix

- SONAR roar:
  - Changed the roar damage-over-time from 0.2-second chunk ticks to continuous elapsed-time damage.
  - The active roar damage now stops immediately when the player leaves the 30m range or hides.
- Alert gain:
  - Removed duplicate out-of-range movement detection gain from the player movement loop.
  - Kept ambient movement suspicion as the single continuous out-of-range source.
  - Added distance falloff so running far outside detection range raises alert much more slowly.
- Furniture:
  - Removed the four bright vertical bars near desks by replacing visible desk legs with a darker center support.
  - Removed the four white decorative bars near the music-room desk/piano prop.
  - Increased furniture placement padding, especially in the mansion, to leave more passable gaps between objects.
- Verified:
  - `node --check src/main.js`
  - `npm run build`

## 2026-07-05 Train Daruma Polish / Eye Warning Update

- Train Daruma timing:
  - Final `だ` wait interval changed to `0.1–2.0s`.
  - The final `だ` remains red until the next `だ1` starts.
  - 25% of rounds now force every syllable interval to the fastest `0.1s`.
  - Movement failure grace after the final `だ` is `0.5s`.
  - Daruma game-over no longer stops the final `だ` audio.
- Train HUD:
  - Coin, breaker, noise, and detection UI are hidden in train mode.
  - Added PC hint: `右クリックで目を閉じる`.
  - Added mobile bottom-right `目を閉じる` button.
  - Added red `目を閉じろ！` warning while the train ghost is dangerous.
- Train ghost:
  - Ghost eye-open damage changed to `1 HP every 0.1s`.
- Train visuals:
  - Upgraded the Daruma from a simple sphere to a more detailed procedural model with canvas texture, facial parts, belly plate, arms, rings, and a spotlight.
  - Train interior now has segmented seats, gaps, luggage props, side windows/ads, poles, and more ceiling lights so forward movement is easier to read.
  - Added per-car clear banner showing `〇/10 クリア` for roughly 3 seconds.

### Verification

- Run after changes:
  - `node --check src/main.js`
  - `npm run build`

## 2026-07-06 Train Daruma Timing / Visual Follow-up

- Train title button:
  - Train button text is forced white.
  - Added an `おまけ` label above the train button.
- Daruma chant:
  - Final-da movement failure grace changed from `0.5s` to `0.4s`.
  - Removed the late-word slowdown weighting; non-final syllables now use the same random interval range.
  - Added a 10% hyper-speed round where every syllable interval is `0.05s`.
  - Added a 5% skip round: `だ → る → ま → だ2`.
  - During the skip round's final state, only `だるまだ` is displayed and all four characters are red.
  - Removed the visible `1/10` car counter from the HUD.
- Ghost danger:
  - While the train ghost is active and the player keeps eyes closed, a red heartbeat-style overlay is shown.
- Train visuals:
  - Train poles now extend down to the floor.
  - Daruma model face was adjusted toward the provided reference: larger white eyes, gold/red eye rings, heavier brows, and black cheek/moustache details.
- Game over:
  - Ghost game over adds a ghost close-up style background.
  - Daruma game over adds a Daruma close-up style background.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-07 Title UI / SE Volume / Lazy School Start

- Title map button descriptions now render on a second line consistently for school, mansion, and train.
- Train stage subtitle on the title screen is now grey like the other descriptions and displays `？？？`.
- Title screen hides in-game HUD/radar/prompt/mobile gameplay UI while no game is running.
- SE volume slider range was increased to 150% and saved values are clamped to the same range.
- School map cache now starts as not ready, so the school preparation path is entered only after pressing the school start button.
- Removed the old school-start reload fallback so map preparation stays within the selected start flow.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-07 Train Mobile Multitouch Movement

- Train stage no longer hides the mobile movement controls.
- Train stage still hides mobile run/map/flashlight/action buttons to preserve the stage rules.
- Mobile train movement stick now only outputs forward movement; sideways and backward stick input is ignored.
- Mobile close-eyes button now releases pointer capture explicitly, improving simultaneous move / camera swipe / close-eyes touch handling.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-07 Mobile Game Over Input Freeze Fix

- Raised the game-over message screen above remaining mobile/train overlays so it is always tappable.
- `stopMobileGameplayInput()` now clears train eyes-closed state and releases active camera swipe pointer capture.
- Train game-over now forcibly clears eyes-closed/noise/ghost warning overlays, disables gameplay controls, and closes map/breaker overlays.
- Train continue now re-enables mobile controls after resetting the stage.
- HP-zero game-over now also disables mobile gameplay controls and closes map/breaker overlays.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-07 Mobile End-State Transition Fix

- Fixed a deeper mobile freeze where capture state did not transition to the game-over message screen.
- School/mansion capture cutscene now ends with `endGame(false)` instead of immediately respawning.
- Capture start now stops mobile input, closes gameplay overlays, disables mobile controls, and unlocks pointer state.
- End-game state now clears `caught`, settings/shop/map/breaker flags, and removes the caught-cutscene class.
- Mobile camera swipe pointer-move now self-cancels if the game has ended, is caught, loading, or an overlay is open.
- Train game-over now also normalizes modal flags before showing the message screen.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-07 Forced Mobile End Overlay

- Added a body-level `#end-state-overlay` as a fail-safe end/clear popup outside the rotated mobile app container.
- All end states now call `showEndStateOverlay()`:
  - school/mansion capture game over,
  - HP-zero game over,
  - train Daruma game over,
  - train ghost game over,
  - normal clear / train clear.
- The existing `#message-screen` is still populated, but `forceShowMessageScreen()` also applies inline visibility/z-index as a secondary fallback.
- Train continue hides the fail-safe overlay before restarting the train stage.
- This avoids relying only on `.screen.visible`, which can fail on mobile portrait/landscape transforms or stale overlay states.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Daruma Cleanup / Hidden Invincible

- Daruma model cleanup:
  - Removed the belly kanji/cross-like mesh that looked like a `+` near the mouth/body area.
  - Removed the gold eye ring that appeared as a mysterious yellow horizontal bar near the eyes.
  - Replaced box eyebrows with capsule eyebrows to reduce flat bar artifacts.
- Daruma game over:
  - Darkened and sharpened the Daruma close-up background to feel more threatening.
- Skip round display:
  - During the 5% `だるまだ` round, the normal phrase remains visible while `だるま` fills red.
  - On the final `だ2`, the display switches to the short red `だるまだ` format.
- Ghost damage event:
  - Ghost event duration is now `1–3s`.
  - After ending, the next event is delayed `20–60s`.
  - The closed-eye red overlay is removed immediately when the ghost event ends.
  - Removed the visible `ドクン` text; only the red pulse remains.
- Hidden debug assist:
  - Holding number `5` in train mode makes the player invincible, stops the Daruma count/update, clears ghost danger, and restores HP to full.
- Train phase reward:
  - Each train phase clear restores `40 HP`.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Daruma / Ghost Presentation Fix

- Daruma 3D cleanup:
  - Removed the red eye-ring meshes that appeared as red bars over the Daruma eyes.
  - Removed the eyebrow meshes entirely because they made the Daruma look worried/cute.
  - Kept the large black eyes / face panel direction and adjusted the model closer to the provided Daruma reference.
- Train ghost event:
  - Ghost event duration changed to `3–6s`.
  - Ghost reappearance interval changed to `10–30s`.
  - While active, the ghost is fixed roughly 2m in front of the player so it is visible during the event.
- Game over visuals:
  - Ghost game over now uses the existing eye scare image.
  - Daruma game over now uses `public/images/daruma_gameover.png`, copied from the provided reference image.
  - Game over text card receives a darker background / lighter text for readability.
  - Daruma game over clears active train ghost state so the Daruma and ghost presentation do not overlap.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Game Over Preload / Ghost Model Follow-up

- Game over image lag:
  - Added startup preloading for `eye_scare.png` and `daruma_gameover.png` so train game-over backgrounds can appear immediately.
- Train ghost:
  - Replaced the train ghost's simple teru-teru-bozu silhouette with a woman-ghost style procedural model based on the mansion ghost:
    - white robe/capsule body,
    - long black hair strands,
    - face shadow,
    - hands/arms,
    - red eye lights.
- Train game 10 reset:
  - The noise transition before game 11 now lasts 3 seconds.
  - The next round starts after the 3-second noise effect finishes.
- Hidden debug assist:
  - Holding number `5` now also triples train-stage forward movement speed.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Ghost Fallback Cleanup

- Train ghost display fix:
  - The procedural train ghost fallback is now hidden by default so the teru-teru-bozu-like silhouette does not overlap the intended ghost.
  - Train mode attempts to load `public/models/yurei_woman_v1.glb` as `TRAIN_YUREI_WOMAN_GLB`.
  - If the GLB loads, the eye-image fallback is hidden and only the 3D ghost is shown.
  - If the GLB fails or is still loading, only an `eye_scare.png` billboard is shown instead of the old white cone/capsule fallback.
  - Red point lights/dots from the fallback are also hidden with the fallback to avoid extra overlapping red marks.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Daruma / Stage 10 Clear Display

- Daruma model cleanup:
  - Removed the remaining black facial stroke meshes that could appear as unwanted black bars/sticks on the Daruma face.
  - Kept the large black eyes and red body texture details intact.
- Stage 10 clear banner:
  - When the 10th train round is cleared, the clear banner now displays `10/11 クリア`.
  - The `11` portion is highlighted in red to make the hidden final round obvious.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Ghost Image-Only Performance Fix

- Train ghost performance:
  - Removed the train ghost GLB/procedural 3D display path to avoid stutter when the ghost event starts.
  - The train ghost event now uses only the preloaded `eye_scare.png` billboard.
- Train ghost event timing:
  - Extended the event duration from 3-6 seconds to 5-10 seconds.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Daruma Face Rework

- Daruma model:
  - Replaced the protruding face/eye mesh parts with a flat canvas-textured face panel.
  - Removed the red mouth-area bulge so the silhouette reads more clearly as a traditional Daruma.
  - Face panel now uses beige paper texture, large black eyes, black brush patterns, red nose strokes, and a thin dark mouth line.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Train Stage Count 13

- Train stage length:
  - Increased the Daruma train stage count from 11 to 13.
  - Stages after the 10th car reuse the same 3-second noise/reset presentation that was previously used for stage 11.
  - Clear banners now use the total `13`; late-stage banners highlight the `13` in red.

### Verification

- `node --check src/main.js`
- `npm run build`

## 2026-07-06 Daruma Horror Model Preview

- Created a non-integrated Daruma model preview for visual review before replacing the in-game enemy.
- New files:
  - `tools/create-daruma-horror-model.mjs`
  - `public/models/daruma_horror_preview.glb`
  - `daruma_model_preview.html`
- Direction:
  - Use the existing Daruma game-over image as the visual reference.
  - Avoid cute/rounded facial expression.
  - Remove protruding red mouth-area geometry.
  - Favor old lacquer, dark hollow eyes, worn gold marks, scratches, and horror lighting.
- Important:
  - This preview model is not yet wired into `src/main.js`.
  - Wait for visual approval/adjustment before replacing the active train enemy model.

### Verification

- `node tools/create-daruma-horror-model.mjs`
- `node --check tools/create-daruma-horror-model.mjs`
- `npm run build`

## 2026-07-06 Daruma Preview Page Fix

- Fixed `daruma_model_preview.html` showing black / failing to load:
  - Added `daruma_model_preview.html` as a Vite build input.
  - Replaced direct `node_modules` imports with Vite-managed bare imports.
  - Changed model URL from `./public/models/daruma_horror_preview.glb` to `./models/daruma_horror_preview.glb`.
  - Added a visible error message if GLB loading fails.
- Confirmed the preview page renders the Daruma model locally after the fix.

### Verification

- `npm run build`
- Local preview screenshot check via `http://127.0.0.1:4174/daruma_model_preview.html`

## 2026-07-06 Daruma Preview Brightness Fix

- Fixed the Daruma preview still appearing too black:
  - Brightened the preview background from near-black to a dark brown inspection backdrop.
  - Increased exposure and added stronger front/top lights for shape review.
  - Brightened the preview GLB materials so the red shell, beige face plate, and gold marks do not crush into black.
  - Regenerated `public/models/daruma_horror_preview.glb`.
- This remains a preview-only asset and is not yet wired into the train game enemy.

### Verification

- `node tools/create-daruma-horror-model.mjs`
- `npm run build`
- Local preview screenshot check via `http://127.0.0.1:4174/daruma_model_preview.html`

## 2026-07-06 Daruma Texture Preview Rework

- Reworked `daruma_model_preview.html` after feedback that the square face panel was unacceptable.
- The preview now uses `public/images/daruma_gameover.png` directly as the front texture.
- The texture is cropped and masked into a Daruma-shaped oval instead of using a square face plate.
- Kept a simple dark red ellipsoid behind the image texture only to give the preview volume.
- This is still a preview-only approach; the active train enemy in `src/main.js` has not been replaced yet.

### Verification

- `npm run build`
- Chat screenshot exported to `daruma_texture_preview_chat_tight.png`

## 2026-07-06 Daruma Texture Silhouette Crop

- Adjusted the Daruma texture preview after feedback that only a vertical slice was visible.
- Expanded the texture crop horizontally, then replaced the simple ellipse with a wider custom Daruma silhouette mask.
- Matched the rear/side shell red material closer to the source texture red so side/background bleed is less noticeable.
- Latest chat/reference screenshot:
  - `public/images/daruma_texture_preview_matched_red.png`
- Tradeoff:
  - The current version preserves more side width and gold markings.
  - Some side seam visibility remains because the preview still uses a front image plane plus a rear shell, not a full UV-unwrapped 3D texture.

### Verification

- Chat screenshot exported from `daruma_model_preview.html`.

## 2026-07-06 Daruma Texture Implemented In Train Stage

- Implemented the approved Daruma preview direction in the actual train-stage enemy.
- `makeDarumaMonster()` now:
  - uses `public/images/daruma_gameover.png` as the front texture source,
  - crops and masks it with the same wider Daruma silhouette logic used in the preview,
  - removes the old square/flat hand-drawn face panel,
  - removes the procedural arms/gold torus parts that no longer match the image texture,
  - uses a rear/side red shell color matched to the source texture.
- The preview page remains available for visual adjustment, but the in-game train Daruma now uses the same texture approach.

### Verification

- `node --check src/main.js`
- `npm run build`
