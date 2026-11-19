import { delay } from "./completion.ts"
import type { Dimension, DimensionSource } from "./dimension.ts"

const MENU_SIZE = 5
const LATENCY_MS = 150

const DIMENSIONS: Dimension[] = [
  { name: "張力", kind: "scale", low: "平靜", high: "緊繃" },
  { name: "轉折", kind: "choice", options: ["收束", "懸置", "逆轉"] },
  { name: "節奏", kind: "scale", low: "舒緩", high: "明快" },
  { name: "敘述", kind: "choice", options: ["動作", "對話", "內心"] },
  { name: "氛圍", kind: "scale", low: "陰暗", high: "明亮" },
  { name: "距離", kind: "scale", low: "貼近", high: "疏離" },
]

export const simulatedDimension: DimensionSource = async function* ({ taken }, signal) {
  await delay(LATENCY_MS, signal)
  const takenNames = new Set(taken.map(({ name }) => name))
  const free = DIMENSIONS.filter(({ name }) => !takenNames.has(name))
  yield* (free.length ? free : DIMENSIONS).slice(0, MENU_SIZE)
}
