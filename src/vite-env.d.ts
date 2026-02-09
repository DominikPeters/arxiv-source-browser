/// <reference types="vite/client" />

declare module 'codemirror-lang-latex/src/latex.mjs' {
  import type { LRParser } from '@lezer/lr'
  export const parser: LRParser
}
