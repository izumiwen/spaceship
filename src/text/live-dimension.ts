import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import type { Dimension, DimensionContext, DimensionSource } from "./dimension.ts"

const MENU_SIZE = 5
const MAX_CHARACTERS_PER_LABEL = 8
/** Stands for the options of `focus` in the list of axes; the model replaces it with the story's characters. */
const CHARACTERS_SLOT = "<角色>"
/** The option of `focus` besides the story's characters. */
const NARRATOR = "敘事者"

/** Independent axes of a short passage, most consequential first. `焦點` (focus) has no generic options: its options are the story's characters. */
const CATALOG: Dimension[] = [
  { name: "張力", kind: "scale", low: "放鬆", high: "緊繃" },
  { name: "解答", kind: "scale", low: "懸而未決", high: "水落石出" },
  { name: "節奏", kind: "scale", low: "緊湊", high: "鋪陳" },
  { name: "寫法", kind: "choice", options: ["對話", "動作", "描寫"] },
  { name: "焦點", kind: "choice", options: [] },
  { name: "語氣", kind: "choice", options: ["詼諧", "溫柔", "沉重", "奇幻"] },
  { name: "距離", kind: "scale", low: "旁觀視角", high: "內心視角" },
  { name: "命運", kind: "scale", low: "惡化", high: "好轉" },
  { name: "意外", kind: "scale", low: "意料之中", high: "出乎意料" },
]

const SYSTEM_PROMPT = `
使用者訊息包含一個故事的開頭（在讀者目前讀到的地方截斷）、有時還有讀者的關鍵片語（關鍵詞在方括號中），以及一份軸線清單。每條軸線是接下來 200 字可能變化的一個方向，寫成「名稱: 標籤 | 標籤」。

挑出在這個時間點上，對接下來可能發生的事最重要的軸線，數量依要求，最重要的排在最前面。有關鍵片語時，優先挑選會作用在它們身上的軸線。把挑中的行原封不動地輸出，每行一條，除此之外什麼都不要輸出。

唯一的例外是「焦點」，也就是這段文字要跟隨誰：把 ${CHARACTERS_SLOT} 換成故事中出現的每一個角色，用名字或最多 ${MAX_CHARACTERS_PER_LABEL} 個字稱呼。故事還沒有任何角色時，不要挑「焦點」。

範例
使用者：
故事：瑪拉一小時前就把廚房鎖上了。現在一張椅子在磁磚上刮出聲響，而她的哥哥沒有接電話。她躺著一動也不動，然後
軸線：
張力: 放鬆 | 緊繃
節奏: 緊湊 | 鋪陳
寫法: 對話 | 動作 | 描寫
焦點: ${CHARACTERS_SLOT} | ${NARRATOR}
命運: 惡化 | 好轉
挑 3 條。
助理：
張力: 放鬆 | 緊繃
焦點: 瑪拉 | 她的哥哥 | ${NARRATOR}
寫法: 對話 | 動作 | 描寫
`.trim()

/** One call offers the menu: the free catalog axes that matter most here, with the story's characters as the options of `focus`. Axes the model leaves out or garbles are filled in from the catalog. */
export const liveDimension: DimensionSource = async function* (context, signal) {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("請先儲存 API 金鑰")

  const takenNames = context.taken.map(({ name }) => name.toLowerCase())
  const free = CATALOG.filter(({ name }) => !takenNames.includes(name))
  const generic = free.filter((axis) => axis.kind === "scale" || axis.options.length)
  const size = Math.min(MENU_SIZE, generic.length)
  if (!size) return

  const offered: string[] = []
  const deltas = streamCompletion({
    apiKey,
    system: SYSTEM_PROMPT,
    user: userMessageOf(context, free, size),
    temperature: 0.3,
    maxCompletionTokens: 1500,
    signal,
  })
  for await (const line of linesOf(deltas)) {
    const dimension = dimensionOf(line, free)
    if (!dimension || offered.includes(dimension.name)) continue
    offered.push(dimension.name)
    yield dimension
    if (offered.length === size) return
  }
  yield* generic.filter(({ name }) => !offered.includes(name)).slice(0, size - offered.length)
}

async function* linesOf(deltas: AsyncIterable<string>) {
  let buffer = ""
  for await (const delta of deltas) {
    const lines = (buffer + delta).split("\n")
    buffer = lines.pop()!
    yield* lines
  }
  yield buffer
}

function userMessageOf({ text, leads }: DimensionContext, free: Dimension[], size: number) {
  const keyPhrases = leads.length ? `關鍵片語：\n${leads.map(({ before, keyword, after }) => `- ${before}[${keyword}]${after}`).join("\n")}\n` : ""
  return `故事：${text}\n${keyPhrases}軸線：\n${free.map(axisLine).join("\n")}\n挑 ${size} 條。`
}

function axisLine(axis: Dimension) {
  if (axis.kind === "scale") return `${axis.name}: ${axis.low} | ${axis.high}`
  return `${axis.name}: ${axis.options.length ? axis.options.join(" | ") : `${CHARACTERS_SLOT} | ${NARRATOR}`}`
}

/** Reads a "name: label | label" line as one of `axes`, keeping that axis's kind; undefined when it is not one of them or its labels do not fit the kind. The full-width "：" and "｜" are read as well. */
function dimensionOf(line: string, axes: Dimension[]): Dimension | undefined {
  const [name, rest] = line.split(/[:：]/, 2).map((part) => part.trim())
  const axis = axes.find((axis) => axis.name === name.toLowerCase())
  const labels = (rest ?? "").split(/[|｜]/).map(plainLabel)
  if (!axis || !labels.every(isValidLabel)) return

  if (axis.kind === "scale") return labels.length === 2 ? { name: axis.name, kind: "scale", low: labels[0], high: labels[1] } : undefined
  return labels.length >= 2 && labels.length <= 4 ? { name: axis.name, kind: "choice", options: labels } : undefined
}

/** Drops a parenthesised aside, which the model sometimes adds to a character. */
function plainLabel(label: string) {
  return label
    .replace(/[(（].*?[)）]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isValidLabel(label: string) {
  return label !== "" && label !== CHARACTERS_SLOT && [...label].length <= MAX_CHARACTERS_PER_LABEL
}
