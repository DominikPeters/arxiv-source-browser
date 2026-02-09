import { LanguageSupport } from '@codemirror/language'
import { parser as bibtexLanguage } from 'codemirror-lang-bib/dist/bibtex-parser.js'

export interface BibtexConfig {
  enableLinting?: boolean
  enableTooltips?: boolean
  enableAutocomplete?: boolean
  autoCloseBrackets?: boolean
}

export { bibtexLanguage }

export function bibtex(config: BibtexConfig = {}): LanguageSupport {
  void config
  return new LanguageSupport(bibtexLanguage)
}
