import { RangeSetBuilder, StateField, type Extension, type Text } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import type { CodeViewerMode } from './language'

export type LatexLinkKind = 'input' | 'graphics' | 'ref'

export interface LatexLinkSpan {
  from: number
  to: number
  kind: LatexLinkKind
  payload: string
}

const INPUT_PATTERN = /\\input\b\s*\{([^{}\n]+)\}/g
const GRAPHICS_PATTERN = /\\includegraphics\b(?:\s*\[[^\]\n]*\])?\s*\{([^{}\n]+)\}/g
const REF_PATTERN = /\\(?:Cref|cref|eqref|pageref|autoref|ref)\b\s*\{([^{}\n]+)\}/g

function maskLatexCommentsPreservingLength(text: string): string {
  let output = ''

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char !== '%') {
      output += char
      continue
    }

    let backslashCount = 0
    let j = i - 1
    while (j >= 0 && text[j] === '\\') {
      backslashCount++
      j--
    }

    if (backslashCount % 2 === 1) {
      output += char
      continue
    }

    output += ' '
    i++
    while (i < text.length && text[i] !== '\n') {
      output += ' '
      i++
    }

    if (i < text.length && text[i] === '\n') {
      output += '\n'
    }
  }

  return output
}

function collectRegexSpans(
  spans: LatexLinkSpan[],
  text: string,
  pattern: RegExp,
  kind: LatexLinkKind
) {
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const payload = (match[1] || '').trim()
    if (!payload) {
      continue
    }

    spans.push({
      from: match.index,
      to: match.index + match[0].length,
      kind,
      payload,
    })
  }
}

function dedupeOverlappingSpans(spans: LatexLinkSpan[]): LatexLinkSpan[] {
  if (spans.length <= 1) {
    return spans
  }

  spans.sort((a, b) => a.from - b.from || b.to - a.to)
  const filtered: LatexLinkSpan[] = []
  let lastEnd = -1
  for (const span of spans) {
    if (span.from < lastEnd) {
      continue
    }
    filtered.push(span)
    lastEnd = span.to
  }
  return filtered
}

export function collectLatexLinkSpans(text: string, mode: CodeViewerMode): LatexLinkSpan[] {
  if (mode !== 'tex' || !text) {
    return []
  }

  const maskedText = maskLatexCommentsPreservingLength(text)
  const spans: LatexLinkSpan[] = []
  collectRegexSpans(spans, maskedText, INPUT_PATTERN, 'input')
  collectRegexSpans(spans, maskedText, GRAPHICS_PATTERN, 'graphics')
  collectRegexSpans(spans, maskedText, REF_PATTERN, 'ref')

  return dedupeOverlappingSpans(spans)
}

function getLinkClassName(kind: LatexLinkKind): string {
  switch (kind) {
    case 'input':
      return 'latex-input-link'
    case 'graphics':
      return 'latex-graphics-link'
    case 'ref':
    default:
      return 'latex-ref-link'
  }
}

function getTitleForSpan(span: LatexLinkSpan): string {
  switch (span.kind) {
    case 'input':
      return `Click to open: ${span.payload}`
    case 'graphics':
      return `Click to open: ${span.payload}`
    case 'ref':
    default:
      return `Click to go to: ${span.payload}`
  }
}

function buildLatexLinkDecorations(doc: Text, mode: CodeViewerMode): DecorationSet {
  const spans = collectLatexLinkSpans(doc.toString(), mode)
  if (spans.length === 0) {
    return Decoration.none
  }

  const builder = new RangeSetBuilder<Decoration>()
  for (const span of spans) {
    builder.add(
      span.from,
      span.to,
      Decoration.mark({
        class: getLinkClassName(span.kind),
        attributes: {
          title: getTitleForSpan(span),
          'data-link-kind': span.kind,
          'data-link-payload': span.payload,
          'data-link-from': String(span.from),
          'data-link-to': String(span.to),
        },
      })
    )
  }
  return builder.finish()
}

export function createLatexLinkDecorationsExtension(mode: CodeViewerMode): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLatexLinkDecorations(state.doc, mode)
    },
    update(value, transaction) {
      if (!transaction.docChanged) {
        return value
      }
      return buildLatexLinkDecorations(transaction.state.doc, mode)
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

export function createLatexLinkClickExtension(onLinkClick: (link: LatexLinkSpan) => void): Extension {
  return EditorView.domEventHandlers({
    click(event) {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return false
      }

      const linkElement = target.closest<HTMLElement>('[data-link-kind][data-link-payload]')
      if (!linkElement) {
        return false
      }

      const kind = linkElement.getAttribute('data-link-kind')
      const payload = linkElement.getAttribute('data-link-payload')
      const fromRaw = linkElement.getAttribute('data-link-from')
      const toRaw = linkElement.getAttribute('data-link-to')
      if (!kind || !payload) {
        return false
      }

      if (kind !== 'input' && kind !== 'graphics' && kind !== 'ref') {
        return false
      }

      const from = fromRaw ? Number(fromRaw) : 0
      const to = toRaw ? Number(toRaw) : 0
      onLinkClick({
        kind,
        payload,
        from: Number.isFinite(from) ? from : 0,
        to: Number.isFinite(to) ? to : 0,
      })
      return true
    },
  })
}
