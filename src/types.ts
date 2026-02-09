import JSZip from 'jszip'
import { BASE_URL } from './config'

export interface FileEntry {
  name: string
  path: string
  content: string | null
  zipFile: JSZip.JSZipObject
}

export type FileType = 'tex' | 'bib' | 'image' | 'pdf' | 'text' | 'unknown'

export type AppMode = 'browse' | 'diff'

export interface DiffVersion {
  version: number
  id: string
  submittedUtc: string
  sizeLabel: string
}

export type DiffFileStatus = 'added' | 'removed' | 'modified' | 'unchanged'
export type DiffViewLayout = 'split' | 'unified'

export interface DiffSelectionState {
  baseId: string
  fromVersion: number
  toVersion: number
  filePath: string | null
}

export function getFileType(filename: string): FileType {
  const ext = filename.toLowerCase().split('.').pop()
  
  switch (ext) {
    case 'tex':
    case 'latex':
    case 'sty':
    case 'bbl':
    case 'cls':
    case 'dtx':
    case 'ins':
      return 'tex'
    case 'bib':
      return 'bib'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return 'image'
    case 'pdf':
      return 'pdf'
    case 'txt':
    case 'md':
    case 'readme':
      return 'text'
    default:
      return 'unknown'
  }
}

export interface BrowseURLState {
  mode: 'browse'
  arxivId: string | null
  filePath: string | null
}

export interface DiffURLState {
  mode: 'diff'
  arxivId: string | null
  fromVersion: number | null
  toVersion: number | null
  filePath: string | null
}

export type URLState = BrowseURLState | DiffURLState

export function parseURL(pathname: string): URLState {
  // Remove base URL prefix if present
  let cleanPath = pathname
  if (BASE_URL !== '/') {
    const basePrefix = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL
    if (cleanPath.startsWith(basePrefix)) {
      cleanPath = cleanPath.substring(basePrefix.length)
    }
  }
  
  // Expected diff format: /diff/[arxiv-id]/vA..vB/[file-path]
  const diffMatch = cleanPath.match(/^\/diff\/([^/]+)\/v([0-9]+)\.\.v([0-9]+)(?:\/(.*))?$/)
  if (diffMatch) {
    return {
      mode: 'diff',
      arxivId: diffMatch[1],
      fromVersion: Number(diffMatch[2]),
      toVersion: Number(diffMatch[3]),
      filePath: diffMatch[4] || null,
    }
  }

  // Expected browse format: /abs/[arxiv-id]/[file-path]
  const match = cleanPath.match(/^\/abs\/([^/]+)(?:\/(.*))?$/)
  
  if (!match) {
    return { mode: 'browse', arxivId: null, filePath: null }
  }
  
  return {
    mode: 'browse',
    arxivId: match[1],
    filePath: match[2] || null
  }
}

export function buildBrowseURL(arxivId: string, filePath?: string): string {
  const basePath = BASE_URL === '/' ? '' : BASE_URL.replace(/\/$/, '')
  if (!filePath) {
    return `${basePath}/abs/${arxivId}`
  }
  return `${basePath}/abs/${arxivId}/${filePath}`
}

export function buildDiffURL(arxivId: string, fromVersion: number, toVersion: number, filePath?: string): string {
  const basePath = BASE_URL === '/' ? '' : BASE_URL.replace(/\/$/, '')
  const versionPath = `v${fromVersion}..v${toVersion}`
  if (!filePath) {
    return `${basePath}/diff/${arxivId}/${versionPath}`
  }
  return `${basePath}/diff/${arxivId}/${versionPath}/${filePath}`
}

// Backwards-compatible alias used throughout browse mode.
export const buildURL = buildBrowseURL

export function splitArxivVersion(arxivId: string): { baseId: string; version: number | null } {
  const match = arxivId.match(/^(.*)v([0-9]+)$/)
  if (!match) {
    return { baseId: arxivId, version: null }
  }
  return {
    baseId: match[1],
    version: Number(match[2]),
  }
}

export function extractArxivId(input: string): string | null {
  // Handle various arXiv URL formats and extract the ID
  if (input.includes('arxiv.org')) {
    const match = input.match(/(?:arxiv\.org\/(?:abs\/|pdf\/|src\/|html\/)?|\/abs\/|\/pdf\/|\/src\/|\/html\/)(\d{4}\.\d{4,5}(?:v\d+)?|\w+-\w+\/\d{7}(?:v\d+)?)/i)
    return match ? match[1] : null
  }
  
  // Handle direct arXiv IDs
  const idMatch = input.match(/^(\d{4}\.\d{4,5}(?:v\d+)?|\w+-\w+\/\d{7}(?:v\d+)?)$/i)
  return idMatch ? idMatch[1] : null
}
