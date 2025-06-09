import JSZip from 'jszip'
import { BASE_URL } from './config'

export interface FileEntry {
  name: string
  path: string
  content: string | null
  zipFile: JSZip.JSZipObject
}

export type FileType = 'tex' | 'bib' | 'image' | 'pdf' | 'text' | 'unknown'

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

export interface URLState {
  arxivId: string | null
  filePath: string | null
}

export function parseURL(pathname: string): URLState {
  // Expected format: /abs/[arxiv-id]/[file-path]
  const match = pathname.match(/^\/abs\/([^/]+)(?:\/(.*))?$/)
  
  if (!match) {
    return { arxivId: null, filePath: null }
  }
  
  return {
    arxivId: match[1],
    filePath: match[2] || null
  }
}

export function buildURL(arxivId: string, filePath?: string): string {
  const basePath = BASE_URL === '/' ? '' : BASE_URL.replace(/\/$/, '')
  if (!filePath) {
    return `${basePath}/abs/${arxivId}`
  }
  return `${basePath}/abs/${arxivId}/${filePath}`
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