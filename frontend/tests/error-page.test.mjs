import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const errorViewPath = path.join(frontend, 'src/views/ErrorView.vue')
const errorStylesPath = path.join(frontend, 'src/styles-error.css')
const staticPagePath = path.join(frontend, 'public/error-static.html')

test('默认错误页不依赖 API，并提供明确恢复操作', () => {
  const source = fs.readFileSync(errorViewPath, 'utf8')

  assert.doesNotMatch(source, /api\/client|\bfetch\s*\(/)
  assert.match(source, /role="alert"/)
  assert.match(source, /aria-live="assertive"/)
  assert.match(source, /重新加载/)
  assert.match(source, /返回首页/)
  assert.match(source, /<details/)
  assert.match(source, /readFatalError/)
  assert.match(source, /firstAllowedPath/)
  assert.match(source, /styles-error\.css/)
})

test('错误页样式复用现有语义变量并保证移动端触控尺寸', () => {
  const source = fs.readFileSync(errorStylesPath, 'utf8')

  assert.match(source, /var\(--surface\)/)
  assert.match(source, /var\(--primary\)/)
  assert.match(source, /min-height:\s*2\.82rem/)
  assert.match(source, /@media \(max-width:\s*820px\)/)
})

test('静态兜底页自包含，不依赖 Vue、API 或外部资源', () => {
  const source = fs.readFileSync(staticPagePath, 'utf8')

  assert.match(source, /<!doctype html>/i)
  assert.match(source, /页面暂时打不开/)
  assert.match(source, /location\.reload/)
  assert.doesNotMatch(source, /<link\b|<script\s+src=|https?:\/\//i)
})
