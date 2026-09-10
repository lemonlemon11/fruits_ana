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
  assert.match(login, /<AuthPortal>/)
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
