import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Copy, Check, Percent } from 'lucide-react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { estimateTokenCount } from 'tokenx'
import type { FileEntry } from '../types'
import { getFileType } from '../types'
import { buildVisibleLineMapAfterCommentStrip, stripLatexComments } from '../latexComments'
import {
  createCodeViewerExtensionController,
  type CodeViewerConfig,
  type CodeViewerExtensionController,
} from '../codemirror/extensions'
import type { CodeViewerMode } from '../codemirror/language'
import {
  createLatexLinkClickExtension,
  createLatexLinkDecorationsExtension,
  type LatexLinkSpan,
} from '../codemirror/latexLinks'

let currentFiles: FileEntry[] = []

async function findLabelInFiles(label: string): Promise<{ file: FileEntry; lineNumber: number } | null> {
  const labelPattern = new RegExp(`\\\\label\\{${label.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}\\}`)

  for (const file of currentFiles) {
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.tex')) {
      continue
    }

    try {
      const content = file.content !== null ? file.content : await file.zipFile.async('text')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const visibleLine = stripLatexComments(lines[i])
        if (visibleLine && labelPattern.test(visibleLine)) {
          return { file, lineNumber: i }
        }
      }
    } catch (error) {
      console.error(`Error searching file ${file.name}:`, error)
    }
  }

  return null
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.gif']

function findFileByLatexPath(inputPath: string, isImage: boolean): FileEntry | null {
  let cleanPath = inputPath.trim()
  if (cleanPath.startsWith('./')) {
    cleanPath = cleanPath.substring(2)
  }

  if (isImage) {
    const hasExtension = IMAGE_EXTENSIONS.some((ext) => cleanPath.toLowerCase().endsWith(ext))
    const pathsToTry = hasExtension ? [cleanPath] : IMAGE_EXTENSIONS.map((ext) => cleanPath + ext)

    for (const pathToTry of pathsToTry) {
      for (const file of currentFiles) {
        if (file.name === pathToTry || file.path === pathToTry) {
          return file
        }

        const fileName = file.name.split('/').pop() || ''
        if (fileName === pathToTry) {
          return file
        }
      }
    }

    return null
  }

  if (!cleanPath.endsWith('.tex')) {
    cleanPath += '.tex'
  }

  for (const file of currentFiles) {
    if (file.name === cleanPath || file.path === cleanPath) {
      return file
    }

    const fileName = file.name.split('/').pop() || ''
    if (fileName === cleanPath) {
      return file
    }
  }

  return null
}

interface FileViewerProps {
  file: FileEntry
  wordWrap?: boolean
  onError?: (message: string) => void
  files?: FileEntry[]
  onFileSelect?: (file: FileEntry) => void
  onHideCommentsChange?: (hideComments: boolean) => void
  onVisibleLineChange?: (lineNumber: number) => void
  scrollToLine?: { lineNumber: number; token: number } | null
}

