import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(frontend, '..')
const read = (...parts) => fs.readFileSync(path.join(frontend, ...parts), 'utf8')

test('正式入口统一使用 SLD 品牌与本地品牌资产', () => {
  const portal = read('src', 'components', 'AuthPortal.vue')
  const preview = read('src', 'views', 'PublicPreviewView.vue')
  const shell = read('src', 'AppShell.vue')
  const index = read('index.html')
  const authStyles = read('src', 'styles-auth.css')

  for (const source of [portal, preview, shell, index]) {
    assert.match(source, /SLD-水果市场销售分析/)
  }
  assert.match(portal, /BrandMark/)
  assert.match(preview, /BrandMark/)
  assert.match(index, /href="\/favicon\.svg"/)
  assert.match(index, /href="\/apple-touch-icon\.png"/)
  assert.match(authStyles, /url\('\/auth-portal-durian\.jpg'\)/)
  assert.match(authStyles, /url\('\/auth-portal-durian\.webp'\)/)
  assert.doesNotMatch(authStyles, /https?:\/\//)
})

test('登录主图提供压缩资源并具有国内来源和商用许可记录', () => {
  const asset = path.join(frontend, 'public', 'auth-portal-durian.jpg')
  const webpAsset = path.join(frontend, 'public', 'auth-portal-durian.webp')
  const credits = fs.readFileSync(path.join(projectRoot, 'docs', 'IMAGE_CREDITS.md'), 'utf8')

  assert.ok(fs.statSync(asset).size > 100_000)
  assert.ok(fs.statSync(webpAsset).size > 50_000)
  assert.ok(fs.statSync(webpAsset).size < fs.statSync(asset).size)
  assert.match(credits, /cc0\.cn\/image\/1571651234440059\.html/)
  assert.match(credits, /SpencerWing/)
  assert.match(credits, /免费用于商业用途/)
})
