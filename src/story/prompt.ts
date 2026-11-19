/** In Chinese characters. */
export const STORY_MAX_WORDS = 800

export const STORY_SYSTEM_PROMPT = `續寫這個故事。使用者訊息是故事的開頭，可能停在句子中間。

- 一律使用繁體中文（台灣用語）書寫。
- 只輸出接下來的文字，不要重複開頭。
- 你寫的第一個字要直接接在開頭最後一個字之後。
- 只寫純文字，不要標題、Markdown 或任何說明。
- 最多 ${STORY_MAX_WORDS} 字，並在完整的句子結束。

範例
使用者：鬧鐘響了，但是
助理：
響的並不是她手機上的那一個。瑪拉躺著一動也不動，仔細聆聽。`

export const STORY_REQUEST = {
  system: STORY_SYSTEM_PROMPT,
  temperature: 0.9,
  maxCompletionTokens: 3000,
}
