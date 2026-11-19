import { createDecisions, storedGeminiKey, type Question } from "../llm/decisions.ts"
import type { RelevanceSource } from "./keyword-relevance.ts"

const MODEL = "gemini-decision-1"
const LEVELS = ["不相關", "弱：共享場景或某個順帶的細節", "中：與當前句子的內容有關", "強：當前句子就是關於它，或以它為轉折"]

export const liveRelevance: RelevanceSource = async function* ({ story, tip, leads }, signal) {
  const apiKey = storedGeminiKey()
  if (!apiKey) throw new Error("請先儲存 Gemini API 金鑰")

  const input = [
    ...(story ? [`目前的故事\n${story}`] : []),
    `當前句子（正在寫的這一句）\n${tip}`,
    `關鍵詞\n${leads.map(({ before, keyword, after }, i) => `[${i + 1}] ${keyword}（出自「${before}${keyword}${after}」）`).join("\n")}`,
  ].join("\n\n")
  const questions = Object.fromEntries(
    leads.map((lead, i): [string, Question] => [
      keyOf(i),
      { type: "score", instructions: `關鍵詞 [${i + 1}]「${lead.keyword}」與「當前句子」的相關程度有多高？`, criteria: LEVELS },
    ]),
  )
  const { answers } = await createDecisions(apiKey, { model: MODEL, input, questions }, signal)

  for (const index of leads.keys()) {
    const answer = answers[keyOf(index)]
    if (answer?.type === "score") yield { index, relevance: answer.score / (LEVELS.length - 1) }
  }
}

function keyOf(index: number) {
  return `k${index + 1}`
}
