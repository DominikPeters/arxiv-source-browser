import { keymap, lineNumbers, EditorView, Decoration, type DecorationSet } from '@codemirror/view'
import { defaultHighlightStyle, foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import type { CodeViewerMode } from './language'
import { getCodeViewerLanguageExtension } from './language'
import { codeViewerTheme } from './theme'

export interface CodeViewerConfig {
  mode: CodeViewerMode
  wordWrap: boolean
  readOnly: boolean
}

interface CodeViewerEffects {
  language: Extension
  wrapping: Extension
  readOnly: Extension
  folding: Extension
}

export interface CodeViewerExtensionController {
  extensions: Extension[]
  reconfigure: (view: EditorView, config: CodeViewerConfig) => void
  setInteraction: (view: EditorView, interactionExtension: Extension) => void
  setJumpLine: (view: EditorView, lineNumber: number | null) => void
}

const setJumpLineEffect = StateEffect.define<number | null>()

function jumpLineDecorationsForState(state: EditorState, lineNumber: number | null): DecorationSet {
  if (lineNumber === null || lineNumber < 1 || lineNumber > state.doc.lines) {
    return Decoration.none
  }

  const line = state.doc.line(lineNumber)
  return Decoration.set([
    Decoration.line({ attributes: { class: 'cm-outline-jump-line' } }).range(line.from),
  ])
}

const jumpLineDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(value, transaction) {
    let targetLine: number | null | undefined
    for (const effect of transaction.effects) {
      if (effect.is(setJumpLineEffect)) {
        targetLine = effect.value
      }
    }

    if (targetLine !== undefined) {
      return jumpLineDecorationsForState(transaction.state, targetLine)
    }

    if (transaction.docChanged) {
      return value.map(transaction.changes)
    }

    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]
}

function wrappingExtension(enabled: boolean): Extension {
  return enabled ? EditorView.lineWrapping : []
}

function foldingExtension(mode: CodeViewerMode): Extension {
  if (mode === 'tex' || mode === 'bib') {
    return [foldGutter(), keymap.of(foldKeymap)]
  }
  return []
}

function extensionsForConfig(config: CodeViewerConfig): CodeViewerEffects {
  return {
    language: getCodeViewerLanguageExtension(config.mode),
    wrapping: wrappingExtension(config.wordWrap),
    readOnly: readOnlyExtension(config.readOnly),
    folding: foldingExtension(config.mode),
  }
}

export function createCodeViewerExtensionController(
  config: CodeViewerConfig,
  interactionExtension: Extension = []
): CodeViewerExtensionController {
  const languageCompartment = new Compartment()
  const wrappingCompartment = new Compartment()
  const readOnlyCompartment = new Compartment()
  const foldingCompartment = new Compartment()
  const interactionCompartment = new Compartment()
  const initial = extensionsForConfig(config)

  const extensions: Extension[] = [
    lineNumbers(),
    codeViewerTheme,
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    jumpLineDecorationField,
    languageCompartment.of(initial.language),
    wrappingCompartment.of(initial.wrapping),
    readOnlyCompartment.of(initial.readOnly),
    foldingCompartment.of(initial.folding),
    interactionCompartment.of(interactionExtension),
  ]

  return {
    extensions,
    reconfigure(view, nextConfig) {
      const next = extensionsForConfig(nextConfig)
      view.dispatch({
        effects: [
          languageCompartment.reconfigure(next.language),
          wrappingCompartment.reconfigure(next.wrapping),
          readOnlyCompartment.reconfigure(next.readOnly),
          foldingCompartment.reconfigure(next.folding),
        ],
      })
    },
    setInteraction(view, nextInteractionExtension) {
      view.dispatch({
        effects: interactionCompartment.reconfigure(nextInteractionExtension),
      })
    },
    setJumpLine(view, lineNumber) {
      view.dispatch({
        effects: setJumpLineEffect.of(lineNumber),
      })
    },
  }
}
