/**
 * 单独补一张「多文件上传队列」的截图（imports-queue.png）。
 * 需要真实选文件才能触发这个状态，所以从 capture-mobile.mjs 里拆出来。
 *
 * 用法：
 *   PREVIEW_USER=test PREVIEW_PASS=****** node frontend/dev-preview/mobile-20260920/capture-import-queue.mjs
 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright')

const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:53000'
const API = process.env.PREVIEW_API || 'http://127.0.0.1:8000'
const USER = process.env.PREVIEW_USER
const PASS = process.env.PREVIEW_PASS
const OUT = dirname(fileURLToPath(import.meta.url))

if (!USER || !PASS) {
  console.error('缺少 PREVIEW_USER / PREVIEW_PASS 环境变量。')
  process.exit(1)
}

const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ display_name: USER, password: PASS, remember_me: false }),
})
if (!res.ok) {
  console.error('登录失败:', res.status)
  process.exit(1)
}
const session = (res.headers.get('set-cookie') || '').split(';')[0].split('=')[1]

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN' })
await ctx.addCookies([{
  name: 'fruit_session', value: session,
  domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
}])
const page = await ctx.newPage()
await page.goto(`${BASE}/imports`, { waitUntil: 'networkidle' })

// 只校验扩展名，用占位内容即可；大小故意给到约 1.3MB，好让摘要显示「兆字节」。
const names = ['809-01-35结算单.xlsx', '809-02-36结算单.xlsx', '810-03-41结算单.xlsx']
await page.setInputFiles('#settlement-files', names.map((name) => ({
  name,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.alloc(1_324_000),
})))
await page.waitForTimeout(600)
console.log('队列文案:', (await page.locator('.upload-queue').innerText()).replace(/\n/g, ' | '))
await page.locator('.upload-queue').screenshot({ path: `${OUT}/imports-queue.png` })
console.log('已保存 imports-queue.png')
await browser.close()
