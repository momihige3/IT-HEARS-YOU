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
