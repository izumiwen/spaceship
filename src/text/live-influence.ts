import { createDecisions, storedGeminiKey, type Question } from "../llm/decisions.ts"
import type { Focus, InfluenceSource } from "./influence.ts"

const MODEL = "gemini-decision-1"

const QUESTIONS: Record<Focus["kind"], { header: string; instructions: string; levels: string[] }> = {
  "next sentence": {
    header: "下一句",
    instructions: "與「下一句」有關聯並影響它",
    levels: ["沒有關聯", "弱：共享某個細節或場景", "中：下一句以它為基礎", "強：下一句直接由它而來"],
  },
  "key phrase": {
    header: "關鍵片語",
    instructions: "與「關鍵片語」有關聯：關鍵片語所指的事物、造成它的原因，或由它引起的結果",
    levels: ["沒有關聯", "弱：共享某個細節或場景", "中：涉及關鍵片語所指的事物", "強：直接關於、起因於或導致關鍵片語"],
  },
}

export const liveInfluence: InfluenceSource = async function* (sentences, focus, signal) {
  const apiKey = storedGeminiKey()
  if (!apiKey) throw new Error("請先儲存 Gemini API 金鑰")

  const { header, instructions, levels } = QUESTIONS[focus.kind]
  const input = `故事句子\n${sentences.map((sentence, i) => `[${i + 1}] ${sentence}`).join("\n")}\n\n${header}\n${focus.text}`
  const questions = Object.fromEntries(
    sentences.map((_, i): [string, Question] => [keyOf(i), { type: "score", instructions: `第 [${i + 1}] 句${instructions}的程度有多強？`, criteria: levels }]),
  )
  const { answers } = await createDecisions(apiKey, { model: MODEL, input, questions }, signal)

  for (const index of sentences.keys()) {
    const answer = answers[keyOf(index)]
    if (answer?.type === "score") yield { index, strength: answer.score / (levels.length - 1) }
  }
}

function keyOf(index: number) {
  return `s${index + 1}`
}
