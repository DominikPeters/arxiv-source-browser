import { useEffect, useState, type CSSProperties } from 'react'
import { DiffView, DiffModeEnum } from '@git-diff-view/react'
import { generateDiffFile, highlighter } from '@git-diff-view/file'
import '@git-diff-view/react/styles/diff-view-pure.css'
import type { FileEntry } from '../types'
import type { DiffFileStatus } from '../types'
import type { DiffViewLayout } from '../types'
import { getFileType } from '../types'
import bibtexLanguage from '../diff/bibtexLanguage'
import DiffStatusIcon from './DiffStatusIcon'

interface DiffViewerProps {
  filePath: string
  status: DiffFileStatus
  oldFile: FileEntry | null
  newFile: FileEntry | null
  wordWrap: boolean
  diffViewLayout: DiffViewLayout
  onError?: (message: string) => void
}

const LATEX_EXTENSIONS = new Set(['tex', 'latex', 'sty', 'cls', 'bbl', 'dtx', 'ins'])

// TeX sources can be long; keep syntax highlighting enabled for large files.
highlighter.setMaxLineToIgnoreSyntax(100000)
if (!highlighter.hasRegisteredCurrentLang('bibtex')) {
  const engine = highlighter.getHighlighterEngine()
  engine.register('bibtex', bibtexLanguage)
  engine.registerAlias('bibtex', ['bib'])
}

function getDiffLanguage(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() || ''
  if (LATEX_EXTENSIONS.has(ext)) {
    return 'latex'
  }
  if (ext === 'bib') {
    return 'bibtex'
  }
  return 'plaintext'
}

function isTextDiffCandidate(fileType: ReturnType<typeof getFileType>): boolean {
  return fileType === 'tex' || fileType === 'bib' || fileType === 'text'
}

function statusLabel(status: DiffFileStatus): string {
  switch (status) {
    case 'added':
      return 'Added'
    case 'removed':
      return 'Removed'
    case 'modified':
      return 'Modified'
    case 'unchanged':
      return 'Unchanged'
    default:
      return status
  }
}

const diffViewStyle = { '--diff-font-size--': '12px' } as CSSProperties

