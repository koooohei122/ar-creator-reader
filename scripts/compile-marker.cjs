/**
 * compile-marker.cjs
 * Node.js でスター画像を生成し、MindAR の .mind ファイルを作るスクリプト
 *
 * 実行: node scripts/compile-marker.cjs
 */

'use strict'

const { createHash } = require('crypto')
const { deflateSync } = require('zlib')
const { writeFileSync, existsSync, mkdirSync } = require('fs')
const path = require('path')

// ---- PNG 生成ユーティリティ (外部ライブラリ不要) ----

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.concat([typeBytes, data])
  const crcVal = Buffer.allocUnsafe(4)
  crcVal.writeUInt32BE(crc32(crcBuf), 0)
  return Buffer.concat([len, typeBytes, data, crcVal])
}

/**
 * RGBA ピクセル配列から PNG Buffer を生成する
 * @param {Uint8ClampedArray} rgba width*height*4
 * @param {number} width
 * @param {number} height
 */
function toPNG(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR: width, height, bitDepth=8, colorType=6(RGBA), compress=0, filter=0, interlace=0
  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8; ihdrData[9] = 6; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0

  // IDAT: filter byte (0) + RGBA per row, then zlib compress
  const raw = Buffer.allocUnsafe(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0  // filter type none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = y * (1 + width * 4) + 1 + x * 4
      raw[dst] = rgba[src]
      raw[dst + 1] = rgba[src + 1]
      raw[dst + 2] = rgba[src + 2]
      raw[dst + 3] = rgba[src + 3]
    }
  }
  const idatData = deflateSync(raw, { level: 6 })

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- スター画像を RGBA で生成 ----
// MindAR の image tracking は ORB 系のコーナー検出を使うため、
// 単純な星形だけではフィーチャーポイントが少なすぎて追跡できない。
// グリッド背景・チェッカーボードリング・ティックマークで 300+ 特徴点を確保する。

