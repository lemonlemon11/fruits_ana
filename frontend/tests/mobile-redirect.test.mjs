import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')

const MOBILE_SITE = 'http://8.134.219.84:54001/'

// 提取 index.html 的内联跳转脚本，在 vm 沙箱中按给定 UA / 查询串执行，返回跳转目标。
function evaluate(userAgent, search = '') {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  const code = blocks.find((body) => body.includes('location.replace'))
  assert.ok(code, 'index.html 缺少含 location.replace 的内联跳转脚本')
  let redirectedTo = null
  vm.runInNewContext(code, {
    window: {
      location: {
        search,
        replace: (url) => {
          redirectedTo = url
        },
      },
    },
    navigator: { userAgent },
  })
  return redirectedTo
}

const PHONE_UAS = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  weChatWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49 NetType/WIFI Language/zh_CN',
  harmonyOS:
    'Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile',
}

const DESKTOP_UAS = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  // iPadOS 13+ Safari 默认报的也是 Macintosh 桌面 UA，与本条一致：按桌面版处理。
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
}

test('手机 UA 整站跳转独立移动版站点', () => {
  for (const [name, ua] of Object.entries(PHONE_UAS)) {
    assert.equal(evaluate(ua), MOBILE_SITE, `${name} 应跳转移动版`)
  }
})

test('桌面 UA 不跳转', () => {
  for (const [name, ua] of Object.entries(DESKTOP_UAS)) {
    assert.equal(evaluate(ua), null, `${name} 不应跳转`)
  }
})

test('?desktop=1 逃生口：手机 UA 也留在桌面版', () => {
  assert.equal(evaluate(PHONE_UAS.iPhoneSafari, '?desktop=1'), null)
  assert.equal(evaluate(PHONE_UAS.androidChrome, '?from=share&desktop=1'), null)
})

test('跳转脚本位于 head 内、主 bundle 之前', () => {
  const redirectPos = html.indexOf('location.replace')
  const headEnd = html.indexOf('</head>')
  const mainBundlePos = html.indexOf('/src/main.ts')
  assert.ok(redirectPos !== -1, 'index.html 未找到跳转脚本')
  assert.ok(redirectPos < headEnd, '跳转脚本应在 </head> 之前')
  assert.ok(redirectPos < mainBundlePos, '跳转脚本应先于主 bundle 加载')
})

test('跳转用 location.replace，不写历史记录（防返回键弹回再跳转）', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  const code = blocks.find((body) => body.includes('location.replace'))
  assert.ok(code.includes('location.replace('))
  assert.ok(!/location\.href\s*=/.test(code), '跳转不应使用 location.href 赋值')
})