function FileViewer({
  file,
  wordWrap = true,
  onError,
  files,
  onFileSelect,
  onHideCommentsChange,
  onVisibleLineChange,
  scrollToLine = null,
}: FileViewerProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [pdfUrl, setPdfUrl] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [hideComments, setHideComments] = useState(false)
  const [selectionTokenCount, setSelectionTokenCount] = useState<number | null>(null)
  const [hasActiveSelection, setHasActiveSelection] = useState(false)

  const fileType = getFileType(file.name)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const extensionControllerRef = useRef<CodeViewerExtensionController | null>(null)
  const clearJumpHighlightTimerRef = useRef<number | null>(null)
  const visibleLineRafRef = useRef<number | null>(null)
  const lastVisibleLineRef = useRef<number | null>(null)

  const displayContent = useMemo(() => {
    if (fileType === 'tex' && hideComments) {
      return stripLatexComments(content)
    }
    return content
  }, [content, fileType, hideComments])

  const fullDocumentTokenCount = useMemo(() => {
    if (fileType === 'image' || fileType === 'pdf') {
      return null
    }

    try {
      return estimateTokenCount(displayContent)
    } catch (error) {
      console.error('Error estimating token count:', error)
      return null
    }
  }, [displayContent, fileType])

  const estimatedTokenCount = hasActiveSelection && selectionTokenCount !== null
    ? selectionTokenCount
    : fullDocumentTokenCount

  const getCodeViewerMode = useCallback((currentFileType: ReturnType<typeof getFileType>): CodeViewerMode => {
    switch (currentFileType) {
      case 'tex':
        return 'tex'
      case 'bib':
        return 'bib'
      default:
        return 'plain'
    }
  }, [])

  const destroyEditor = useCallback(() => {
    if (clearJumpHighlightTimerRef.current !== null) {
      window.clearTimeout(clearJumpHighlightTimerRef.current)
      clearJumpHighlightTimerRef.current = null
    }

    if (visibleLineRafRef.current !== null) {
      window.cancelAnimationFrame(visibleLineRafRef.current)
      visibleLineRafRef.current = null
    }

    if (editorViewRef.current) {
      editorViewRef.current.destroy()
      editorViewRef.current = null
    }

    lastVisibleLineRef.current = null
    extensionControllerRef.current = null
  }, [])

  const getTopVisibleLineNumber = useCallback((editorView: EditorView): number => {
    const scrollSpyAnchorRatio = 0.33
    const blocks = editorView.viewportLineBlocks
    if (blocks.length > 0) {
      const anchorIndex = Math.min(
        blocks.length - 1,
        Math.max(0, Math.floor((blocks.length - 1) * scrollSpyAnchorRatio))
      )
      return editorView.state.doc.lineAt(blocks[anchorIndex].from).number
    }

    const block = editorView.lineBlockAtHeight(editorView.scrollDOM.scrollTop + editorView.documentTop + 1)
    return editorView.state.doc.lineAt(block.from).number
  }, [])

  const reportVisibleLine = useCallback((editorView: EditorView, force = false) => {
    if (!onVisibleLineChange || fileType !== 'tex') {
      return
    }

    const lineNumber = getTopVisibleLineNumber(editorView)
    if (!force && lastVisibleLineRef.current === lineNumber) {
      return
    }

    lastVisibleLineRef.current = lineNumber
    onVisibleLineChange(lineNumber)
  }, [fileType, getTopVisibleLineNumber, onVisibleLineChange])

  const updateSelectionTokenEstimate = useCallback((editorView: EditorView) => {
    if (fileType === 'image' || fileType === 'pdf') {
      setHasActiveSelection(false)
      setSelectionTokenCount(null)
      return
    }

    const nonEmptyRanges = editorView.state.selection.ranges.filter((range) => !range.empty)
    if (nonEmptyRanges.length === 0) {
      setHasActiveSelection(false)
      setSelectionTokenCount(null)
      return
    }

    const selectedText = nonEmptyRanges
      .map((range) => editorView.state.doc.sliceString(range.from, range.to))
      .join('\n')

    try {
      setSelectionTokenCount(estimateTokenCount(selectedText))
      setHasActiveSelection(true)
    } catch (error) {
      console.error('Error estimating selected token count:', error)
      setHasActiveSelection(false)
      setSelectionTokenCount(null)
    }
  }, [fileType])

  const scheduleVisibleLineReport = useCallback((editorView: EditorView, force = false) => {
    if (!onVisibleLineChange || fileType !== 'tex') {
      return
    }

    if (visibleLineRafRef.current !== null) {
      return
    }

    visibleLineRafRef.current = window.requestAnimationFrame(() => {
      visibleLineRafRef.current = null
      reportVisibleLine(editorView, force)
    })
  }, [fileType, onVisibleLineChange, reportVisibleLine])

  const scrollToLineNumber = useCallback((lineNumber: number, behavior: ScrollBehavior = 'smooth'): boolean => {
    const editorView = editorViewRef.current
    const extensionController = extensionControllerRef.current

    if (!editorView || !extensionController || lineNumber < 1 || lineNumber > editorView.state.doc.lines) {
      return false
    }

    const line = editorView.state.doc.line(lineNumber)
    const targetRatioFromTop = 0.33
    const positionLine = (scrollBehavior: ScrollBehavior): boolean => {
      const scroller = editorView.scrollDOM
      const coords = editorView.coordsAtPos(line.from)
      if (!coords) {
        return false
      }

      const scrollerRect = scroller.getBoundingClientRect()
      const desiredTopOffset = scroller.clientHeight * targetRatioFromTop
      const targetTop = scroller.scrollTop + (coords.top - scrollerRect.top) - desiredTopOffset
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      const clampedTop = Math.min(maxTop, Math.max(0, targetTop))
      scroller.scrollTo({ top: clampedTop, behavior: scrollBehavior })
      return true
    }

    editorView.dispatch({
      selection: { anchor: line.from },
    })

    if (!positionLine(behavior)) {
      const scrollerHeight = editorView.scrollDOM.clientHeight
      editorView.dispatch({
        effects: EditorView.scrollIntoView(line.from, {
          y: 'start',
          yMargin: Math.max(5, Math.floor(scrollerHeight * targetRatioFromTop)),
        }),
      })
    }
    window.setTimeout(() => {
      if (editorViewRef.current === editorView) {
        positionLine('auto')
      }
    }, 70)

    extensionController.setJumpLine(editorView, lineNumber)
    scheduleVisibleLineReport(editorView, true)
    if (clearJumpHighlightTimerRef.current !== null) {
      window.clearTimeout(clearJumpHighlightTimerRef.current)
    }

    clearJumpHighlightTimerRef.current = window.setTimeout(() => {
      if (editorViewRef.current && extensionControllerRef.current) {
        extensionControllerRef.current.setJumpLine(editorViewRef.current, null)
      }
    }, 1600)

    return true
  }, [scheduleVisibleLineReport])

  const handleLatexLinkClick = useCallback(
    async (link: LatexLinkSpan) => {
      if (!files || !onFileSelect) {
        return
      }

      if (link.kind === 'input' || link.kind === 'graphics') {
        const linkedFile = findFileByLatexPath(link.payload, link.kind === 'graphics')
        if (linkedFile) {
          onFileSelect(linkedFile)
        }
        return
      }

      if (link.kind === 'ref') {
        try {
          const result = await findLabelInFiles(link.payload)
          if (!result) {
            onError?.(`Label '${link.payload}' not found`)
            return
          }

          onFileSelect(result.file)

          let targetLineNumber = result.lineNumber + 1
          // Hide-comments mode removes full-line comments, so map original line numbers
          // into the rendered document line numbers before attempting to scroll.
          if (hideComments && result.file.path === file.path) {
            const fileContent = content || result.file.content || await result.file.zipFile.async('text')
            const lineMap = buildVisibleLineMapAfterCommentStrip(fileContent)
            const mappedLine = lineMap[result.lineNumber]
            if (mappedLine && mappedLine > 0) {
              targetLineNumber = mappedLine
            }
          }

          let retries = 0
          const maxRetries = 2
          const attemptScroll = () => {
            if (scrollToLineNumber(targetLineNumber)) {
              return
            }

            if (retries < maxRetries) {
              retries++
              window.setTimeout(attemptScroll, 100)
            }
          }

          window.setTimeout(attemptScroll, 100)
        } catch (error) {
          console.error('Error searching for label:', error)
          onError?.(`Error searching for label '${link.payload}'`)
        }
      }
    },
    [content, file.path, files, hideComments, onFileSelect, onError, scrollToLineNumber]
  )

  const editorInteractionExtension = useMemo(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        updateSelectionTokenEstimate(update.view)
      }

      if (fileType === 'tex' && (update.viewportChanged || update.docChanged)) {
        scheduleVisibleLineReport(update.view)
      }
    })

    if (fileType !== 'tex') {
      return [updateListener]
    }

    return [
      createLatexLinkDecorationsExtension('tex'),
      createLatexLinkClickExtension((link) => {
        void handleLatexLinkClick(link)
      }),
      updateListener,
    ]
  }, [fileType, handleLatexLinkClick, scheduleVisibleLineReport, updateSelectionTokenEstimate])

  useEffect(() => {
    onHideCommentsChange?.(hideComments)
  }, [hideComments, onHideCommentsChange])

  useEffect(() => {
    currentFiles = files || []
  }, [files])

  useEffect(() => {
    setImageUrl('')
    setContent('')
    setPdfUrl('')
    setHideComments(false)
    setHasActiveSelection(false)
    setSelectionTokenCount(null)

    window.scrollTo(0, 0)

    const loadFileContent = async () => {
      const selectedFileType = getFileType(file.name)

      if (selectedFileType === 'image') {
        setLoading(true)
        try {
          const blob = await file.zipFile.async('blob')
          const url = URL.createObjectURL(blob)
          setImageUrl(url)
        } catch (error) {
          console.error('Error loading image:', error)
        } finally {
          setLoading(false)
        }
        return
      }

      if (selectedFileType === 'pdf') {
        setLoading(true)
        try {
          const blob = await file.zipFile.async('blob')
          const pdfBlob = new Blob([blob], { type: 'application/pdf' })
          const url = URL.createObjectURL(pdfBlob)
          setPdfUrl(url)
        } catch (error) {
          console.error('Error loading PDF:', error)
        } finally {
          setLoading(false)
        }
        return
      }

      if (file.content !== null) {
        setContent(file.content)
        return
      }

      setLoading(true)
      try {
        const text = await file.zipFile.async('text')
        setContent(text)
        file.content = text
      } catch (error) {
        console.error('Error loading file content:', error)
        setContent('Error loading file content')
      } finally {
        setLoading(false)
      }
    }

    loadFileContent()

    return () => {
      setImageUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return ''
      })
      setPdfUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return ''
      })
    }
  }, [file])

  useEffect(() => {
    return () => {
      destroyEditor()
    }
  }, [destroyEditor])

  useEffect(() => {
    const editorView = editorViewRef.current
    if (!editorView || fileType !== 'tex' || !onVisibleLineChange) {
      return
    }

    const handleScroll = () => {
      scheduleVisibleLineReport(editorView)
    }

    editorView.scrollDOM.addEventListener('scroll', handleScroll, { passive: true })
    scheduleVisibleLineReport(editorView, true)

    return () => {
      editorView.scrollDOM.removeEventListener('scroll', handleScroll)
    }
  }, [displayContent, fileType, onVisibleLineChange, scheduleVisibleLineReport])

  useEffect(() => {
    if (fileType === 'image' || fileType === 'pdf') {
      destroyEditor()
      return
    }

    if (loading) {
      // The host node is not rendered while loading. Destroy stale views so
      // we always remount into the current host once loading completes.
      destroyEditor()
      return
    }

    if (!editorContainerRef.current) {
      return
    }

    const config: CodeViewerConfig = {
      mode: getCodeViewerMode(fileType),
      wordWrap,
      readOnly: true,
    }

    if (!editorViewRef.current) {
      const controller = createCodeViewerExtensionController(config, editorInteractionExtension)
      const state = EditorState.create({
        doc: displayContent,
        extensions: controller.extensions,
      })

      const editorView = new EditorView({
        state,
        parent: editorContainerRef.current,
      })

      extensionControllerRef.current = controller
      editorViewRef.current = editorView
      return
    }

    const editorView = editorViewRef.current
    const extensionController = extensionControllerRef.current
    if (!extensionController) {
      return
    }

    extensionController.reconfigure(editorView, config)
    extensionController.setInteraction(editorView, editorInteractionExtension)

    if (editorView.state.doc.toString() !== displayContent) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: displayContent,
        },
      })
    }
  }, [displayContent, fileType, getCodeViewerMode, loading, wordWrap, editorInteractionExtension, destroyEditor])

  useEffect(() => {
    if (!scrollToLine || fileType !== 'tex' || loading) {
      return
    }

    let retries = 0
    const maxRetries = 8

    const attemptScroll = () => {
      if (scrollToLineNumber(scrollToLine.lineNumber)) {
        return
      }

      if (retries < maxRetries) {
        retries++
        window.setTimeout(attemptScroll, 80)
      }
    }

    window.setTimeout(attemptScroll, 80)
  }, [scrollToLine?.token, scrollToLine?.lineNumber, loading, fileType, displayContent, scrollToLine, scrollToLineNumber])

  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => {
        setCopySuccess(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [copySuccess])

  const shouldShowCommentToggle = () => {
    return fileType === 'tex'
  }

  const getCurrentTextContent = async () => {
    let textContent = content
    if (!textContent && file.content === null) {
      textContent = await file.zipFile.async('text')
    }
    return fileType === 'tex' && hideComments ? stripLatexComments(textContent) : textContent
  }

  const downloadFile = async () => {
    try {
      let blob: Blob

      if (fileType === 'tex' && hideComments) {
        const textContent = await getCurrentTextContent()
        blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' })
      } else {
        blob = await file.zipFile.async('blob')
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading file:', error)
      onError?.('Error downloading file')
    }
  }

  const copyToClipboard = async () => {
    try {
      const selectedFileType = getFileType(file.name)

      if (selectedFileType === 'image') {
        const blob = await file.zipFile.async('blob')
        const extension = file.name.toLowerCase().split('.').pop()
        let mimeType

        switch (extension) {
          case 'png':
            mimeType = 'image/png'
            break
          case 'jpg':
          case 'jpeg':
            mimeType = 'image/jpeg'
            break
          case 'gif':
            mimeType = 'image/gif'
            break
          case 'webp':
            mimeType = 'image/webp'
            break
          default:
            mimeType = 'image/png'
        }

        const typedBlob = new Blob([blob], { type: mimeType })

        await navigator.clipboard.write([
          new ClipboardItem({
            [mimeType]: typedBlob,
          }),
        ])
        setCopySuccess(true)
        return
      }

      if (selectedFileType === 'pdf') {
        onError?.('Cannot copy PDF files to clipboard')
        return
      }

      const textContent = await getCurrentTextContent()
      await navigator.clipboard.writeText(textContent)
      setCopySuccess(true)
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      onError?.('Failed to copy to clipboard')
    }
  }

  const shouldShowCopyButton = () => {
    return fileType !== 'pdf'
  }

  const renderFileActions = () => {
    const copyTooltip = copySuccess
      ? 'Copied to clipboard'
      : fileType === 'tex' && hideComments
        ? 'Copy without LaTeX comments'
        : 'Copy to clipboard'
    const downloadTooltip = fileType === 'tex' && hideComments ? 'Download without comments' : 'Download file'

    return (
      <div className="file-actions">
        {shouldShowCommentToggle() && (
          <button
            className={`comment-toggle-button ${hideComments ? 'active' : ''}`}
            onClick={() => setHideComments((prev) => !prev)}
            data-tooltip={hideComments ? 'Show LaTeX comments' : 'Hide LaTeX comments'}
            aria-label={hideComments ? 'Show LaTeX comments' : 'Hide LaTeX comments'}
            aria-pressed={hideComments}
          >
            <Percent size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        {shouldShowCopyButton() && (
          <button
            className={`copy-file-button ${copySuccess ? 'success' : ''}`}
            onClick={copyToClipboard}
            data-tooltip={copyTooltip}
            aria-label={copyTooltip}
          >
            {copySuccess ? <Check size={16} /> : <Copy size={16} />}
          </button>
        )}
        <button
          className="download-file-button"
          onClick={downloadFile}
          data-tooltip={downloadTooltip}
          aria-label={downloadTooltip}
        >
          <Download size={16} />
        </button>
      </div>
    )
  }

  if (loading) {
    return <div className="file-viewer-loading">Loading file content...</div>
  }

  if (fileType === 'image') {
    return (
      <div className="file-viewer">
        <div className="file-header">
          <h3>{file.name}</h3>
          {renderFileActions()}
        </div>
        <div className="file-content image-content">
          {imageUrl && <img src={imageUrl} alt={file.name} />}
        </div>
      </div>
    )
  }

  if (fileType === 'pdf') {
    return (
      <div className="file-viewer">
        <div className="file-header">
          <h3>{file.name}</h3>
          {renderFileActions()}
        </div>
        <div className="file-content pdf-content">
          {pdfUrl ? (
            <iframe src={pdfUrl} title={file.name} width="100%" style={{ border: 'none', minHeight: '500px' }} />
          ) : (
            <p>Loading PDF...</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="file-viewer">
      <div className="file-header">
        <div className="file-info">
          <h3>{file.name}</h3>
          {fileType !== 'unknown' && <span className="file-type">{fileType.toUpperCase()}</span>}
          {estimatedTokenCount !== null && (
            <span
              className="token-estimate"
              data-tooltip="Estimate of token count when pasted into an LLM"
              aria-label="Estimate of token count when pasted into an LLM"
            >
              {estimatedTokenCount.toLocaleString()} tokens
            </span>
          )}
        </div>
        {renderFileActions()}
      </div>
      <div className="file-content">
        <div className={`cm-viewer ${wordWrap ? 'word-wrap' : 'no-wrap'}`}>
          <div ref={editorContainerRef} className="cm-viewer-host" />
        </div>
      </div>
    </div>
  )
}

export default memo(FileViewer)