export default function DiffViewer({
  filePath,
  status,
  oldFile,
  newFile,
  wordWrap,
  diffViewLayout,
  onError,
}: DiffViewerProps) {
  const fileType = getFileType(filePath)
  const canTextDiff = isTextDiffCandidate(fileType)

  const [loading, setLoading] = useState(false)
  const [oldText, setOldText] = useState('')
  const [newText, setNewText] = useState('')
  const [oldObjectUrl, setOldObjectUrl] = useState<string | null>(null)
  const [newObjectUrl, setNewObjectUrl] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [fallbackError, setFallbackError] = useState<string | null>(null)
  const [diffFile, setDiffFile] = useState<ReturnType<typeof generateDiffFile> | null>(null)
  const [lineStats, setLineStats] = useState<{ added: number; removed: number } | null>(null)
  const statusText = statusLabel(status)

  useEffect(() => {
    setOldText('')
    setNewText('')
    setOldObjectUrl(null)
    setNewObjectUrl(null)
    setFallbackError(null)
    setDiffError(null)
    setDiffFile(null)
    setLineStats(null)
    setLoading(true)

    let cancelled = false
    let createdOldUrl: string | null = null
    let createdNewUrl: string | null = null

    const load = async () => {
      try {
        if (fileType === 'image' || fileType === 'pdf') {
          const [rawOldBlob, rawNewBlob] = await Promise.all([
            oldFile ? oldFile.zipFile.async('blob') : Promise.resolve(null),
            newFile ? newFile.zipFile.async('blob') : Promise.resolve(null),
          ])

          if (cancelled) return

          const oldBlob = fileType === 'pdf' && rawOldBlob
            ? new Blob([rawOldBlob], { type: 'application/pdf' })
            : rawOldBlob
          const newBlob = fileType === 'pdf' && rawNewBlob
            ? new Blob([rawNewBlob], { type: 'application/pdf' })
            : rawNewBlob

          createdOldUrl = oldBlob ? URL.createObjectURL(oldBlob) : null
          createdNewUrl = newBlob ? URL.createObjectURL(newBlob) : null
          setOldObjectUrl(createdOldUrl)
          setNewObjectUrl(createdNewUrl)
          return
        }

        if (!canTextDiff) {
          return
        }

        const [oldContent, newContent] = await Promise.all([
          oldFile
            ? (oldFile.content !== null ? Promise.resolve(oldFile.content) : oldFile.zipFile.async('text'))
            : Promise.resolve(''),
          newFile
            ? (newFile.content !== null ? Promise.resolve(newFile.content) : newFile.zipFile.async('text'))
            : Promise.resolve(''),
        ])

        if (cancelled) return

        if (oldFile) {
          oldFile.content = oldContent
        }
        if (newFile) {
          newFile.content = newContent
        }

        setOldText(oldContent || '')
        setNewText(newContent || '')
      } catch (error) {
        console.error('Error loading diff file content:', error)
        if (!cancelled) {
          setFallbackError('Could not load file content for diff rendering.')
          onError?.('Could not load file content for diff rendering.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      if (createdOldUrl) {
        URL.revokeObjectURL(createdOldUrl)
      }
      if (createdNewUrl) {
        URL.revokeObjectURL(createdNewUrl)
      }
    }
  }, [fileType, canTextDiff, oldFile, newFile, onError])

  useEffect(() => {
    if (!canTextDiff || loading || fallbackError) {
      setDiffFile(null)
      setLineStats(null)
      return
    }

    try {
      const language = getDiffLanguage(filePath)
      const created = generateDiffFile(
        `old/${filePath}`,
        oldText,
        `new/${filePath}`,
        newText,
        language,
        language
      )
      created.initTheme('light')
      created.init()
      created.buildSplitDiffLines()
      const bundle = created.getBundle() as { additionLength?: number; deletionLength?: number }
      setLineStats({
        added: bundle.additionLength ?? 0,
        removed: bundle.deletionLength ?? 0,
      })
      setDiffError(null)
      setDiffFile(created)
    } catch (error) {
      console.error('Error creating diff file:', error)
      setDiffError('Unable to render with Git Diff View. Showing fallback plain-text view.')
      setDiffFile(null)
      setLineStats(null)
    }
  }, [canTextDiff, fallbackError, filePath, loading, newText, oldText])

  const showLineStats = Boolean(lineStats && (lineStats.added > 0 || lineStats.removed > 0))

  if (loading) {
    return <div className="diff-viewer-loading">Loading diff…</div>
  }

  if (fileType === 'image') {
    return (
      <div className="diff-viewer">
        <div className="diff-viewer-header">
          <h3>{filePath}</h3>
          <div className="diff-status-inline-group">
            <DiffStatusIcon status={status} className="inline" title={statusText} ariaLabel={statusText} />
          </div>
        </div>
        <div className="diff-preview-grid">
          <div className="diff-preview-column">
            <h4>Old</h4>
            {oldObjectUrl ? <img src={oldObjectUrl} alt={`Old ${filePath}`} /> : <p>Not present in old version.</p>}
          </div>
          <div className="diff-preview-column">
            <h4>New</h4>
            {newObjectUrl ? <img src={newObjectUrl} alt={`New ${filePath}`} /> : <p>Not present in new version.</p>}
          </div>
        </div>
      </div>
    )
  }

  if (fileType === 'pdf') {
    return (
      <div className="diff-viewer">
        <div className="diff-viewer-header">
          <h3>{filePath}</h3>
          <div className="diff-status-inline-group">
            <DiffStatusIcon status={status} className="inline" title={statusText} ariaLabel={statusText} />
          </div>
        </div>
        <div className="diff-preview-grid">
          <div className="diff-preview-column">
            <h4>Old</h4>
            {oldObjectUrl ? (
              <iframe src={oldObjectUrl} title={`Old ${filePath}`} />
            ) : (
              <p>Not present in old version.</p>
            )}
          </div>
          <div className="diff-preview-column">
            <h4>New</h4>
            {newObjectUrl ? (
              <iframe src={newObjectUrl} title={`New ${filePath}`} />
            ) : (
              <p>Not present in new version.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!canTextDiff) {
    return (
      <div className="diff-viewer">
        <div className="diff-viewer-header">
          <h3>{filePath}</h3>
          <div className="diff-status-inline-group">
            <DiffStatusIcon status={status} className="inline" title={statusText} ariaLabel={statusText} />
          </div>
        </div>
        <div className="diff-unsupported-file">
          Binary or unsupported file type. Preview is not available for this file.
        </div>
      </div>
    )
  }

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-header">
        <h3>{filePath}</h3>
        <div className="diff-status-inline-group">
          <DiffStatusIcon status={status} className="inline" title={statusText} ariaLabel={statusText} />
          {showLineStats && lineStats && (
            <span className="diff-line-stats">
              <span className="diff-line-stats-added">+{lineStats.added}</span>
              <span className="diff-line-stats-removed">−{lineStats.removed}</span>
            </span>
          )}
        </div>
      </div>
      {fallbackError && <div className="diff-warning">{fallbackError}</div>}
      {diffError && <div className="diff-warning">{diffError}</div>}
      {diffFile ? (
        <div className="git-diff-view-wrapper">
          <DiffView
            diffFile={diffFile}
            diffViewMode={diffViewLayout === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified}
            diffViewHighlight
            diffViewWrap={wordWrap}
            diffViewTheme="light"
            diffViewFontSize={12}
            style={diffViewStyle}
          />
        </div>
      ) : (
        <div className={`diff-fallback-grid ${wordWrap ? 'word-wrap' : 'no-wrap'}`}>
          <div className="diff-fallback-column">
            <h4>Old</h4>
            <pre>{oldText}</pre>
          </div>
          <div className="diff-fallback-column">
            <h4>New</h4>
            <pre>{newText}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
