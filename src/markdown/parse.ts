/**
 * A tiny, streaming-tolerant markdown parser for chat rendering.
 *
 * Design constraints:
 * - No dependencies (the renderer must live within the pinned dep list).
 * - Incomplete input (mid-stream) must parse gracefully: unterminated code
 *   fences become open code blocks, unmatched inline markers are stripped
 *   rather than shown as raw asterisks.
 * - Output is a flat list of blocks with stable indices so completed blocks
 *   can be memoized during streaming.
 */

export type InlineSpan =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: InlineSpan[] }
  | { kind: "italic"; children: InlineSpan[] }
  | { kind: "bolditalic"; children: InlineSpan[] }
  | { kind: "strike"; children: InlineSpan[] }
  | { kind: "code"; text: string }
  | { kind: "link"; children: InlineSpan[]; url: string };

export type ListItem = { spans: InlineSpan[]; depth: number; ordered: boolean; marker: string };

export type Block =
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4; spans: InlineSpan[] }
  | { type: "code"; lang: string; content: string; closed: boolean }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "list"; items: ListItem[] }
  | { type: "hr" }
  | { type: "table"; header: InlineSpan[][]; rows: InlineSpan[][][] };

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

const findClose = (src: string, marker: string, from: number): number => {
  let i = from;
  while (i <= src.length - marker.length) {
    if (src.startsWith(marker, i)) return i;
    i++;
  }
  return -1;
};

export const parseInline = (src: string): InlineSpan[] => {
  const spans: InlineSpan[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      spans.push({ kind: "text", text: buf });
      buf = "";
    }
  };

  while (i < src.length) {
    const ch = src[i]!;

    // Inline code
    if (ch === "`") {
      const close = findClose(src, "`", i + 1);
      if (close === -1) {
        // Unterminated (streaming tail): drop the marker, keep the text.
        buf += src.slice(i + 1);
        i = src.length;
        break;
      }
      flush();
      spans.push({ kind: "code", text: src.slice(i + 1, close) });
      i = close + 1;
      continue;
    }

    // Bold / italic / bold-italic
    if (ch === "*") {
      let marker = "*";
      if (src.startsWith("***", i)) marker = "***";
      else if (src.startsWith("**", i)) marker = "**";
      const close = findClose(src, marker, i + marker.length);
      if (close === -1) {
        // Unterminated: strip the marker so streaming never flashes ** raw.
        i += marker.length;
        continue;
      }
      const inner = src.slice(i + marker.length, close);
      if (!inner.trim()) {
        buf += marker;
        i += marker.length;
        continue;
      }
      flush();
      const children = parseInline(inner);
      spans.push(
        marker === "***"
          ? { kind: "bolditalic", children }
          : marker === "**"
            ? { kind: "bold", children }
            : { kind: "italic", children },
      );
      i = close + marker.length;
      continue;
    }

    // Strikethrough
    if (src.startsWith("~~", i)) {
      const close = findClose(src, "~~", i + 2);
      if (close === -1) {
        i += 2;
        continue;
      }
      flush();
      spans.push({ kind: "strike", children: parseInline(src.slice(i + 2, close)) });
      i = close + 2;
      continue;
    }

    // Links [text](url)
    if (ch === "[") {
      const closeBracket = src.indexOf("]", i + 1);
      if (closeBracket !== -1 && src[closeBracket + 1] === "(") {
        const closeParen = src.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          flush();
          spans.push({
            kind: "link",
            children: parseInline(src.slice(i + 1, closeBracket)),
            url: src.slice(closeBracket + 2, closeParen),
          });
          i = closeParen + 1;
          continue;
        }
      }
      buf += ch;
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  flush();
  return spans;
};

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

const HR_RE = /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING_RE = /^ {0,3}(#{1,4})\s+(.*)$/;
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const FENCE_RE = /^ {0,3}```\s*(\S*)\s*$/;
const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const splitTableRow = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
};

export const parseBlocks = (src: string): Block[] => {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code
    const fence = line.match(FENCE_RE);
    if (fence) {
      const lang = fence[1] ?? "";
      const content: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (lines[i]!.match(FENCE_RE)) {
          closed = true;
          i++;
          break;
        }
        content.push(lines[i]!);
        i++;
      }
      blocks.push({ type: "code", lang, content: content.join("\n"), closed });
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({
        type: "heading",
        level: Math.min(4, heading[1]!.length) as 1 | 2 | 3 | 4,
        spans: parseInline(heading[2] ?? ""),
      });
      i++;
      continue;
    }

    // Blockquote
    if (/^ {0,3}>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^ {0,3}>\s?/.test(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(/^ {0,3}>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", spans: parseInline(quoteLines.join("\n")) });
      continue;
    }

    // Lists (bullet + ordered, one nesting level via indentation)
    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        const bullet = l.match(BULLET_RE);
        const ordered = l.match(ORDERED_RE);
        if (bullet) {
          items.push({
            spans: parseInline(bullet[3] ?? ""),
            depth: Math.min(1, Math.floor((bullet[1]?.length ?? 0) / 2)),
            ordered: false,
            marker: "•",
          });
          i++;
        } else if (ordered) {
          items.push({
            spans: parseInline(ordered[3] ?? ""),
            depth: Math.min(1, Math.floor((ordered[1]?.length ?? 0) / 2)),
            ordered: true,
            marker: `${ordered[2]}.`,
          });
          i++;
        } else if (l.trim() && /^\s{2,}/.test(l) && items.length > 0) {
          // Continuation line of the previous item.
          const prev = items[items.length - 1]!;
          prev.spans = [...prev.spans, { kind: "text", text: " " + l.trim() }];
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && TABLE_DIVIDER_RE.test(lines[i + 1]!)) {
      const header = splitTableRow(line).map(parseInline);
      i += 2;
      const rows: InlineSpan[][][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) {
        rows.push(splitTableRow(lines[i]!).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Paragraph: absorb consecutive plain lines.
    const para: string[] = [line.trimEnd()];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !lines[i]!.match(FENCE_RE) &&
      !HR_RE.test(lines[i]!) &&
      !lines[i]!.match(HEADING_RE) &&
      !/^ {0,3}>\s?/.test(lines[i]!) &&
      !BULLET_RE.test(lines[i]!) &&
      !ORDERED_RE.test(lines[i]!) &&
      !(lines[i]!.includes("|") && i + 1 < lines.length && TABLE_DIVIDER_RE.test(lines[i + 1]!))
    ) {
      para.push(lines[i]!.trimEnd());
      i++;
    }
    blocks.push({ type: "paragraph", spans: parseInline(para.join("\n")) });
  }

  return blocks;
};

/** Plain-text projection, used for copy actions and previews. */
export const spansToText = (spans: InlineSpan[]): string =>
  spans
    .map((s) => {
      switch (s.kind) {
        case "text":
          return s.text;
        case "code":
          return s.text;
        case "link":
          return spansToText(s.children);
        default:
          return spansToText(s.children);
      }
    })
    .join("");
