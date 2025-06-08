import JSZip from 'jszip'

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