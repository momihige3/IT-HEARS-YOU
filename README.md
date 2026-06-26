# IT HEARS YOU

## 起動確認
この版は左上に `PERF CONFIRMED 960`、左下にFPSなどの診断表示が出ます。
表示されない場合は古いファイルを起動しています。

## 軽量化内容
- 内部描画最大960x540
- CSSで全画面拡大
- アンチエイリアス無効
- 影描画無効
- ライト数削減
- HUD/レーダー/判定更新の間引き

## 開発
```bash
npm install
npm run dev
```

## ビルド
```bash
npm run build
```

`dist/index.html`からも起動確認できます。

## Night school texture / SONAR update

This build includes production-ready procedural textures under `public/textures/` and uses them through `THREE.TextureLoader`.

Added:
- realistic dark school wall concrete texture
- wet hallway tile texture
- classroom wood floor texture
- stained ceiling tile texture
- old door wood texture
- scratched locker metal texture
- blackboard/sign texture
- SONAR wet skin, inner ear, and mouth textures

Enemy update:
- The enemy is now `SONAR`, a lightweight Three.js primitive monster model.
- No external 3D model files are required.
- Shadows remain disabled for performance.


## 2026-06-26 Breaker update

- Removed non-interactive decorative wall-side doors that looked usable.
- Breaker panel is now placed randomly from valid walkable school nodes each run.
- Turning the breaker ON brightens the school like daytime.
- Breaker automatically turns OFF after exactly 180 seconds.
- Breaker switch color changes red/off and green/on.

## 2026-06-26 update

- ロッカー内では懐中電灯ON/OFFに関係なくバッテリーが充電されます。
- ブレーカーON時の明るさ範囲を拡大しました。
- 懐中電灯を強化しました：明るさ1.5倍、照射角2倍、距離3倍。
- 学校マップに部屋空間を追加しました。
- 通路上の案内表示ではなく、入口横の壁プレートとして部屋名を表示します。
- ブレーカー表示は実際のブレーカー室に配置されます。

## Latest changes
- 通路中央の障害物を敵の経路から除外。
- 教室・特別教室を入口以外は壁で囲む部屋構造へ調整。
- 机・棚は部屋の端へ寄せ、入口と移動経路を塞がないよう調整。
- ゴールを壁設置型へ変更。
- ブレーカーはブレーカー室の壁設置型を維持。
- SONARが1〜3分周期で咆哮する処理を追加。
- 走り感知範囲内で咆哮を受けると、プレイヤーが2秒間しりもち状態になり移動不可。
