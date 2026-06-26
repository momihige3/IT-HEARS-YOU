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
