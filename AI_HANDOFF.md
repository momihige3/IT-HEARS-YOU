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
