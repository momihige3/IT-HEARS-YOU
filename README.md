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


## Performance diagnostic build

This build shows a top-left marker: `PERF FIX ACTIVE`.
If that marker is not visible, an older build is being launched.

The WebGL internal render size is capped to 960x540 and stretched to the window.
The bottom-left panel shows FPS, draw calls, and the actual WebGL drawing buffer size.
