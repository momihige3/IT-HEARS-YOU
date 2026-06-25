# IT HEARS YOU

Three.js + Vite で制作した、一人称視点の短編3Dステルスホラーゲームです。

## 操作

- `WASD`: 移動
- `Mouse`: 視点操作
- `Shift`: 走る（速いが敵に気づかれやすい）
- `E`: 調べる / ロッカーに隠れる
- `F`: 懐中電灯のON/OFF

## ローカル起動

```bash
npm install
npm run dev
```

## GitHub Pages

`main` ブランチへpushすると、GitHub Actionsが自動でビルド・公開します。リポジトリの **Settings → Pages → Source** は **GitHub Actions** を選択してください。


## Performance notes

This build keeps the game visually fullscreen, but caps the internal WebGL render buffer around 1280x720.
It also skips expensive enemy line-of-sight and capture checks while the player is outside the enemy's direct sensing range.
The previous 30 FPS limiter approach was not used because it can increase visible stutter on some displays.

See `AI_HANDOFF.md` for the implementation handoff notes.


## 2026-06-25 Deep Performance Fix

This build adds a deeper performance pass for 4K/fullscreen stutter:

- Static maze/wall/floor/cover/exit box meshes are merged by material to reduce WebGL draw calls.
- Internal render size remains capped for fullscreen use.
- HUD, interaction prompt, radar, light/key animation, and enemy vision debug line updates are throttled.
- A small bottom-right performance panel shows FPS, draw calls, triangles, and actual drawing buffer size.

Use the performance panel to confirm whether the issue is draw-call count, render buffer size, or something outside the Three.js scene.
