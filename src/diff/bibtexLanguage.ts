import type { LanguageFn } from 'highlight.js'

const bibtexLanguage: LanguageFn = (hljs) => {
  const quotedValue = {
    className: 'string',
    begin: /"/,
    end: /"/,
    contains: [hljs.BACKSLASH_ESCAPE],
    relevance: 0,
  }

  const bracedValue = {
    className: 'string',
    begin: /\{/,
    end: /\}/,
    contains: ['self', hljs.BACKSLASH_ESCAPE],
    relevance: 0,
  }

  const fieldValue = {
    relevance: 0,
    contains: [
      quotedValue,
      bracedValue,
      {
        className: 'number',
        begin: /\b\d+\b/,
        relevance: 0,
      },
      {
        className: 'variable',
        begin: /\b[A-Za-z][\w:-]*\b/,
        relevance: 0,
      },
      {
        className: 'operator',
        begin: /#/,
        relevance: 0,
      },
    ],
  }

  return {
    name: 'BibTeX',
    aliases: ['bib'],
    case_insensitive: true,
    contains: [
      hljs.COMMENT('%', '$', { relevance: 0 }),
      {
        className: 'keyword',
        begin: /@[A-Za-z]+/,
        relevance: 10,
      },
      {
        className: 'attr',
        begin: /\b[A-Za-z][\w-]*\b(?=\s*=)/,
        relevance: 0,
      },
      {
        begin: /=/,
        starts: fieldValue,
        relevance: 0,
      },
    ],
  } as unknown as ReturnType<LanguageFn>
}

export default bibtexLanguage
