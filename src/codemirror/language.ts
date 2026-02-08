import type { Extension } from '@codemirror/state'
import { bibtex } from 'codemirror-lang-bib'
import { latex } from 'codemirror-lang-latex'

export type CodeViewerMode = 'tex' | 'bib' | 'plain'

export function getCodeViewerLanguageExtension(mode: CodeViewerMode): Extension {
  switch (mode) {
    case 'tex':
      return latex({
        enableLinting: false,
        enableTooltips: false,
      })
    case 'bib':
      return bibtex({
        enableLinting: false,
        enableTooltips: false,
      })
    case 'plain':
    default:
      return []
  }
}
