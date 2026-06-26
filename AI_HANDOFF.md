# AI作業引継ぎ - IT HEARS YOU

## 2026-06-25 現在の作業状況

### ユーザー要望
- 4Kサイズのウィンドウで重くなる問題を修正し、画質をどこまで上げられるか調整中。
- 敵AIが遮蔽物の影に隠れたプレイヤーを見つけにくいため、通路方向の往復だけでなく、オブジェクトの横や裏を確認する探索ロジックを追加する。
- ゲーム中のバック音がスピーカーノイズのように聞こえるため、洞窟内の空気音に近い環境音へ変更する。
- 道の中央の遮蔽物に隠れた時、敵が遮蔽物を貫通してゲームオーバーにならないようにする。
- ミニマップをソナー式にし、音波紋の表示頻度を大幅に下げる。
- 校舎風のランダムマップ、地下ブレーカー、ランダム非常口、懐中電灯の自然回復を追加する。

### 4K負荷対策の現状
- 左上に `PERF CONFIRMED 960` を表示。
- 左下に `PERF-CONFIRMED-960-20260625 / FPS / draw / tris / render / window` を表示。
- WebGL内部描画は最大960x540相当に制限し、CSSで画面いっぱいに拡大表示。
- `renderer.setPixelRatio(1)` 固定、アンチエイリアス無効、影描画無効。
- 通路ライト数を削減。
- レーダー、HUD、インタラクション判定の更新頻度を間引き。

### 今回追加した内容
- 遮蔽物ごとに横・裏を確認する候補地点を作る `coverSearchNodes()` を追加。
- 探索中の敵が遮蔽物周辺へ移動し、到着後に遮蔽物方向へ見回すように変更。
- プレイヤーと敵が同じ遮蔽物付近にいる場合、警戒度に応じた確率で「覗き込み」を行い、成功した時だけ感知度が伸びるように変更。
- 追跡中に遮蔽物でプレイヤーへ視線が通らず、近距離で詰まった場合は `PASSING_BY` に切り替える。
- `PASSING_BY` 中は感知度と警戒状態を強制的に落とし、プレイヤー付近を通り過ぎた後にランダムな角度で振り返る。
- `PASSING_BY` 中は短時間だけ新しい足音への反応を無視し、同じ遮蔽物前で追跡へ戻る往復を抑える。
- 敵移動に `canEnemyMoveTo()` を追加し、遮蔽物や壁コライダーを貫通して進まないように変更。
- 捕獲判定は `visible` または明確な近距離視線が通っている場合に限定し、遮蔽物越しのゲームオーバーを抑制。
- ミニマップは自分中心の拡大ソナーへ変更。`sonarReveals` と回転スイープ線が通った範囲だけ地図を数秒表示。
- 音波紋は敵の聴覚判定とは分離し、表示だけ `state.nextSoundRippleAt` で約2.6秒に1回へ間引き。
- 学校風のランダム校内生成へ変更。地下、1F、2F、3Fは現在の2Dナビゲーション上の区画として案内表示。
- 地下ブレーカーを追加。ONで全体照明が明るくなり、2〜10分で自動的に落ちる。
- 懐中電灯はOFF中にゆっくり電池が回復する。
- 出口はランダムな教室候補に非常口として配置。
- 捕獲後リスポーン時に、遮蔽物覗き込み関連のAI状態もリセット。
- バック音を発振音中心から、低く丸めたループ空気音、ゆっくりしたフィルター揺れ、軽い反響へ変更。

### 次に見るべき場所
- 敵がまだ遮蔽物裏を見つけにくい場合:
  - [src/main.js](src/main.js) の `coverSearchNodes()`、`chooseCoverSearchRoute()`、`choosePassByRoute()`、`updateEnemy()` 内の `nearbySharedCover` / `blockedChase` 周辺を確認。
  - `coverCheckSuccess` の確率、`coverPeekUntil` の時間、`nearbySharedCover` の距離条件、`blockedChase` の距離と時間を調整。
- 遮蔽物貫通や捕獲判定がまだ強い場合:
  - [src/main.js](src/main.js) の `canEnemyMoveTo()`、`clearAtCloseRange`、`fullyDetected`、`visible` を確認。
- ソナー表示を調整する場合:
  - [src/main.js](src/main.js) の `updateRadar()`、`radarPoint()`、`sonarReveals`、`state.nextSoundRippleAt` を確認。
- ブレーカーや学校照明を調整する場合:
  - [src/main.js](src/main.js) の `setBreaker()`、`updateSchoolLighting()`、`updateLight()` を確認。
- 4Kでまだ重い場合:
  - 左下の FPS / draw / tris / render / window を見る。
  - FPS低い + draw/tris高い: メッシュ結合、3D視覚ライン削除、マップ縮小を検討。
  - FPS低い + draw/tris低い: JS/DOM/CSS/入力処理を Chrome Performance で確認。
  - render が 960x540 より大きい場合は `applyRenderCap()` が効いていない。
- バック音がまだノイズっぽい場合:
  - [src/main.js](src/main.js) の `initAudio()` 内の `caveGain.gain.value`、`caveLowpass.frequency.value`、`caveEcho.gain.value` を調整。

### 注意
- `node_modules` がローカルにない環境では `npm run build` が失敗する可能性がある。
- ローカル確認は `node --check src/main.js` と、必要に応じて一時 `preview.html` を使ったブラウザ確認で行う。
- GitHub Pages では GitHub Actions 側でビルドされる構成。

## 2026-06-26 Night School Texture / SONAR model implementation
- Added procedural runtime-ready PNG textures in `public/textures/`.
- Replaced flat school materials with texture-mapped wall, wet floor, classroom floor, ceiling tile, door, locker metal, sign/blackboard materials.
- Replaced simple enemy capsule with lightweight primitive-based `SONAR` model.
- SONAR uses shared materials, no shadows, no external glTF/Blender assets.
- Added `updateSonarModel(dt, time)` for ear twitch, breathing, chase posture, mouth widening, and arm motion.
- Kept render cap at 1280x720 for performance/quality balance.
- Removed `package-lock.json` from handoff package to avoid internal npm registry URL failures in GitHub Actions.
- Fixed `.github/workflows/deploy.yml` to install from public npm with `npm install --no-package-lock --registry=https://registry.npmjs.org/`.
