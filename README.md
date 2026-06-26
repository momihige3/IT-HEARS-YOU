# IT HEARS YOU - Trap/Roar Update

Implemented changes:
- Traps are not visible while breaker is OFF.
- Traps become visible while breaker is ON.
- When a trap is triggered, SONAR ignores distance and rushes to the trap location at max speed.
- SONAR roar no longer displays toast/log messages.
- SONAR roar shakes the screen instead.

Build note:
- Source files are updated.
- If local build is unavailable, push to GitHub and let GitHub Actions build/deploy.
# IT HEARS YOU

First-person stealth horror prototype.

## Latest changes

- Enemy safe spawn and wall-embed recovery.
- Breaker and goal plates are fixed to walls, not billboarding sprites.
- Removed periodic screen/flashlight flicker during normal gameplay.
- Keys now spawn away from colliders and objects.
- SONAR can place floor sound traps that lure it when triggered.

## Deploy

GitHub Pages is deployed through GitHub Actions.

Important: package-lock is intentionally omitted because older generated locks may include private registry URLs.


## 2026-06-26 HP / Roar / Trap / Healing Update
- Roar now shakes the screen for 3 seconds.
- If the player is inside roar range, movement is locked for 5 seconds.
- Added player HP system: max HP 100.
- Noise traps deal 40 damage and trigger a red screen flash.
- Random healing items spawn every 60-120 seconds.
- Healing items restore 30 HP and trigger a green screen flash.
- Healing items avoid walls, colliders, keys, breaker, exit, and active traps.

## 2026-06-26 Gameplay balance update

- HP number display removed; the HP UI is now a thicker bar only.
- Healing item pickup no longer shows a toast/log.
- Walking sound radius increased from 2 to 3.
- Walking sound alert gain reduced.
- Running sound alert gain increased.
- Breaker placement is constrained to a breaker-room wall.
- One healing item is guaranteed at game start and respawn.
- Healing items cannot be consumed at full HP.
- Roar knockdown emits a small stumble sound with radius 6 and slight alert gain.
