# AI作業引継ぎファイル - IT HEARS YOU

## 最新対応
- 4Kディスプレイでウィンドウ最大表示にした際の処理落ち対策を追加。
- Three.js の内部描画サイズを最大 1280x720 相当、約92万ピクセルに制限。
- 画面上は canvas を CSS で 100% 表示し、内部720p描画を拡大表示する方式に変更。
- `renderer.setPixelRatio(1)` 固定。
- `renderer.setSize(width, height, false)` を使用し、CSSサイズと内部描画サイズを分離。
- リサイズ時も `getRenderSize()` で内部描画サイズを再計算。
- WebGLアンチエイリアスを無効化。
- 影描画を無効化。
- 描画ループを 30 FPS 上限に制限。
- 全画面CSSグラデーションの一部を軽量な半透明＋box-shadowに変更。

## 変更した主なファイル
- `src/main.js`
  - `INTERNAL_RENDER_WIDTH = 1280`
  - `INTERNAL_RENDER_HEIGHT = 720`
  - `TARGET_RENDER_FPS = 30`
  - `getRenderSize()` 追加
  - renderer初期化、resize、animateを軽量化
- `src/style.css`
  - canvasをCSS 100%拡大表示
  - vignette / danger flash の重い全画面radial-gradientを軽量化
- `AI_HANDOFF.md`
  - AI間で作業内容を共有するため追加

## 注意
- 画質より軽さ優先の修正。
- 4K最大化でも内部描画は720p相当になる。
- さらに重い場合は、次に以下を検討する。
  - `TARGET_RENDER_FPS` を 24 に下げる
  - HUD/ミニマップ更新頻度をさらに下げる
  - PointLight数を減らす
  - 壁や床のBoxGeometryを結合してdraw callを減らす
