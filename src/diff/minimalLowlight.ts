import { createLowlight } from 'lowlight'
import type { Root } from 'hast'
import latexLanguage from 'highlight.js/lib/languages/latex'
import plaintextLanguage from 'highlight.js/lib/languages/plaintext'
import bibtexLanguage from './bibtexLanguage'

interface DiffAstNode {
  type: string
  value?: string
  children?: DiffAstNode[]
  lineNumber?: number
  startIndex?: number
  endIndex?: number
}

interface DiffAST {
  children: DiffAstNode[]
}

interface SyntaxLineEntry {
  node: DiffAstNode
  wrapper?: DiffAstNode
}

interface SyntaxLine {
  value: string
  lineNumber: number
  valueLength: number
  nodeList: SyntaxLineEntry[]
}

interface DiffHighlighter {
  name: string
  type: 'class'
  maxLineToIgnoreSyntax: number
  setMaxLineToIgnoreSyntax: (v: number) => void
  ignoreSyntaxHighlightList: (string | RegExp)[]
  setIgnoreSyntaxHighlightList: (v: (string | RegExp)[]) => void
  getAST: (raw: string, fileName?: string, lang?: string) => Root | undefined
  processAST: (ast: DiffAST) => {
    syntaxFileObject: Record<number, SyntaxLine>
    syntaxFileLineNumber: number
  }
  hasRegisteredCurrentLang: (lang: string) => boolean
  getHighlighterEngine: () => ReturnType<typeof createLowlight>
}

const lowlight = createLowlight()
lowlight.register({
  bibtex: bibtexLanguage,
  latex: latexLanguage,
  plaintext: plaintextLanguage,
})
lowlight.registerAlias({
  bibtex: ['bib'],
  plaintext: ['text', 'txt'],
})

export const processAST = (ast: DiffAST): { syntaxFileObject: Record<number, SyntaxLine>; syntaxFileLineNumber: number } => {
  let lineNumber = 1
  const syntaxObj: Record<number, SyntaxLine> = {}

  const loopAST = (nodes: DiffAstNode[], wrapper?: DiffAstNode) => {
    nodes.forEach((node) => {
      if (node.type === 'text' && typeof node.value === 'string') {
        if (!node.value.includes('\n')) {
          const valueLength = node.value.length
          if (!syntaxObj[lineNumber]) {
            node.startIndex = 0
            node.endIndex = valueLength - 1
            syntaxObj[lineNumber] = {
              value: node.value,
              lineNumber,
              valueLength,
              nodeList: [{ node, wrapper }],
            }
          } else {
            node.startIndex = syntaxObj[lineNumber].valueLength
            node.endIndex = node.startIndex + valueLength - 1
            syntaxObj[lineNumber].value += node.value
            syntaxObj[lineNumber].valueLength += valueLength
            syntaxObj[lineNumber].nodeList.push({ node, wrapper })
          }
          node.lineNumber = lineNumber
          return
        }

        const lines = node.value.split('\n')
        node.children = node.children || []

        for (let i = 0; i < lines.length; i++) {
          const value = i === lines.length - 1 ? lines[i] : `${lines[i]}\n`
          const currentLineNumber = i === 0 ? lineNumber : ++lineNumber
          const valueLength = value.length

          const textNode: DiffAstNode = {
            type: 'text',
            value,
            startIndex: Infinity,
            endIndex: Infinity,
            lineNumber: currentLineNumber,
          }

          if (!syntaxObj[currentLineNumber]) {
            textNode.startIndex = 0
            textNode.endIndex = valueLength - 1
            syntaxObj[currentLineNumber] = {
              value,
              lineNumber: currentLineNumber,
              valueLength,
              nodeList: [{ node: textNode, wrapper }],
            }
          } else {
            textNode.startIndex = syntaxObj[currentLineNumber].valueLength
            textNode.endIndex = textNode.startIndex + valueLength - 1
            syntaxObj[currentLineNumber].value += value
            syntaxObj[currentLineNumber].valueLength += valueLength
            syntaxObj[currentLineNumber].nodeList.push({ node: textNode, wrapper })
          }
          node.children.push(textNode)
        }

        node.lineNumber = lineNumber
        return
      }

      if (Array.isArray(node.children)) {
        loopAST(node.children, node)
        node.lineNumber = lineNumber
      }
    })
  }

  loopAST(ast.children)
  return { syntaxFileObject: syntaxObj, syntaxFileLineNumber: lineNumber }
}

const ignoreSyntaxHighlightList: (string | RegExp)[] = []
let maxLineToIgnoreSyntax = 2000

const instance: DiffHighlighter = {
  name: 'lowlight-minimal',
  type: 'class',
  get maxLineToIgnoreSyntax() {
    return maxLineToIgnoreSyntax
  },
  setMaxLineToIgnoreSyntax(v) {
    maxLineToIgnoreSyntax = v
  },
  get ignoreSyntaxHighlightList() {
    return ignoreSyntaxHighlightList
  },
  setIgnoreSyntaxHighlightList(v) {
    ignoreSyntaxHighlightList.length = 0
    ignoreSyntaxHighlightList.push(...v)
  },
  getAST(raw, fileName, lang) {
    if (
      fileName &&
      ignoreSyntaxHighlightList.some((item) => (item instanceof RegExp ? item.test(fileName) : fileName === item))
    ) {
      return undefined
    }

    if (lang && lowlight.registered(lang)) {
      return lowlight.highlight(lang, raw)
    }
    return lowlight.highlight('plaintext', raw)
  },
  processAST,
  hasRegisteredCurrentLang(lang) {
    return lowlight.registered(lang)
  },
  getHighlighterEngine() {
    return lowlight
  },
}

export const highlighter: DiffHighlighter = instance
export const versions = 'custom-minimal'

export function _getAST(_raw: string, _fileName?: string, _lang?: string): Record<string, never> {
  void _raw
  void _fileName
  void _lang
  return {}
}
