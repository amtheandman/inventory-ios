import Jimp from 'jimp'
import { copyFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'fs'

const SRC = 'C:/Users/天勤熙浩的爸爸/.workbuddy/clipboard-images/clipboard-2026-07-26T09-50-45-321Z-be13a6df.png'
const OUT = 'E:/InventoryApp/ios/App/App/Assets.xcassets/AppIcon.appiconset'

// 像素尺寸 -> {idiom, size(点), scale}
const ICONS = [
  { px: 20, idiom: 'iphone', size: '20x20', scale: '1x' },
  { px: 40, idiom: 'iphone', size: '20x20', scale: '2x' },
  { px: 60, idiom: 'iphone', size: '20x20', scale: '3x' },
  { px: 29, idiom: 'iphone', size: '29x29', scale: '1x' },
  { px: 58, idiom: 'iphone', size: '29x29', scale: '2x' },
  { px: 87, idiom: 'iphone', size: '29x29', scale: '3x' },
  { px: 80, idiom: 'iphone', size: '40x40', scale: '2x' },
  { px: 120, idiom: 'iphone', size: '60x60', scale: '2x' },
  { px: 180, idiom: 'iphone', size: '60x60', scale: '3x' },
  { px: 76, idiom: 'ipad', size: '76x76', scale: '1x' },
  { px: 152, idiom: 'ipad', size: '76x76', scale: '2x' },
  { px: 167, idiom: 'ipad', size: '83.5x83.5', scale: '2x' },
  { px: 1024, idiom: 'ios-marketing', size: '1024x1024', scale: '1x' }
]

const run = async () => {
  const img = await Jimp.read(SRC)
  const images = []
  for (const it of ICONS) {
    const name = `icon-${it.px}.png`
    const out = img.clone().cover(it.px, it.px)
    await out.writeAsync(`${OUT}/${name}`)
    images.push({ idiom: it.idiom, size: it.size, scale: it.scale, filename: name })
  }
  // 移除 Capacitor 默认图标
  rmSync(`${OUT}/AppIcon-512@2x.png`, { force: true })
  const contents = {
    images: [
      ...images,
      { idiom: 'watch', scale: '2x', size: '24x24' },
      { idiom: 'watch', scale: '3x', size: '27.5x27.5' },
      { idiom: 'watch', scale: '2x', size: '29x29' },
      { idiom: 'watch', scale: '3x', size: '29x29' },
      { idiom: 'watch', scale: '2x', size: '40x40' },
      { idiom: 'watch', scale: '3x', size: '44x44' },
      { idiom: 'watch-marketing', scale: '1x', size: '1024x1024' }
    ],
    info: { author: 'xcode', version: 1 }
  }
  writeFileSync(`${OUT}/Contents.json`, JSON.stringify(contents, null, 2))
  console.log('已生成', ICONS.length, '个图标尺寸 + Contents.json')

  // PWA 图标 + manifest
  const pub = 'E:/InventoryApp/public'
  if (!existsSync(pub)) mkdirSync(pub, { recursive: true })
  const p192 = img.clone().cover(192, 192)
  await p192.writeAsync(`${pub}/icon-192.png`)
  const p512 = img.clone().cover(512, 512)
  await p512.writeAsync(`${pub}/icon-512.png`)
  const manifest = {
    name: '进销存管家',
    short_name: '进销存',
    description: '进销存 / 记账 / 记事本 移动版',
    start_url: '.',
    display: 'standalone',
    background_color: '#f7f8fa',
    theme_color: '#0a84ff',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  }
  writeFileSync(`${pub}/manifest.webmanifest`, JSON.stringify(manifest, null, 2))
  console.log('已生成 PWA 图标与 manifest')
}

run().catch(e => { console.error(e); process.exit(1) })
