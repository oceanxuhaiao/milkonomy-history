const { test } = require("node:test")
const assert = require("node:assert")
const { buildSnapshot, mergeHistory } = require("./collect")

const NOW = 1787313960

test("buildSnapshot 把官方 marketData 转换为 {key: {a,b,p,v}}", () => {
  const marketData = {
    "/items/sugar": { "0": { a: 13, b: 12, p: 12, v: 3520 } },
    "/items/sword": { "0": { a: 100 }, "13": { a: 200, b: 190 } }
  }
  const snap = buildSnapshot(marketData)
  assert.deepStrictEqual(snap["/items/sugar|0"], { a: 13, b: 12, p: 12, v: 3520 })
  assert.deepStrictEqual(snap["/items/sword|0"], { a: 100, b: -1, p: -1, v: -1 })
  assert.deepStrictEqual(snap["/items/sword|13"], { a: 200, b: 190, p: -1, v: -1 })
})

test("mergeHistory 首次采集：只有新快照点", () => {
  const snap = { "/items/sugar|0": { a: 13, b: 12, p: 12, v: 100 } }
  const result = mergeHistory({}, snap, NOW, NOW)
  assert.deepStrictEqual(result["/items/sugar|0"], [{ t: NOW, a: 13, b: 12, p: 12, v: 100 }])
})

test("mergeHistory 追加新点且按时间升序", () => {
  const existing = { "/items/sugar|0": [{ t: NOW - 3600, a: 12, b: 11, p: 11, v: 80 }] }
  const snap = { "/items/sugar|0": { a: 13, b: 12, p: 12, v: 100 } }
  const result = mergeHistory(existing, snap, NOW, NOW)
  assert.strictEqual(result["/items/sugar|0"].length, 2)
  assert.strictEqual(result["/items/sugar|0"][0].t, NOW - 3600)
  assert.strictEqual(result["/items/sugar|0"][1].t, NOW)
})

test("mergeHistory 同 t 去重：新快照覆盖", () => {
  const existing = { "/items/sugar|0": [{ t: NOW, a: 12, b: 11, p: 11, v: 80 }] }
  const snap = { "/items/sugar|0": { a: 13, b: 12, p: 12, v: 100 } }
  const result = mergeHistory(existing, snap, NOW, NOW)
  assert.strictEqual(result["/items/sugar|0"].length, 1)
  assert.strictEqual(result["/items/sugar|0"][0].v, 100)
})

test("mergeHistory 滚动剔除 5 天前的点", () => {
  const RETENTION = 5 * 24 * 3600
  const existing = {
    "/items/sugar|0": [
      { t: NOW - RETENTION - 1, a: 10, b: 9, p: 9, v: 50 },  // 超期 → 剔除
      { t: NOW - RETENTION, a: 11, b: 10, p: 10, v: 60 },      // 恰在边界 → 保留
      { t: NOW - 3600, a: 12, b: 11, p: 11, v: 70 }
    ]
  }
  const result = mergeHistory(existing, {}, NOW, NOW)
  assert.strictEqual(result["/items/sugar|0"].length, 2)
  assert.strictEqual(result["/items/sugar|0"][0].t, NOW - RETENTION)
})

test("mergeHistory 组合无任何有效点时不输出 key", () => {
  const RETENTION = 5 * 24 * 3600
  const existing = { "/items/sugar|0": [{ t: NOW - RETENTION - 100, a: 1, b: 1, p: 1, v: 1 }] }
  const result = mergeHistory(existing, {}, NOW, NOW)
  assert.strictEqual(result["/items/sugar|0"], undefined)
})

test("mergeHistory 跳过损坏的旧点", () => {
  const existing = { "/items/sugar|0": [null, { t: "bad" }, { t: NOW - 3600, a: 12, b: 11, p: 11, v: 70 }] }
  const result = mergeHistory(existing, {}, NOW, NOW)
  assert.strictEqual(result["/items/sugar|0"].length, 1)
  assert.strictEqual(result["/items/sugar|0"][0].v, 70)
})

test("buildSnapshot 对缺省字段使用 -1，避免异常值冒充成交", () => {
  const snap = buildSnapshot({ "/items/a": { "0": {} } })
  assert.deepStrictEqual(snap["/items/a|0"], { a: -1, b: -1, p: -1, v: -1 })
})
