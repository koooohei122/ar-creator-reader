# Web AR Creator Reader

スマホ / PC のカメラ映像上で、画像ターゲットを認識して 3D キャラクターを表示する Web AR アプリです。
人物・手などの前景が前に入ると、キャラクターが自然に隠れる擬似オクルージョン機能付き。

---

## 技術スタック

| カテゴリ | ライブラリ |
|---|---|
| AR トラッキング | [MindAR.js](https://hiukim.github.io/mind-ar-js-doc/) (CDN) |
| 3D レンダリング | [Three.js](https://threejs.org/) (npm) |
| 前景セグメンテーション | [MediaPipe Selfie Segmentation](https://google.github.io/mediapipe/solutions/selfie_segmentation) (npm + CDN WASM) |
| フレームワーク | React 18 + TypeScript + Vite |
| 状態管理 | Zustand |

> **なぜ @react-three/fiber を使わないのか？**
> MindAR.js は内部で独自の Three.js Renderer を管理します。
> R3F も独自 Renderer を持つため、同じページで共存させると競合が生じます。
> MVP として最も確実な構成として、MindAR の Renderer に直接 Three.js オブジェクトを追加する方式を採用しています。

---

## セットアップ

### 必要環境

- Node.js **18 以上** (推奨: LTS 最新版)
- npm 9 以上

```bash
node -v  # v18.x.x 以上を確認
```

### インストール & 起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

### ビルド

```bash
npm run build
# dist/ フォルダに出力されます
npm run preview  # ビルド結果のプレビュー
```

---

## ターゲット画像の準備

### 1. マーカー画像を用意する

`public/targets/marker.jpg` として任意の画像を配置します。
**特徴点が多い画像ほど認識精度が上がります。** (白紙・単色は NG)

### 2. `.mind` ファイルを生成する

MindAR の公式コンパイラを使います（無料・ブラウザ完結）:

1. MindAR 公式サイトのツールページを開く: `hiukim.github.io/mind-ar-js-doc/tools/compile`
2. **「Add Images」** ボタンで `marker.jpg` をアップロード
3. **「Start」** をクリック
4. 処理完了後、**「Export」** → `targets.mind` をダウンロード
5. `public/targets/marker.mind` として配置

### 3. config.ts で確認

```ts
// src/config.ts
TARGET_SRC: '/targets/marker.mind',  // パスが一致しているか確認
```

---

## 3D モデルの差し替え

`public/models/character.glb` に GLB/GLTF ファイルを配置するだけです。

- アニメーション名が `idle` / `Idle` / `walk` / `Walk` の場合、自動再生されます
- ファイルが存在しない場合は**フォールバックキャラクター**（シンプルな人型ブロック）が表示されます

### パラメータ調整

`src/config.ts` の以下を変更すると位置・スケール・向きを調整できます:

```ts
CHARACTER_POSITION: [0, 0.1, 0],  // ターゲット中心からのオフセット (x, y, z)
CHARACTER_SCALE:    [0.15, 0.15, 0.15],
CHARACTER_ROTATION: [0, 0, 0],     // ラジアン
```

---

## スマホ確認方法

### 同一 Wi-Fi 上のスマホからアクセス

```bash
npm run dev
# ⇒ Network: http://192.168.x.x:5173  が表示されます
```

スマホのブラウザで `http://192.168.x.x:5173` を開いてください。

### HTTPS が必要な場合

Android Chrome は HTTP でもカメラが使えますが、iOS Safari や一部環境では **HTTPS** が必要です。

**方法 1: mkcert で自己署名証明書**

```bash
npm install -g mkcert
mkcert -install
mkcert localhost 127.0.0.1 192.168.x.x
```

`vite.config.ts` を編集:

```ts
server: {
  https: {
    key: './localhost+2-key.pem',
    cert: './localhost+2.pem',
  },
  host: true,
}
```

**方法 2: ngrok でトンネリング**

```bash
npx ngrok http 5173
# HTTPS の URL が発行されます
```

---

## よくあるエラーと対処

| エラー | 原因 | 対処 |
|---|---|---|
| `MindAR が読み込まれていません` | CDN スクリプトの読み込み失敗 | インターネット接続を確認。VPN / ファイアウォールを無効化 |
| カメラ映像が真っ黒 | カメラ権限が拒否されている | ブラウザのアドレスバーの鍵アイコンからカメラ許可 |
| `.mind` ファイルが 404 | パスが間違っている | `public/targets/marker.mind` に配置されているか確認 |
| キャラが表示されない | モデルが存在しない or パスが違う | `public/models/character.glb` を配置。なければフォールバックキャラが出るはず |
| オクルージョンが動かない | MediaPipe WASM の取得失敗 | インターネット接続を確認。初回は CDN からのダウンロードに数秒かかる |
| iOS Safari でカメラが起動しない | HTTP 接続 | HTTPS に切り替える (mkcert または ngrok) |
| FPS が低い | セグメンテーションの負荷 | `config.ts` の `SEGMENTATION_WIDTH/HEIGHT` を下げる (例: 128×72) |

---

## フォルダ構成

```
ar-creator-reader/
├── index.html              # CDN (MindAR) スクリプトタグ
├── vite.config.ts
├── src/
│   ├── config.ts           # ★ 調整する値はここ
│   ├── store.ts            # Zustand グローバル状態
│   ├── App.tsx             # ルートコンポーネント・UI レイアウト
│   ├── main.tsx
│   ├── types/
│   │   └── global.d.ts     # MindAR CDN グローバル型定義
│   ├── ar/
│   │   └── MindARController.ts  # MindAR 初期化・キャラクター管理
│   ├── hooks/
│   │   ├── useSegmentation.ts   # MediaPipe セグメンテーション
│   │   └── useFpsMonitor.ts     # FPS 計測・自動 OFF
│   └── components/
│       ├── ARScene.tsx          # AR 描画コンテナ
│       ├── UIControls.tsx       # ボタン・トグル UI
│       ├── StatusBadge.tsx      # AR 状態表示バッジ
│       ├── GuideOverlay.tsx     # スキャン誘導アニメーション
│       └── DebugPanel.tsx       # デバッグ情報パネル
└── public/
    ├── targets/
    │   └── marker.mind     # ★ 生成して配置 (README 参照)
    └── models/
        └── character.glb   # ★ 3D モデルを配置
```

---

## 最初に触るべき箇所

1. **`public/targets/marker.mind`** — ターゲットデータを生成して配置
2. **`public/models/character.glb`** — 3D キャラモデルを配置 (なくても動く)
3. **`src/config.ts`** — スケール・位置・セグメンテーション設定の調整

---

## オクルージョンの仕組みと限界

### 仕組み

```
レイヤー構成 (手前 → 奥)
─────────────────────────
[3] オーバーレイ canvas  ← MediaPipe で検出した人物ピクセルだけ残す
[2] Three.js canvas      ← 3D キャラクター
[1] video 要素           ← カメラ映像 (背景)
```

人物ピクセルの実際の映像をキャラクターの上に重ねることで「人がキャラより手前にいる」ように見せます。

### 限界

- 人物検出の精度はモデルに依存。手・腕の先端は不正確になる場合がある
- 高速な動きに対して数フレームの遅延が生じる
- 照明が暗い環境では検出精度が落ちる
- 完全な深度推定ではないため、物体の一部だけが前にある場合に不完全になる

---

## 今後の拡張案

### 近い将来
- **複数ターゲット対応** — MindAR の `maxTrack` を増やし、ターゲットごとに別キャラを表示
- **キャラクターインタラクション** — タップでアニメーション切り替え
- **AR.js との置き換え** — GPS 座標連動の場合は AR.js + A-Frame に移行

### 中長期
- **建物・ランドマーク認識** — Google Cloud Vision API / ARCore Cloud Anchors と連携
- **GPS 連動** — Mapbox + AR.js Geolocation で現実空間の座標にコンテンツを配置
- **深度推定によるリアルなオクルージョン** — MediaPipe Depth Estimation (実験的) を使い物理的な遮蔽を再現
- **WebXR Depth Sensing** — Chrome の WebXR Depth Sensing API で真の空間認識 (対応デバイス限定)

---

## ライセンス

MIT