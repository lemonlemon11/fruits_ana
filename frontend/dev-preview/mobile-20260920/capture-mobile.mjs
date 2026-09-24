/**
 * 手机版设计稿截图脚本（生成同目录下的 *.png）。
 *
 * 用法：
 *   PREVIEW_USER=test PREVIEW_PASS=****** node frontend/dev-preview/mobile-20260920/capture-mobile.mjs
 *
 * 前置：
 *   - 53000（真实前端）+ 127.0.0.1:8000（后端）均在运行；
 *   - 需要 Playwright（chromium）。默认从 PLAYWRIGHT_PATH 指定的路径导入，
 *     否则回退到 `playwright` 裸包名。
 *
 * 约定：整页长图里固定定位元素会被画在「视口底部」那个位置（整页看就是页面中间），
 * 所以先把底部导航改钉到文档底部，并隐藏视口锚定的悬浮按钮（顺仔入口 / 回顶部）。
 */
import { mkdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PW_PATH = process.env.PLAYWRIGHT_PATH || 'playwright'
const { chromium } = await import(PW_PATH)

const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:53000'
const API = process.env.PREVIEW_API || 'http://127.0.0.1:8000'
const USER = process.env.PREVIEW_USER
const PASS = process.env.PREVIEW_PASS
const OUT = dirname(fileURLToPath(import.meta.url))

if (!USER || !PASS) {
  console.error('缺少 PREVIEW_USER / PREVIEW_PASS 环境变量，拒绝在脚本里硬编码账号密码。')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

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
console.log('登录成功:', (await res.json()).user.display_name)

// 登录态页面（截图顺序即设计稿里的展示顺序）
const PAGES = [
  ['/overview', 'overview'],
  ['/settlements', 'settlements'],
  ['/settlement-detail?merchant_no=%E5%8D%95649', 'settlement-detail'],
  ['/settlement-comparison', 'settlement-comparison'],
  ['/series-comparison?selected=%E5%8D%95650,%E5%8D%95649,%E5%8D%95646', 'series-comparison'],
  ['/imports', 'imports'],
  ['/entry', 'entry'],
]

// 免登录页面（带登录态访问 /login 会被重定向到 /overview，必须清 Cookie）
const GUEST_PAGES = [
  ['/login', 'login'],
  ['/register', 'register'],
  ['/forgot-password', 'forgot-password'],
  ['/preview', 'preview'],
]

async function neutralizeFixed(page) {
  await page.evaluate(() => {
    const doc = document.documentElement.scrollHeight
    document.documentElement.style.position = 'relative'
    const tabbar = document.querySelector('.mobile-tabbar')
    if (tabbar && tabbar.getBoundingClientRect().height > 0) {
      const r = tabbar.getBoundingClientRect()
      tabbar.style.setProperty('position', 'absolute', 'important')
      tabbar.style.setProperty('bottom', 'auto', 'important')
      tabbar.style.setProperty('left', `${r.left}px`, 'important')
      tabbar.style.setProperty('top', `${doc - r.height}px`, 'important')
    }
    for (const el of document.querySelectorAll('*')) {
      if (el === tabbar) continue
      if (getComputedStyle(el).position !== 'fixed') continue
      const r = el.getBoundingClientRect()
      if (!r.height || !r.width) continue
      // 悬浮按钮是视口锚定的，摆进整页图里没有意义，还会把截图撑宽。
      el.style.setProperty('display', 'none', 'important')
    }
  })
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
})
await ctx.addCookies([{
  name: 'fruit_session', value: session,
  domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
}])
const page = await ctx.newPage()

const hashes = new Map()
async function shoot(path, name, { guest = false } = {}) {
  process.stdout.write(`${name.padEnd(22)} `)
  try {
    if (guest) await ctx.clearCookies()
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2500)
    await neutralizeFixed(page)
    const png = await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    const hash = createHash('md5').update(png).digest('hex').slice(0, 8)
    const dup = hashes.get(hash)
    if (dup) {
      console.log(`⚠️  与 ${dup} 相同! ${(statSync(`${OUT}/${name}.png`).size / 1024).toFixed(0)}KB`)
    } else {
      hashes.set(hash, name)
      console.log(`✅ ${(statSync(`${OUT}/${name}.png`).size / 1024).toFixed(0)}KB url=${page.url().replace(BASE, '')}`)
    }
  } catch (e) {
    console.log(`❌ ${e.message.slice(0, 60)}`)
  }
}

for (const [path, name] of PAGES) await shoot(path, name)
for (const [path, name] of GUEST_PAGES) await shoot(path, name, { guest: true })

await browser.close()
console.log('\n唯一图片:', hashes.size, '/', PAGES.length + GUEST_PAGES.length)
console.log('提示：多文件上传队列（imports-queue.png）需要另外选文件后截图，本脚本不覆盖。')
