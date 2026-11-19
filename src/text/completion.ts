import { optionIndexAt } from "./dimension.ts"
import type { Steering, TextSource } from "./text-stream.ts"

const LATENCY_MS = 150
const WORDS_PER_SECOND = 800
const WORDS_PER_CHUNK = 8
const WORDS_PER_COMPLETION = 400
/** Share of words drawn from the steering instead of the dictionary, so its effect is visible. */
const STEERED_SHARE = 0.25
/** Share of words followed by a comma, and by a full stop, so clauses and sentences run about as long as a story's. */
const COMMA_SHARE = 1 / 6
const SENTENCE_END_SHARE = 1 / 12
const CHUNK_INTERVAL_MS = (WORDS_PER_CHUNK / WORDS_PER_SECOND) * 1000

/** Placeholder words, like lorem ipsum: they read as Chinese but tell no story. */
const DICTIONARY =
  "星光 遠方 夜晚 船艙 引擎 低語 航道 記憶 雲層 港口 微風 燈塔 地圖 訊號 旅人 沉默 窗外 河流 鐘聲 回聲 森林 灰燼 信件 晨霧 海浪 舷窗 軌道 月球 塵埃 指針 緩緩 悄悄 忽然 依然 彷彿 似乎 終於 漸漸 穿過 望向 等待 想起 守著 飄向 掠過 停在 寂靜的 遙遠的 明亮的 古老的 溫暖的 冰冷的 陌生的 我們 他們 她 他 在 和 與 的 了 卻 而 也 還".split(
    " ",
  )

export const simulatedSource: TextSource = { complete }

/** Chinese is written without spaces, so chunks are joined directly; punctuation is full-width and never doubled. */
async function* complete(prefix: string, steering: Steering, signal: AbortSignal) {
  const steeredWords = steeredWordsOf(steering)
  const randomWord = () => (Math.random() < STEERED_SHARE && pick(steeredWords)?.()) || pick(DICTIONARY)!
  let isAfterPunctuation = !prefix.trim() || /[，。、；：！？]$/.test(prefix.trimEnd())
  for (let sent = 0; sent < WORDS_PER_COMPLETION; sent += WORDS_PER_CHUNK) {
    await delay(sent === 0 ? LATENCY_MS : CHUNK_INTERVAL_MS, signal)
    let chunk = ""
    for (let i = 0; i < WORDS_PER_CHUNK; i++) {
      const word = randomWord()
      const mark = isAfterPunctuation ? "" : punctuation()
      chunk += mark + word
      isAfterPunctuation = false
    }
    yield chunk
  }
}

/** One word picker per lead and control: a lead gives its keyword, a control its value words (a scale's high pole as often as its position), as often as its strength. */
function steeredWordsOf({ leads, controls }: Steering): (() => string | undefined)[] {
  return [
    ...leads.map(
      ({ keyword }) =>
        () =>
          keyword,
    ),
    ...controls.map(({ dimension, position, strength }) => () => {
      if (Math.random() >= strength) return
      if (dimension.kind === "choice") return dimension.options[optionIndexAt(dimension.options.length, position)]
      return Math.random() < position ? dimension.high : dimension.low
    }),
  ]
}

/** The mark, if any, that goes between the previous word and the next: a full stop ends a sentence, so the text segments into sentences. */
function punctuation() {
  const roll = Math.random()
  if (roll < SENTENCE_END_SHARE) return "。"
  if (roll < SENTENCE_END_SHARE + COMMA_SHARE) return "，"
  return ""
}

function pick<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)]
}

export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true })
  })
}
