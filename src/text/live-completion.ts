import { storedApiKey, streamCompletion } from "../llm/cerebras.ts"
import { STORY_OPENINGS } from "../story/openings.ts"
import { STORY_MAX_WORDS, STORY_REQUEST } from "../story/prompt.ts"
import { strengthLevelOf, valueOf, type Control } from "./dimension.ts"
import type { Steering, TextSource } from "./text-stream.ts"
import { countWords } from "./words.ts"

const STEERED_SYSTEM_PROMPT = `續寫這個故事。使用者訊息可能先列出「關鍵片語」和「控制項」，然後是「目前的故事」，故事可能停在句子中間。

- 一律使用繁體中文（台灣用語）書寫。
- 只輸出接下來的文字。你寫的第一個字要直接接在故事最後一個字之後：如果故事停在句子中間，先把那個句子寫完。絕不重複或重新開始任何已寫過的內容，連最後一個字也不行：在「……門還是」之後要寫「鎖著的，而且……」，絕不能寫「還是鎖著的」或「門還是鎖著的」。
- 關鍵片語主導接下來發生的事：以它們為基礎續寫，尤其是 [方括號] 裡的詞。
- 控制項決定下一段文字讀起來的樣子。每個控制項是一個維度，只給出名稱和它的兩極或選項，請從這些標籤推斷要改變事件、焦點或文風中的什麼。量表給出兩極之間的位置：在極端時，誇大那一極，讓讀者在兩句之內就察覺；在中間時，兩者平衡。選項則指明要依循的那一個。每個控制項最後的括號是強度，決定它對這段文字的影響有多大。強烈：主導每一句。中等：通篇都有明顯的影響。輕微：只在一兩處點到，例如一個句子或一個意象，其餘部分照故事本身的事件、關鍵片語和較強的控制項來寫；輕微的控制項絕不可決定整段的基調。強度與數值是分開的，並取代上面的誇大規則：只有在強烈時才誇大某一極。從第一句到最後一句都要遵守每個控制項，但絕不可把標籤本身當成故事的文字寫出來。
- 兩者都有時，關鍵片語是內容，控制項是手法：接下來發生的事由關鍵片語發展而來，方括號裡的詞要在前兩句出現，並以控制項指定的手法書寫。
- 只寫純文字，不要標題、Markdown 或任何說明。
- 寫 250 到 600 字，絕不超過 ${STORY_MAX_WORDS} 字。在完整的句子結束。

範例
使用者：
關鍵片語
並不是她[手機]上的那一個

控制項
張力：非常緊繃

目前的故事
瑪拉一小時前就把廚房鎖上了。現在鬧鐘響了，但響的並不是她手機上的那一個。她躺著一動也不動，然後
助理：
還是伸手抓起了手機。螢幕一片漆黑。鈴聲沒有停。`

/** Characters held back at the start of a continuation, to drop any the model echoes from the end of the story. */
const MAX_ECHO_WORDS = 12
/** A shorter overlap is likelier a coincidence, such as a repeated "的", than an echo. */
const MIN_ECHO_WORDS = 2

const STEERED_REQUEST = { ...STORY_REQUEST, system: STEERED_SYSTEM_PROMPT }

export const liveSource: TextSource = { expand: expandToStoryStart, complete: completeStory }

/** Picks a random story opening that begins with `text`. */
function expandToStoryStart(text: string) {
  const candidates = STORY_OPENINGS.filter((start) => start.startsWith(text.trim()))
  return candidates[Math.floor(Math.random() * candidates.length)] ?? text
}

async function* completeStory(prefix: string, steering: Steering, signal: AbortSignal) {
  const apiKey = storedApiKey()
  if (!apiKey) throw new Error("請先儲存 API 金鑰")

  const isSteered = steering.leads.length > 0 || steering.controls.length > 0
  const request = isSteered ? { ...STEERED_REQUEST, user: steeredUserMessage(prefix, steering) } : { ...STORY_REQUEST, user: prefix }
  let head: string | undefined = ""
  for await (const delta of streamCompletion({ ...request, apiKey, signal })) {
    if (head === undefined) {
      yield delta
      continue
    }
    head += delta
    if (countWords(head) <= MAX_ECHO_WORDS) continue
    yield withoutEcho(prefix, head)
    head = undefined
  }
  const rest = head && withoutEcho(prefix, head)
  if (rest) yield rest
}

/** Drops the leading characters of `head` that repeat the last characters of `prefix`, which the model sometimes echoes before it continues. Spaces are ignored. */
function withoutEcho(prefix: string, head: string) {
  const start = head.trimStart()
  const tail = (prefix.match(/\S/gu) ?? []).slice(-MAX_ECHO_WORDS)
  const characters = [...start.matchAll(/\S/gu)]
  for (let count = Math.min(tail.length, characters.length); count >= MIN_ECHO_WORDS; count--) {
    const isEcho = tail.slice(-count).every((character, i) => character === characters[i][0])
    if (isEcho) return start.slice(characters[count - 1].index + characters[count - 1][0].length).trimStart()
  }
  return start
}

/** Empty blocks are left out, header included. */
function steeredUserMessage(prefix: string, { leads, controls }: Steering) {
  const blocks = [
    ["關鍵片語", leads.map(({ before, keyword, after }) => `${before}[${keyword}]${after}`)],
    ["控制項", controls.map(controlLine)],
    ["目前的故事", [prefix]],
  ] as const
  return blocks
    .filter(([, lines]) => lines.length)
    .map(([header, lines]) => `${header}\n${lines.join("\n")}`)
    .join("\n\n")
}

function controlLine({ dimension, position, strength }: Control) {
  const options = dimension.kind === "choice" ? `（選項：${dimension.options.join("、")}）` : ""
  return `${dimension.name}：${valueOf({ dimension, position })}${options}（${strengthLevelOf(strength)}）`
}
