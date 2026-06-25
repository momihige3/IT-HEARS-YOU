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


## Performance build: true 720p virtual screen

This package includes a 4K performance fix that keeps the whole game in a fixed 1280x720 virtual screen and scales it up visually. This caps WebGL, HUD, radar, vignette, danger flash, and other full-screen UI layers instead of only reducing WebGL resolution.

A diagnostic overlay appears at the bottom-left. The correct build shows:

`FPS <number> / draw <number> / 1280x720 / TRUE 720P`

If that overlay does not appear, old files are being launched or served from cache.
