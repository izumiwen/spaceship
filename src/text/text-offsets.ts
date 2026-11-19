import type { Span } from "./segments.ts"

/**
 * Offsets count the characters of `element`'s text without its line breaks: lines are joined with nothing between them, as Chinese is written,
 * while the DOM breaks them with newlines. The range starts after any line break at `start` and ends before any at `end`, so it never reaches into a line it does not cover.
 */
export function rangeAt(element: Node, { start, end }: Span) {
  const range = document.createRange()
  range.setStart(...domPointAt(element, start, "start"))
  range.setEnd(...domPointAt(element, Math.max(start, end), "end"))
  return range
}

/** Character offset of a DOM point within `element`'s text, line breaks not counted, clamped when the point lies outside it. */
export function textOffsetOf(element: Node, node: Node, offset: number) {
  const range = document.createRange()
  range.selectNodeContents(element)
  const position = range.comparePoint(node, offset)
  if (position !== 0) return position < 0 ? 0 : withoutLineBreaks(element.textContent ?? "").length
  range.setEnd(node, offset)
  return withoutLineBreaks(range.toString()).length
}

/** The text node and offset within it at character `offset` of `element`'s text. A boundary between nodes resolves to the start of the later node for a range's start, the end of the earlier one for its end. */
function domPointAt(element: Node, offset: number, side: "start" | "end"): [Node, number] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let last: Text | undefined
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const breaks = lineBreaksIn(node.data)
    const length = node.length - breaks.length
    if (offset < length || (side === "end" && offset === length)) return [node, domOffsetOf(offset, breaks, side)]
    offset -= length
    last = node
  }
  return last ? [last, last.length] : [element, 0]
}

/** Skips the line breaks before `offset`: a range's start also skips one right at it, to begin on the next line; its end stays before it. */
function domOffsetOf(offset: number, breaks: number[], side: "start" | "end") {
  let domOffset = offset
  for (const at of breaks) {
    if (side === "start" ? at <= domOffset : at < domOffset) domOffset++
    else break
  }
  return domOffset
}

function lineBreaksIn(text: string) {
  const breaks: number[] = []
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) breaks.push(at)
  return breaks
}

function withoutLineBreaks(text: string) {
  return text.replaceAll("\n", "")
}
