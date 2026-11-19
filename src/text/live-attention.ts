import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import type { AttentionBox, AttentionSource } from "./attention.ts"
import { wordSpans, type Span } from "./segments.ts"

const MAX_BOXES = 3

const SYSTEM_PROMPT = `
使用者訊息是一個故事的開頭，在讀者目前讀到的地方截斷。從中挑出接下來的文字最依賴的關鍵片語：對截斷處之後的內容影響最大的那些。

- 挑 1 到 3 個片語：只有一個片語主導接下來的發展時挑 1 個，有好幾個時才多挑。
- 每個片語都必須一字不差、連續地抄自故事，長度 2 到 12 個字。不可跳字、改字、加字或預測後文。
- 在每個片語中，用 [方括號] 括住最重要的那一個詞。
- 每行輸出一個片語，除此之外什麼都不要輸出。

範例
使用者：瑪拉一小時前就把廚房鎖上了。現在鬧鐘響了，但響的並不是她手機上的那一個。她躺著一動也不動，然後
助理：
把[廚房]鎖上了
並不是她[手機]上的那一個
她躺著[一動也不動]
`.trim()

export const liveAttention: AttentionSource = async function* (text, signal) {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("請先儲存 API 金鑰")

  const words = wordSpans(text)
  const letters = lettersOf(text)
  const yielded = new Set<number>()
  const deltas = streamCompletion({ apiKey, system: SYSTEM_PROMPT, user: text, temperature: 0.3, maxCompletionTokens: 1000, signal })

  for await (const line of linesOf(deltas)) {
    const box = boxFromLine(line, letters, words)
    if (!box || yielded.has(box.keyword)) continue
    yielded.add(box.keyword)
    yield box
    if (yielded.size >= MAX_BOXES) return
  }
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

/**
 * Finds the phrase on `line` in the text, last occurrence first, and boxes the words it covers around its [bracketed] keyword.
 * Chinese segments into words differently in and out of context, so the phrase is matched by its letters and digits alone, ignoring spaces, punctuation and case;
 * when the whole phrase is not found, the keyword alone is boxed.
 */
function boxFromLine(line: string, text: Letters, words: Span[]): AttentionBox | undefined {
  const open = line.indexOf("[")
  const close = line.indexOf("]", open)
  const hasBrackets = open !== -1 && close !== -1
  const phrase = lettersOf(line.replace(/[[\]]/g, "")).letters
  if (!phrase) return

  const keyword = hasBrackets ? lettersOf(line.slice(open + 1, close)).letters : ""
  const keywordAt = hasBrackets ? lettersOf(line.slice(0, open)).letters.length : phrase.length - 1
  const at = text.letters.lastIndexOf(phrase)
  if (at !== -1) return boxOf(words, text.offsets, at, at + phrase.length, at + Math.min(keywordAt, phrase.length - 1))

  const alone = keyword ? text.letters.lastIndexOf(keyword) : -1
  if (alone !== -1) return boxOf(words, text.offsets, alone, alone + keyword.length, alone)
}

/** The box over the words covering letters `start` to `end`, its keyword the word holding letter `keyword`. */
function boxOf(words: Span[], offsets: number[], start: number, end: number, keyword: number): AttentionBox | undefined {
  const first = words.findIndex((word) => word.end > offsets[start])
  const last = words.findLastIndex((word) => word.start <= offsets[end - 1])
  const center = words.findIndex((word) => word.end > offsets[keyword])
  if (first === -1 || center < first || last < center) return
  return { keyword: center, before: center - first, after: last - center }
}

/** The letters and digits of `text`, lowercased, with where each one is in `text`. */
type Letters = { letters: string; offsets: number[] }

function lettersOf(text: string): Letters {
  let letters = ""
  const offsets: number[] = []
  for (const { 0: letter, index } of text.matchAll(/[\p{L}\p{N}]/gu)) {
    letters += letter.toLowerCase()
    offsets.push(index)
  }
  return { letters, offsets }
}
