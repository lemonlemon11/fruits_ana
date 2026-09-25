import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const client = fs.readFileSync(path.join(root, 'api', 'client.ts'), 'utf8')

test('EntryPayload 序列化保留国家与销售等级字段', () => {
  assert.match(client, /country: payload\.country \|\| null/)
  assert.match(client, /grade: item\.grade/)
})

test('销售数量为空时不得自动序列化成 0', () => {
  assert.doesNotMatch(client, /sales_quantity: Number\(item\.salesQuantity\) \|\| 0/)
})
