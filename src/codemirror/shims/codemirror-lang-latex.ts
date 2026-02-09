import { LRLanguage, LanguageSupport } from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as latexParser } from 'codemirror-lang-latex/src/latex.mjs'

export interface LatexConfig {
  autoCloseTags?: boolean
  enableLinting?: boolean
  enableTooltips?: boolean
  enableAutocomplete?: boolean
  autoCloseBrackets?: boolean
}

export const latexLanguage = LRLanguage.define({
  parser: latexParser.configure({
    props: [
      styleTags({
        CtrlSeq: t.keyword,
        Begin: t.keyword,
        End: t.keyword,
        EnvName: t.className,
        Comment: t.comment,
        Number: t.number,
        LiteralArgContent: t.string,
        SpaceDelimitedLiteralArgContent: t.string,
        VerbatimContent: t.monospace,
        VerbContent: t.monospace,
        MathChar: t.variableName,
      }),
    ],
  }),
  languageData: {
    commentTokens: { line: '%' },
  },
})

export function latex(config: LatexConfig = {}): LanguageSupport {
  void config
  return new LanguageSupport(latexLanguage)
}

export const latexCompletions = {
  environments: [],
  commands: [],
  mathCommands: [],
  packages: [],
}

export const autoCloseTags: [] = []
export const snippets: [] = []
