import { EditorView } from '@codemirror/view'

export const codeViewerTheme = EditorView.theme({
  '&': {
    border: '1px solid var(--border-primary)',
    boxShadow: 'var(--shadow-sm)',
    fontSize: '0.85rem',
  },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    lineHeight: '1.4',
    overflow: 'auto',
  },
  '.cm-content': {
    color: 'var(--text-primary)',
    padding: '0',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 0.5rem 0 0.25rem',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border-primary)',
  },
  '.cm-foldGutter .cm-gutterElement': {
    cursor: 'pointer',
  },
  '.cm-outline-jump-line': {
    backgroundColor: 'rgb(180 83 9 / 0.24)',
  },
  '.latex-input-link, .latex-ref-link': {
    cursor: 'pointer',
    color: 'var(--secondary-color)',
    textDecoration: 'underline',
  },
  '.latex-input-link:hover, .latex-ref-link:hover': {
    color: 'var(--secondary-hover)',
    backgroundColor: 'rgb(180 83 9 / 0.1)',
    textDecoration: 'none',
    borderRadius: '3px',
  },
  '.latex-graphics-link': {
    cursor: 'pointer',
    color: 'var(--primary-color)',
    textDecoration: 'underline',
  },
  '.latex-graphics-link:hover': {
    color: 'var(--primary-hover)',
    backgroundColor: 'rgb(179 27 27 / 0.1)',
    textDecoration: 'none',
    borderRadius: '3px',
  },
})
