/** Chinese has no spaces between words, so the text is counted, revealed and cut by character: every non-space character is one unit. */
export function countWords(text: string) {
  return text.match(/\S/gu)?.length ?? 0
}

export function firstWords(text: string, count: number) {
  return text.match(new RegExp(`^(?:\\s*\\S){${count}}`, "u"))?.[0] ?? ""
}
