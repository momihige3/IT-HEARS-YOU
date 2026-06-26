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
