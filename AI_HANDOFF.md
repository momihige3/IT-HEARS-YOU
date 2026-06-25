# AI作業引継ぎ - IT HEARS YOU

## 2026-06-25 PERF CONFIRMED 960

目的: 4K最大化時の処理落ち調査と軽量化。前回までの修正版がユーザー環境で反映確認できなかったため、今回は起動確認用の目立つ表示を追加。

### 目に見える確認表示
- 左上: `PERF CONFIRMED 960`
- 左下: `PERF-CONFIRMED-960-20260625 / FPS / draw / tris / render / window`

これが表示されない場合、修正版ではなく古いビルドを起動している。

### 実装内容
- WebGL内部描画を最大960x540相当に制限。CSSで画面いっぱいに拡大表示。
- `renderer.setPixelRatio(1)` 固定。
- アンチエイリアス無効。
- 影描画無効。
- 通路ライト数を削減。
- レーダー更新を20fps相当から6fps相当に間引き。
- HUD更新を10fps相当に間引き。
- インタラクション判定を約8fps相当に間引き。
- FPS/draw/tris/render/window の診断表示を追加。

### 次に見るべき場所
表示が出ているのに重い場合は、左下の数値を使って原因を分ける。
- FPS低い + draw/tris高い: 3D描画負荷。メッシュ結合やマテリアル削減。
- FPS低い + draw/tris低い: JS/DOM/CSS/入力処理が原因。Chrome PerformanceでMain Threadを見る。
- renderが960x540より大きい: `applyRenderCap()` が効いていない。
