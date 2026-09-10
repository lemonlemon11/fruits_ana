import assert from 'node:assert/strict'
import test from 'node:test'

import { addSelectedFiles, isFileDrag } from '../src/utils/importFiles.ts'

function file(name: string, size = 10, lastModified = 1): File {
  return new File([new Uint8Array(size)], name, { lastModified })
}

test('拖入多个文件会累加到已选列表并过滤不支持的类型', () => {
  const current = [file('已选.xlsx')]

  const result = addSelectedFiles(current, [
    file('甲.csv'),
    file('乙.xlsx'),
    file('说明.txt'),
  ])

  assert.deepEqual(result.files.map((item) => item.name), ['已选.xlsx', '甲.csv', '乙.xlsx'])
  assert.equal(result.ignored, 1)
})

test('重复拖入同一个文件不会产生重复条目', () => {
  const first = file('结算单.xlsx', 20, 100)

  const once = addSelectedFiles([], [first, first, file('结算单.xlsx', 20, 100)])
  const twice = addSelectedFiles(once.files, [file('结算单.xlsx', 20, 100)])

  assert.equal(once.files.length, 1)
  assert.equal(twice.files.length, 1)
})

test('同名但大小或修改时间不同的文件视为不同文件', () => {
  const result = addSelectedFiles([], [
    file('结算单.xlsx', 20, 100),
    file('结算单.xlsx', 21, 100),
    file('结算单.xlsx', 20, 101),
  ])

  assert.equal(result.files.length, 3)
})

test('扩展名大小写不敏感，空拖入保持原选择', () => {
  const current = [file('已选.xlsx')]

  assert.deepEqual(
    addSelectedFiles(current, [file('A.CSV'), file('B.Xlsx')]).files.map((item) => item.name),
    ['已选.xlsx', 'A.CSV', 'B.Xlsx'],
  )
  assert.deepEqual(addSelectedFiles(current, []).files, current)
})

test('只有携带文件的拖拽才被认定为文件拖入', () => {
  assert.equal(isFileDrag({ types: ['Files'] } as unknown as DataTransfer), true)
  assert.equal(isFileDrag({ types: ['text/plain'] } as unknown as DataTransfer), false)
  assert.equal(isFileDrag(null), false)
})
