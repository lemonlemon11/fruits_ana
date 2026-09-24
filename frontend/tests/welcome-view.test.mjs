import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const welcome = fs.readFileSync(path.join(src, 'views', 'WelcomeView.vue'), 'utf8')
const main = fs.readFileSync(path.join(src, 'main.ts'), 'utf8')

test('欢迎页使用极简门厅布局并覆盖有菜单与无菜单状态', () => {
  assert.match(welcome, /<BrandMark/)
  assert.match(welcome, /欢迎访问/)
  assert.match(welcome, /currentUser\?\.displayName/)
  assert.match(welcome, /请选择左侧或底部菜单/)
  assert.match(welcome, /当前账号暂未分配业务菜单/)
  assert.match(welcome, /class="welcome-divider"/)
  assert.doesNotMatch(welcome, /快捷入口|指标卡|portal|quick-action/)
})

test('欢迎页是登录后可访问且不要求业务权限的独立路由', () => {
  assert.match(main, /path: '\/welcome'/)
  assert.match(main, /WelcomeView\.vue/)
  assert.match(main, /path: '\/welcome'[\s\S]*?requiresAuth: true/)
})
