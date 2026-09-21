import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const read = (...parts) => fs.readFileSync(path.join(src, ...parts), 'utf8')

const login = read('views', 'LoginView.vue')
const register = read('views', 'RegisterView.vue')
const portal = read('components', 'AuthPortal.vue')

test('登录和注册共用同一个 Portal 骨架', () => {
  assert.match(login, /<AuthPortal[^>]*>/)
  assert.match(register, /<AuthPortal>/)
  assert.match(portal, /portal-visual/)
  assert.match(portal, /portal-panel/)
  assert.match(portal, /<slot \/>/)
})

test('认证页面提供可访问的密码显示切换', () => {
  for (const view of [login, register]) {
    assert.match(view, /passwordVisible/)
    assert.match(view, /显示密码/)
    assert.match(view, /隐藏密码/)
    assert.match(view, /aria-pressed/)
  }
})

test('登录目标在登录与注册之间保持', () => {
  assert.match(login, /safeRedirect\(route\.query\.redirect\)/)
  assert.match(register, /safeRedirect\(route\.query\.redirect\)/)
  assert.match(login, /path: '\/register'/)
  assert.match(register, /path: '\/login'/)
})

test('提交前做字段校验并就近提示', () => {
  assert.match(login, /请输入用户名/)
  assert.match(login, /请输入密码/)
  assert.match(register, /密码至少/)
  assert.match(register, /两次输入的密码不一致/)
  for (const view of [login, register]) {
    assert.match(view, /class="field-error"/)
    assert.match(view, /aria-invalid/)
  }
})

test('登录页提供默认未勾选的 30 天免登录选项', () => {
  assert.match(login, /rememberMe:\s*false/)
  assert.match(login, /type="checkbox"/)
  assert.match(login, /30 天内免登录/)
  assert.match(login, /form\.rememberMe/)
})

test('认证门户不展示能力清单和演示数据入口', () => {
  for (const copy of [
    'A/B/C 等级分析',
    '销量、销售额与加权均价一处看清',
    '逐单与品牌对比',
    '同一品牌或跨品牌都能横向比较',
    '导入即出结果',
    '上传 xlsx / csv 结算单自动解析',
    '还没导入自己的数据？',
    '先看演示效果',
  ]) {
    assert.doesNotMatch(portal, new RegExp(copy.replace(/[/?]/g, '\\$&')))
  }
})
