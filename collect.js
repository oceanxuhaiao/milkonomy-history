#!/usr/bin/env node
// 采集官方 marketplace.json，滚动维护 5 天历史到 history.json
const fs = require("fs")
const path = require("path")

const OFFICIAL_URL = "https://www.milkywayidle.com/game_data/marketplace.json"
const HISTORY_FILE = path.join(__dirname, "history.json")
const RETENTION_SECONDS = 5 * 24 * 60 * 60

/** 官方格式 marketData[item][level]={a,b,p,v} → { "{item}|{level}": {a,b,p,v} }，缺省字段用 -1 */
function buildSnapshot(marketData) {
  const snapshot = {}
  for (const item of Object.keys(marketData || {})) {
    for (const level of Object.keys(marketData[item] || {})) {
      const p = marketData[item][level] || {}
      snapshot[`${item}|${level}`] = {
        a: typeof p.a === "number" ? p.a : -1,
        b: typeof p.b === "number" ? p.b : -1,
        p: typeof p.p === "number" ? p.p : -1,
        v: typeof p.v === "number" ? p.v : -1
      }
    }
  }
  return snapshot
}

/**
 * 合并历史与新快照：
 * - 新快照按 timestamp 追加，同 t 去重（新覆盖旧）
 * - 滚动剔除 t < now - RETENTION_SECONDS 的点
 * - 跳过损坏的旧点；组合无有效点时不输出 key
 */
function mergeHistory(existing, snapshot, timestamp, now) {
  const cutoff = now - RETENTION_SECONDS
  const result = {}
  const keys = new Set([...Object.keys(existing || {}), ...Object.keys(snapshot || {})])
  for (const key of keys) {
    const points = new Map()
    for (const pt of existing?.[key] || []) {
      if (pt && typeof pt.t === "number" && pt.t >= cutoff) points.set(pt.t, pt)
    }
    const snap = snapshot?.[key]
    if (snap && typeof timestamp === "number" && timestamp >= cutoff) {
      points.set(timestamp, { t: timestamp, a: snap.a, b: snap.b, p: snap.p, v: snap.v })
    }
    if (points.size > 0) {
      result[key] = [...points.values()].sort((x, y) => x.t - y.t)
    }
  }
  return result
}

async function main() {
  let res
  try {
    res = await fetch(OFFICIAL_URL)
  } catch (e) {
    console.error("官方数据请求失败:", e.message)
    process.exit(0) // 跳过本轮，不产生坏数据
  }
  if (!res.ok) {
    console.error(`官方数据请求失败: ${res.status}`)
    process.exit(0)
  }
  const data = await res.json()
  if (!data || !data.marketData || typeof data.timestamp !== "number") {
    console.error("官方数据格式异常")
    process.exit(0)
  }

  let existing = {}
  try {
    existing = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"))?.history || {}
  } catch {
    existing = {}
  }

  const now = Math.floor(Date.now() / 1000)
  const snapshot = buildSnapshot(data.marketData)
  const history = mergeHistory(existing, snapshot, data.timestamp, now)

  fs.writeFileSync(HISTORY_FILE, JSON.stringify({ updatedAt: data.timestamp, history }))
  const pointCount = Object.values(history).reduce((sum, pts) => sum + pts.length, 0)
  console.log(`采集完成: ${Object.keys(history).length} 组合, ${pointCount} 点, updatedAt=${data.timestamp}`)
}

if (require.main === module) {
  main().catch(e => {
    console.error(e)
    process.exit(0)
  })
}

module.exports = { buildSnapshot, mergeHistory }
