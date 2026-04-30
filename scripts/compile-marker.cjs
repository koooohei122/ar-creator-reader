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
// チェッカーボードは規則的すぎてフィーチャーマッチャーが混乱する。
// 疑似乱数テクスチャ (4×4 px セル) を使うと各領域がユニークになり認識率が大幅向上する。

function generateStarImage(size = 512) {
  const rgba = new Uint8ClampedArray(size * size * 4)

  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.30
  const innerR = size * 0.12
  const points = 5
  const BORDER = 16
  const CELL   = 6   // ランダムテクスチャのセルサイズ

  // シード付き LCG 乱数 (再現性のある同じマーカーを生成するため)
  let seed = 0xABCD1234
  function rand() {
    seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
    return (seed >>> 0) / 0xFFFFFFFF
  }

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

  // 1. 疑似乱数テクスチャ: 各 CELL×CELL ブロックを独立した濃さで塗る
  //    → 全領域が一意になり ORB コーナー検出で大量の特徴点が生成される
  const cellsX = Math.ceil(size / CELL)
  const cellsY = Math.ceil(size / CELL)
  for (let cy2 = 0; cy2 < cellsY; cy2++) {
    for (let cx2 = 0; cx2 < cellsX; cx2++) {
      const v = rand() < 0.45 ? 0 : (rand() < 0.5 ? 120 : 255)  // 黒/グレー/白
      for (let dy = 0; dy < CELL; dy++) {
        for (let dx = 0; dx < CELL; dx++) {
          setPixel(cx2 * CELL + dx, cy2 * CELL + dy, v, v, v)
        }
      }
    }
  }

  // 2. 星の周囲に白い円形クリアゾーンを作り、星を目立たせる
  const clearR = outerR + 18
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy < clearR * clearR) setPixel(x, y, 255, 255, 255)
    }
  }

  // 3. 星: 黒塗りつぶし
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (insideStar(x, y)) setPixel(x, y, 0, 0, 0)
    }
  }

  // 4. 外枠: 黒 (白余白を挟んで二重枠にして特徴点を増やす)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < BORDER || x >= size - BORDER || y < BORDER || y >= size - BORDER)
        setPixel(x, y, 0, 0, 0)
      else if (x < BORDER + 8 || x >= size - BORDER - 8 || y < BORDER + 8 || y >= size - BORDER - 8)
        setPixel(x, y, 255, 255, 255)
      else if (x < BORDER + 12 || x >= size - BORDER - 12 || y < BORDER + 12 || y >= size - BORDER - 12)
        setPixel(x, y, 0, 0, 0)
    }
  }

  // 5. 四隅に大きな L 字マーカー (MindAR が向きを確定するための非対称要素)
  const L = 52, T = 10, GAP = BORDER + 14
  const corners = [[GAP, GAP], [size-GAP-L, GAP], [GAP, size-GAP-L], [size-GAP-L, size-GAP-L]]
  for (const [ox, oy] of corners) {
    for (let i = 0; i < L; i++) for (let t = 0; t < T; t++) { setPixel(ox+i, oy+t, 0,0,0); setPixel(ox+t, oy+i, 0,0,0) }
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
