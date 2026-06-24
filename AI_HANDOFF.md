# AI 作業引継ぎメモ - IT HEARS YOU

## 作業日
2026-06-24

## ユーザー報告
- 4Kディスプレイでウィンドウ最大化すると処理落ちする。
- 前回のFPS制限版は、前より処理落ちがひどくなった。
- ユーザーから「敵側がプレイヤーが離れすぎているのに捕獲判定を常時処理しているからでは？」という指摘あり。

## 今回の方針
前回版ではなく、元の `IT HEARS YOU.zip` を基準に修正。
FPSを30固定する制限は入れない。
4K描画バッファ対策と、敵AIの遠距離判定スキップを同時に実施。

## 変更内容
### `src/main.js`
1. WebGL内部描画サイズを最大1280x720へ制限
   - `resizeRenderer()` を追加。
   - CSS上は canvas を `100% x 100%` 表示。
   - 4K最大化時もWebGLバックバッファは720p相当に抑える。
   - `renderer.setSize(renderWidth, renderHeight, false)` を使用。
   - resize時も同じ制御を適用。

2. FPS制限を削除/未導入
   - 前回の30FPS固定がカクつきを悪化させた可能性があるため、`requestAnimationFrame` の自然な更新に戻した。

3. 敵AIの遠距離捕獲・視線判定をスキップ
   - `PERFORMANCE.enemySenseFarDistance = 14` を追加。
   - プレイヤーが遠い場合、重い `hasLineOfSight()` と捕獲判定を実行しない。
   - ただし敵の巡回、探索、足音反応は継続する。

4. 捕獲判定の条件を明確化
   - `PERFORMANCE.enemyCaptureDistance = 1.45`
   - この距離未満の時だけ近距離捕獲用の `hasLineOfSight()` を実行。
   - 遠距離で捕獲判定が毎フレーム走らないようにした。

5. 毎フレームの一時オブジェクト生成を削減
   - `enemyEyeTemp`, `playerEyeTemp`, `enemyForwardTemp`, `enemyMoveDirection` を再利用。
   - `clone()` や毎フレーム `new THREE.Vector3()` を減らした。

6. UI要素の毎フレーム `querySelector` を削減
   - `ui` キャッシュを追加。
   - `#danger-flash`, `#detect-bar`, `#detect-value`, `#alert-text`, `#move-mode`, `#battery-value`, `#battery-bar` を使い回し。

7. デスクトップのアンチエイリアスと影を無効化
   - `antialias: false`
   - `renderer.shadowMap.enabled = false`
   - 4K環境でのGPU負荷を下げるため。

## ビルド確認
- `npm install`
- `npm run build`
- ビルド成功。
- JSチャンクサイズ警告は出るが、元構成由来で実行失敗ではない。

## 次に見るべき場所
まだ重い場合は以下を優先確認。
1. `updateRadar()`
   - Canvas 2Dミニマップを20FPSで全描画している。
   - 低スペック環境では10FPS化、または非表示時停止が有効。
2. `updateLight()`
   - 鍵アイテム全件の回転/上下アニメを毎フレーム更新している。
3. WebGLポスト処理は現状なし。
4. Three.jsのジオメトリ数が多いため、壁/床/天井の結合やInstancedMesh化が次の大きな軽量化候補。

## 注意
- 前回の30FPS固定は戻さないこと。
- 720p固定は「CSS拡大」で行うこと。canvas自体を画面サイズに戻すと4Kで再び重くなる。