function generateStarImage(size = 512) {
  const rgba = new Uint8ClampedArray(size * size * 4)

  const cx = size / 2
  const cy = size / 2
  const outerR   = size * 0.34   // 星の外半径
  const innerR   = size * 0.14   // 星の内半径
  const points   = 5
  const BORDER   = 14            // 外枠の太さ
  const GRID     = 16            // グリッドの間隔 (px)
  const CHECKER_INNER = size * 0.37  // チェッカーボードリングの内径
  const CHECKER_OUTER = size * 0.47  // チェッカーボードリングの外径

  function setPixel(x, y, r, g, b) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const idx = (y * size + x) * 4
    rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255
  }

  // 星の頂点
  const starVerts = []
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    starVerts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  }

  // 点が星の内側かどうか (Ray casting)
  function insideStar(px, py) {
    let inside = false
    const n = starVerts.length
    let j = n - 1
    for (let i = 0; i < n; i++) {
      const xi = starVerts[i].x, yi = starVerts[i].y
      const xj = starVerts[j].x, yj = starVerts[j].y
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      j = i
    }
    return inside
  }

  // 1. 白背景
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255
  }

  // 2. 細かいグリッド (明るいグレー) — コーナー検出点を多数生成
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x % GRID === 0 || y % GRID === 0) setPixel(x, y, 180, 180, 180)
    }
  }

  // 3. チェッカーボードリング (星の外側〜外枠の内側) — 最も多くの特徴点を生成
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist >= CHECKER_INNER && dist <= CHECKER_OUTER) {
        const col = Math.floor(x / GRID)
        const row = Math.floor(y / GRID)
        if ((col + row) % 2 === 0) setPixel(x, y, 0, 0, 0)
        else setPixel(x, y, 255, 255, 255)
      }
    }
  }

  // 4. 星: 黒塗りつぶし
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (insideStar(x, y)) setPixel(x, y, 0, 0, 0)
    }
  }

  // 5. 外枠: 黒
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < BORDER || x >= size - BORDER || y < BORDER || y >= size - BORDER)
        setPixel(x, y, 0, 0, 0)
    }
  }

  // 6. 各辺にティックマーク (方向の非対称性を付与し、回転方向を区別可能にする)
  // 上辺: 長い + 短い交互, 左辺: 長いのみ, 右辺: なし, 下辺: 短いのみ
  // → 4辺で異なるパターン = マーカーの上下左右を MindAR が区別できる
  const TICK_STEP = GRID * 3  // 48px ごとにティック
  const LONG_TICK  = 22
  const SHORT_TICK = 12
  const TICK_W     = 4

  for (let x = BORDER + TICK_STEP; x < size - BORDER; x += TICK_STEP) {
    const isLong = Math.floor((x - BORDER) / TICK_STEP) % 2 === 0
    const len = isLong ? LONG_TICK : SHORT_TICK
    for (let dy = 0; dy < len; dy++) for (let dw = 0; dw < TICK_W; dw++) setPixel(x + dw, BORDER + dy, 0, 0, 0)
  }
  for (let x = BORDER + TICK_STEP; x < size - BORDER; x += TICK_STEP) {
    for (let dy = 0; dy < SHORT_TICK; dy++) for (let dw = 0; dw < TICK_W; dw++) setPixel(x + dw, size - BORDER - SHORT_TICK + dy, 0, 0, 0)
  }
  for (let y = BORDER + TICK_STEP; y < size - BORDER; y += TICK_STEP) {
    for (let dw = 0; dw < LONG_TICK; dw++) for (let dt = 0; dt < TICK_W; dt++) setPixel(BORDER + dw, y + dt, 0, 0, 0)
  }

  // 7. L 字コーナーマーカー (各コーナーが非対称なので orientation を確定)
  const L_ARM  = 48
  const L_THICK = 8
  const L_GAP  = BORDER + 4
  const lCorners = [
    // [ox, oy, flipX, flipY]
    [L_GAP, L_GAP, false, false],
    [size - L_GAP - L_ARM, L_GAP, true, false],
    [L_GAP, size - L_GAP - L_ARM, false, true],
    [size - L_GAP - L_ARM, size - L_GAP - L_ARM, true, true],
  ]
  for (const [ox, oy] of lCorners) {
    for (let dx = 0; dx < L_ARM; dx++) for (let dt = 0; dt < L_THICK; dt++) setPixel(ox + dx, oy + dt, 0, 0, 0)
    for (let dy = 0; dy < L_ARM; dy++) for (let dt = 0; dt < L_THICK; dt++) setPixel(ox + dt, oy + dy, 0, 0, 0)
    // コーナー内部の小さな塗りつぶし正方形 (コーナーごとに大きさを変えて非対称化)
    const fillSize = 14
    for (let dy = L_THICK + 4; dy < L_THICK + 4 + fillSize; dy++)
      for (let dx = L_THICK + 4; dx < L_THICK + 4 + fillSize; dx++)
        setPixel(ox + dx, oy + dy, 0, 0, 0)
  }

  return { rgba, width: size, height: size }
}

// ---- MindAR コンパイラをブラウザ環境ポリフィルで動かす ----

