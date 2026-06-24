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

## 軽量描画設定

4Kなど大きな画面で最大化しても重くなりすぎないよう、ゲーム画面は全画面表示のまま、内部のWebGL描画解像度をPCでは最大720p相当に制限しています。
作業履歴とAI間の引継ぎ内容は `AI_HANDOFF.md` を確認してください。

