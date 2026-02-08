interface LatexCommentTransform {
  removeLine: boolean
  transformedLine: string
}

function transformLine(line: string): LatexCommentTransform {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '%') {
      continue
    }

    // In TeX, an odd number of preceding backslashes means % is escaped (\%).
    let backslashCount = 0
    let j = i - 1
    while (j >= 0 && line[j] === '\\') {
      backslashCount++
      j--
    }

    if (backslashCount % 2 === 0) {
      if (i === 0) {
        // Remove lines that are purely comments (% at the first character).
        return { removeLine: true, transformedLine: '' }
      }

      // Remove only whitespace directly before an inline comment marker.
      return {
        removeLine: false,
        transformedLine: line.slice(0, i).replace(/[ \t]+$/, '')
      }
    }
  }

  return { removeLine: false, transformedLine: line }
}

export function stripLatexComments(text: string): string {
  const outputLines: string[] = []

  for (const line of text.split('\n')) {
    const { removeLine, transformedLine } = transformLine(line)
    if (!removeLine) {
      outputLines.push(transformedLine)
    }
  }

  return outputLines.join('\n')
}

export function buildVisibleLineMapAfterCommentStrip(text: string): number[] {
  const mapping: number[] = []
  let visibleLine = 0

  for (const line of text.split('\n')) {
    const { removeLine } = transformLine(line)
    if (removeLine) {
      mapping.push(0)
      continue
    }

    visibleLine++
    mapping.push(visibleLine)
  }

  return mapping
}

export function normalizeWrappedDisplayText(text: string): string {
  // Prism line-number measurements can drift on wrapped lines ending in spaces.
  // Normalize only for rendering; copy/download still use original content.
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
}
