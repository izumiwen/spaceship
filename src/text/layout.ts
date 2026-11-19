import { layoutNextLine, type LayoutCursor, type PreparedTextWithSegments } from "@chenglou/pretext"
import type { Caret } from "./caret.ts"

/**
 * Pretext fits a line within `maxWidth` plus a small engine tolerance (its unexported `lineFitEpsilon`, at most 1/64 px), so a line that fills the column exactly can measure a hair wider than it.
 * Only a word that fits nowhere overflows by more: pretext still places it alone on the line, and the caret's line must not show it.
 */
const FIT_TOLERANCE_PX = 1 / 64

/** Lays out from `start` (the text's start by default), `caret.line` counting from there. */
export function layoutLines(layout: PreparedTextWithSegments, caret: Caret, fullWidth: number, start?: LayoutCursor) {
  const lines: string[] = []
  let cursor = start
  for (let i = 0; i <= caret.line; i++) {
    const width = i === caret.line ? caret.x : fullWidth
    const line = layoutNextLine(layout, width, cursor)
    if (!line || line.width > width + FIT_TOLERANCE_PX) break
    lines.push(line.text)
    cursor = line.end
  }
  return lines
}
