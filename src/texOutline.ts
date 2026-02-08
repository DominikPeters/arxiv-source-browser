export interface TexOutlineEntry {
  id: string
  title: string
  lineNumber: number
  command: string
  depth: number
}

interface RawTexOutlineEntry {
  id: string
  title: string
  lineNumber: number
  command: string
  level: number
}

const SECTION_COMMANDS = [
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph'
] as const

const SECTION_LEVEL_MAP = new Map<string, number>(
  SECTION_COMMANDS.map((name, index) => [name, index])
)

const SECTION_PATTERN = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/g

function stripCommentsPreservingLength(content: string): string {
  let output = ''

  for (let i = 0; i < content.length; i++) {
    const char = content[i]

    if (char !== '%') {
      output += char
      continue
    }

    let backslashCount = 0
    let j = i - 1
    while (j >= 0 && content[j] === '\\') {
      backslashCount++
      j--
    }

    if (backslashCount % 2 === 1) {
      output += char
      continue
    }

    output += ' '
    i++
    while (i < content.length && content[i] !== '\n') {
      output += ' '
      i++
    }

    if (i < content.length && content[i] === '\n') {
      output += '\n'
    }
  }

  return output
}

function parseDelimitedValue(
  text: string,
  startIndex: number,
  openChar: string,
  closeChar: string
): { value: string; endIndex: number } | null {
  if (startIndex >= text.length || text[startIndex] !== openChar) {
    return null
  }

  let depth = 0
  let value = ''

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i]

    if (char === openChar) {
      depth++
      if (depth > 1) {
        value += char
      }
      continue
    }

    if (char === closeChar) {
      depth--
      if (depth === 0) {
        return { value, endIndex: i + 1 }
      }
      value += char
      continue
    }

    value += char
  }

  return null
}

function normalizeHeadingTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim()
}

function buildLineStartIndices(content: string): number[] {
  const starts = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1)
    }
  }
  return starts
}

function findLineNumber(index: number, lineStarts: number[]): number {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (lineStarts[mid] <= index) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return high + 1
}

export function parseTexOutline(content: string): { lineCount: number; entries: TexOutlineEntry[] } {
  const lineCount = content.split('\n').length
  const sanitized = stripCommentsPreservingLength(content)
  const lineStarts = buildLineStartIndices(content)
  const rawEntries: RawTexOutlineEntry[] = []

  let match: RegExpExecArray | null
  while ((match = SECTION_PATTERN.exec(sanitized)) !== null) {
    const command = match[1]
    const level = SECTION_LEVEL_MAP.get(command)
    if (level === undefined) {
      continue
    }

    let index = SECTION_PATTERN.lastIndex

    while (index < sanitized.length && /\s/.test(sanitized[index])) {
      index++
    }

    let shortTitle: string | null = null
    if (index < sanitized.length && sanitized[index] === '[') {
      const parsedShort = parseDelimitedValue(sanitized, index, '[', ']')
      if (!parsedShort) {
        continue
      }
      shortTitle = parsedShort.value
      index = parsedShort.endIndex

      while (index < sanitized.length && /\s/.test(sanitized[index])) {
        index++
      }
    }

    if (index >= sanitized.length || sanitized[index] !== '{') {
      continue
    }

    const parsedLong = parseDelimitedValue(sanitized, index, '{', '}')
    if (!parsedLong) {
      continue
    }

    const rawTitle = parsedLong.value || shortTitle || ''
    const title = normalizeHeadingTitle(rawTitle)
    if (!title) {
      continue
    }

    const lineNumber = findLineNumber(match.index, lineStarts)

    rawEntries.push({
      id: `${lineNumber}-${rawEntries.length}`,
      title,
      lineNumber,
      command,
      level
    })
  }

  if (rawEntries.length === 0) {
    return { lineCount, entries: [] }
  }

  const minimumLevel = Math.min(...rawEntries.map((entry) => entry.level))

  const entries: TexOutlineEntry[] = rawEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    lineNumber: entry.lineNumber,
    command: entry.command,
    depth: entry.level - minimumLevel
  }))

  return { lineCount, entries }
}
