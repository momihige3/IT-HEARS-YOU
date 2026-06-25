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
