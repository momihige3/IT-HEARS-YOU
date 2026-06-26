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


## 2026-06-26 Breaker / Door cleanup

Completed:
- Removed decorative wall-side doors generated in the walkable-cell loop because they were not usable and confused players.
- Changed breaker placement from a mostly fixed lower-left area to random valid walkable nodes, excluding the exit and start-near area.
- Breaker ON duration is now fixed to 180 seconds.
- Breaker ON lighting is much brighter: hemisphere/ambient lights, corridor lights, fog density, exposure, and background are adjusted to feel like daytime.
- Breaker switch has visual red/off and green/on state.

Notes:
- Keep the real exit door interactive. Do not re-add fake doors unless they have clear blocked/locked visual language or actual interactions.
- If the daytime state is too bright, tune updateSchoolLighting() only; do not change the horror night baseline.

## 2026-06-26 Update - Locker battery, breaker range, flashlight, room map

Implemented changes:
- Flashlight battery now recharges while the player is inside a locker, regardless of flashlight ON/OFF state.
- Breaker ON lighting now affects a wider area: stronger ambient/hemisphere light, brighter background, lower fog density, higher exposure, and expanded point light distance.
- Flashlight buffed:
  - Brightness 1.5x: base intensity 78 -> 117.
  - Beam width 2x: angle PI/5.5 -> PI/2.75.
  - Reach 3x: distance 46 -> 138, target direction 8 -> 24.
- Added named room-like map spaces to the school layout:
  - ブレーカー室
  - 1年A組
  - 理科室
  - 保健室
  - 職員室
  - 音楽室
- Replaced misleading corridor/floor labels with wall-mounted room name plates at room entrances.
- Breaker panel now spawns inside the actual ブレーカー室 room.

Notes for next AI:
- Keep GitHub Pages workflow using public npm registry and do not commit package-lock.json generated in sandbox/internal registry environments.
- Rooms are currently generated by carving fixed cell rectangles into the procedural grid. This is lightweight and avoids external assets.
- If adding more rooms, update `schoolRooms` in `src/main.js` and keep connectors to central hallway to avoid unreachable rooms.

## 2026-06-26 Update - Room walls, wall-mounted devices, SONAR roar
- Removed/disabled corridor-center cover placement by making `addCover()` ignore non-room grid cells. This prevents SONAR pathing from being blocked by objects in the middle of corridors.
- Added `addRoomBoundaryWalls(room)` so classrooms / special rooms are enclosed by walls, leaving only the entrance-side opening.
- Moved room furniture toward the edges of rooms so entrances and navigation paths remain open.
- Moved the goal/exit device onto a room wall instead of placing it in the middle of a walkable tile.
- Kept the breaker as a wall-mounted panel/switch in the breaker room.
- Added SONAR roar system: every 60-180 seconds SONAR roars. If the player is within the running-detection range and is not hidden, the player is knocked down for 2 seconds.
- Added `state.seatedUntil`, `state.nextRoarAt`, and `state.roarUntil`.
- During knockdown, movement is disabled and the camera lowers.
- Roar animates SONAR ears/mouth and plays procedural roar audio when audio is available.

Notes for future AI:
- Avoid putting collidable objects in corridor center cells.
- Keep room entrances open and do not place furniture on door lines.
- If adding new rooms, include a single clear entrance side and update `sign.side` / `sign.gz` accurately.
