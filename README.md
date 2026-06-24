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

## Performance note / 4K display mitigation

This build caps the internal WebGL render target to approximately 1280x720 pixels and scales the canvas to the full browser window with CSS. This keeps fullscreen 4K displays from forcing native 4K WebGL rendering. Shadows, antialiasing, and high-DPI pixel ratio rendering are disabled for stable lightweight play.

AI handoff details are recorded in `AI_HANDOFF.md`.