async function compileMindAR(imageData) {
  // TF.js を CPU バックエンドで初期化 (WebGL は Node.js で使えないため)
  const tf = require(path.resolve(__dirname, '../node_modules/@tensorflow/tfjs/dist/tf.node.js'))
  await tf.setBackend('cpu')
  await tf.ready()
  console.log('[compile] TF.js backend:', tf.getBackend())

  // ブラウザ API ポリフィル
  globalThis.self = globalThis
  globalThis.window = globalThis

  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data)
      this.width = width
      this.height = height
    }
  }

  // canvas ポリフィル: drawImage → getImageData がピクセルデータを返すようにする
  class FakeContext2D {
    constructor() { this._img = null }
    drawImage(img) { this._img = img }
    getImageData(x, y, w, h) {
      const img = this._img
      return new globalThis.ImageData(
        img ? new Uint8ClampedArray(img._rgbaData) : new Uint8ClampedArray(w * h * 4),
        img ? img.width : w,
        img ? img.height : h,
      )
    }
  }
  class FakeCanvas {
    constructor() { this.width = 0; this.height = 0; this._ctx = new FakeContext2D() }
    getContext() { return this._ctx }
  }
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') return new FakeCanvas()
      return {}
    }
  }

  // Web Worker ポリフィル (コンパイラが Worker を使う場合の代替)
  globalThis.Worker = class FakeWorker {
    constructor() {}
    postMessage() {}
    set onmessage(_fn) {}
  }

  // MindAR の CPU カーネルを WebGL の代わりに登録 (Node.js 環境では WebGL 不可)
  await import(
    path.resolve(__dirname, '../node_modules/mind-ar/src/image-target/detector/kernels/cpu/index.js')
  )
  console.log('[compile] CPU カーネル登録完了')

  // ESM モジュールを動的インポート
  const { CompilerBase } = await import(
    path.resolve(__dirname, '../node_modules/mind-ar/src/image-target/compiler-base.js')
  )
  const { extractTrackingFeatures } = await import(
    path.resolve(__dirname, '../node_modules/mind-ar/src/image-target/tracker/extract-utils.js')
  )
  const { buildTrackingImageList } = await import(
    path.resolve(__dirname, '../node_modules/mind-ar/src/image-target/image-list.js')
  )
  const msgpack = await import(
    path.resolve(__dirname, '../node_modules/@msgpack/msgpack/dist/index.js')
  )

  // CompilerBase をサブクラスで上書き: Worker 不要・Canvas ポリフィル済み
  class NodeCompiler extends CompilerBase {
    createProcessCanvas(_img) { return new FakeCanvas() }

    compileTrack({ targetImages }) {
      return new Promise((resolve) => {
        const list = []
        for (const targetImage of targetImages) {
          const imageList = buildTrackingImageList(targetImage)
          const trackingData = extractTrackingFeatures(imageList, () => {})
          list.push(trackingData)
        }
        resolve(list)
      })
    }
  }

  const compiler = new NodeCompiler()

  // img オブジェクト (drawImage で使われる)
  const img = {
    width: imageData.width,
    height: imageData.height,
    _rgbaData: imageData.rgba,
  }

  console.log('[compile] コンパイル開始...')
  await compiler.compileImageTargets([img], (pct) => {
    process.stdout.write(`\r[compile] ${Math.round(pct)}%   `)
  })
  console.log('\n[compile] 完了')

  const data = compiler.exportData()
  return msgpack.encode(data)
}

// ---- メイン ----

async function main() {
  const publicDir = path.resolve(__dirname, '../public/targets')
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })

  // 1. スター画像を生成
  console.log('[generate] スター画像を生成中...')
  const imageData = generateStarImage(512)
  const pngBuf = toPNG(imageData.rgba, imageData.width, imageData.height)
  const jpgPath = path.join(publicDir, 'marker.jpg')  // PNG だが .jpg 拡張子で保存 (ブラウザは判別可能)
  writeFileSync(jpgPath, pngBuf)
  console.log('[generate] 保存:', jpgPath)

  // 2. .mind ファイルをコンパイル
  let mindData
  try {
    mindData = await compileMindAR(imageData)
  } catch (err) {
    console.error('[compile] エラー:', err.message)
    console.error('[compile] フォールバック: サンプル .mind を使用してください')
    console.error('  → https://hiukim.github.io/mind-ar-js-doc/tools/compile で生成')
    process.exit(1)
  }

  const mindPath = path.join(publicDir, 'marker.mind')
  writeFileSync(mindPath, Buffer.from(mindData))
  console.log('[generate] 保存:', mindPath, `(${(mindData.length / 1024).toFixed(1)} KB)`)
  console.log('\n完了！ marker.jpg と marker.mind を確認してください。')
}

main().catch((e) => { console.error(e); process.exit(1) })
