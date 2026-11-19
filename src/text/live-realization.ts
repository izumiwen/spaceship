import { createDecisions, storedGeminiKey, type Question } from "../llm/decisions.ts"
import type { RealizationSource } from "./realization.ts"

const MODEL = "gemini-decision-1"

export const liveRealization: RealizationSource = async function* ({ context, sentences, asked, control }, signal) {
  const apiKey = storedGeminiKey()
  if (!apiKey) throw new Error("請先儲存 Gemini API 金鑰")

  const input = [
    ...(context ? [`目前的故事\n${context}`] : []),
    `候選句子\n${sentences.map((sentence, i) => `[${i + 1}] ${sentence}`).join("\n")}`,
    `控制項\n${control}`,
  ].join("\n\n")
  const questions = Object.fromEntries(asked.map((index) => [keyOf(index), questionAbout(index)]))
  const { answers } = await createDecisions(apiKey, { model: MODEL, input, questions }, signal)

  for (const index of asked) {
    const answer = answers[keyOf(index)]
    if (answer?.type === "noul") yield { index, confidence: answer.noul }
  }
}

function keyOf(index: number) {
  return `s${index + 1}`
}

function questionAbout(index: number): Question {
  return {
    type: "noul",
    instructions: `第 [${index + 1}] 句是否做到了「控制項」所要求的？`,
    criteria: {
      true_description: "這個句子清楚呈現了控制項的值。",
      false_description: "這個句子沒有呈現它，或呈現了相反的情況。",
    },
  }
}
