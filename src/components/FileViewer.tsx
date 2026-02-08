import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Copy, Check, Percent } from 'lucide-react'
import type { FileEntry } from '../types'
import { getFileType } from '../types'
import { normalizeWrappedDisplayText, stripLatexComments } from '../latexComments'
import Prism from 'prismjs'
import 'prismjs/themes/prism.css'
import 'prismjs/components/prism-latex'
import 'prismjs-bibtex'
import 'prismjs/plugins/line-numbers/prism-line-numbers.js'
import 'prismjs/plugins/line-numbers/prism-line-numbers.css'

// Override the default LaTeX comment rule so that the percent sign macro (\%)
// isn't treated as the start of a comment.
Prism.languages.latex.comment = {
  pattern: /(?<!\\)%.*$/m,
}

// Ensure Prism is available globally for plugins
if (typeof window !== 'undefined') {
  ;(window as Window & { Prism?: typeof Prism }).Prism = Prism
}

let latexInputLinkerInstalled = false
let currentFiles: FileEntry[] = []
const inputLinkMap: Map<string, { file: FileEntry; inputPath: string; linkType: 'input' | 'graphics' }> = new Map()
const refLinkMap: Map<string, { command: string; label: string }> = new Map()

async function findLabelInFiles(label: string): Promise<{ file: FileEntry; lineNumber: number } | null> {
  // Search through all .tex files for \label{labelname}
  const labelPattern = new RegExp(`\\\\label\\{${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`)

  for (const file of currentFiles) {
    const fileName = file.name.toLowerCase()
    // Only search in .tex files
    if (!fileName.endsWith('.tex')) {
      continue
    }

    try {
      const content = file.content !== null ? file.content : await file.zipFile.async('text')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        if (labelPattern.test(lines[i])) {
          return { file, lineNumber: i }
        }
      }
    } catch (error) {
      console.error(`Error searching file ${file.name}:`, error)
    }
  }

  return null
}

function setupLatexInputLinker(files: FileEntry[]) {
  currentFiles = files
  inputLinkMap.clear()

  if (latexInputLinkerInstalled) {
    return
  }
  latexInputLinkerInstalled = true

  function findFileByPath(inputPath: string, isImage = false): FileEntry | null {
    let cleanPath = inputPath.trim()

    // Remove leading ./ if present
    if (cleanPath.startsWith('./')) {
      cleanPath = cleanPath.substring(2)
    }

    if (isImage) {
      // For images, try common extensions if no extension is provided
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.gif']
      const hasExtension = imageExtensions.some(ext => cleanPath.toLowerCase().endsWith(ext))

      const pathsToTry = hasExtension ? [cleanPath] : imageExtensions.map(ext => cleanPath + ext)

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
    } else {
      // For .tex files, add .tex extension if missing
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
    }

    return null
  }

  Prism.hooks.add('after-tokenize', (env) => {
    if (env.language !== 'latex') {
      return
    }

    function tokenToText(token: string | object): string {
      if (typeof token === 'string') {
        return token
      }

      if (!token || typeof token !== 'object' || !('content' in token)) {
        return ''
      }

      const content = (token as { content?: unknown }).content
      if (typeof content === 'string') {
        return content
      }
      if (Array.isArray(content)) {
        return content.map((nested) => tokenToText(nested as string | object)).join('')
      }
      if (content && typeof content === 'object') {
        return tokenToText(content as object)
      }

      return ''
    }

    function processTokens(tokens: (string | object)[]): void {
      for (let i = 0; i < tokens.length - 2; i++) {
        const token1 = tokens[i]
        const token2 = tokens[i + 1]

        // Look for pattern: \input + { + filename + }
        if (token1 && typeof token1 === 'object' && 'type' in token1 && 'content' in token1 &&
            token1.type === 'function' && token1.content === '\\input' &&
            token2 && typeof token2 === 'object' && 'type' in token2 && 'content' in token2 &&
            token2.type === 'punctuation' && token2.content === '{') {

          // Find the closing brace and collect content
          let filename = ''
          let endIndex = i + 3
          let foundClosing = false

          for (let j = i + 2; j < tokens.length; j++) {
            const token = tokens[j]
            if (typeof token === 'string') {
              filename += token
            } else if (token && typeof token === 'object' && 'content' in token) {
              const tokenObj = token as { type?: string; content?: string }
              if (tokenObj.type === 'punctuation' && tokenObj.content === '}') {
                foundClosing = true
                endIndex = j
                break
              } else {
                filename += tokenObj.content || ''
              }
            }
          }

          if (foundClosing) {
            const linkedFile = findFileByPath(filename)

            if (linkedFile) {
              // Preserve the original token text so line breaks stay intact.
              const content = tokens
                .slice(i, endIndex + 1)
                .map((token) => tokenToText(token))
                .join('')
              inputLinkMap.set(content, {
                file: linkedFile,
                inputPath: filename,
                linkType: 'input'
              })

              // Replace all tokens from i to endIndex with a single link token
              const linkToken = new Prism.Token('latex-input-link', content, undefined, content)

              tokens.splice(i, endIndex - i + 1, linkToken)
            }
          }
        }

        // Look for pattern: \includegraphics + [optional parameters] + { + filename + }
        if (token1 && typeof token1 === 'object' && 'type' in token1 && 'content' in token1 &&
            token1.type === 'function' && token1.content === '\\includegraphics') {

          // Search for the first '{' token after \includegraphics (skip optional [...] parameters)
          let openBraceIndex = -1
          for (let j = i + 1; j < tokens.length; j++) {
            const token = tokens[j]
            if (token && typeof token === 'object' && 'type' in token && 'content' in token) {
              const tokenObj = token as { type?: string; content?: string }
              if (tokenObj.type === 'punctuation' && tokenObj.content === '{') {
                openBraceIndex = j
                break
              }
            }
          }

          if (openBraceIndex !== -1) {
            // Find the closing brace and collect content
            let filename = ''
            let endIndex = openBraceIndex + 2
            let foundClosing = false

            for (let j = openBraceIndex + 1; j < tokens.length; j++) {
              const token = tokens[j]
              if (typeof token === 'string') {
                filename += token
              } else if (token && typeof token === 'object' && 'content' in token) {
                const tokenObj = token as { type?: string; content?: string }
                if (tokenObj.type === 'punctuation' && tokenObj.content === '}') {
                  foundClosing = true
                  endIndex = j
                  break
                } else {
                  filename += tokenObj.content || ''
                }
              }
            }

            if (foundClosing) {
              const linkedFile = findFileByPath(filename, true)

              if (linkedFile) {
                // Preserve the original token text so line breaks stay intact.
                const content = tokens
                  .slice(i, endIndex + 1)
                  .map((token) => tokenToText(token))
                  .join('')
                inputLinkMap.set(content, {
                  file: linkedFile,
                  inputPath: filename,
                  linkType: 'graphics'
                })

                // Replace all tokens from i to endIndex with a single link token
                const linkToken = new Prism.Token('latex-graphics-link', content, undefined, content)

                tokens.splice(i, endIndex - i + 1, linkToken)
              }
            }
          }
        }

        // Look for reference commands: \ref, \Cref, \cref, \eqref, \pageref, \autoref
        const refCommands = ['\\ref', '\\Cref', '\\cref', '\\eqref', '\\pageref', '\\autoref']
        if (token1 && typeof token1 === 'object' && 'type' in token1 && 'content' in token1 &&
            token1.type === 'function' &&
            refCommands.includes((token1 as { content?: string }).content || '') &&
            token2 && typeof token2 === 'object' && 'type' in token2 && 'content' in token2 &&
            token2.type === 'punctuation' && token2.content === '{') {

          const command = (token1 as { content?: string }).content || ''

          // Find the closing brace and collect label
          let label = ''
          let endIndex = i + 3
          let foundClosing = false

          for (let j = i + 2; j < tokens.length; j++) {
            const token = tokens[j]
            if (typeof token === 'string') {
              label += token
            } else if (token && typeof token === 'object' && 'content' in token) {
              const tokenObj = token as { type?: string; content?: string }
              if (tokenObj.type === 'punctuation' && tokenObj.content === '}') {
                foundClosing = true
                endIndex = j
                break
              } else {
                label += tokenObj.content || ''
              }
            }
          }

          if (foundClosing && label.trim()) {
            // Store the mapping for later use in wrap hook
            const content = tokens
              .slice(i, endIndex + 1)
              .map((token) => tokenToText(token))
              .join('')
            refLinkMap.set(content, { command, label: label.trim() })

            // Replace all tokens from i to endIndex with a single link token
            const linkToken = new Prism.Token('latex-ref-link', content, undefined, content)

            tokens.splice(i, endIndex - i + 1, linkToken)
          }
        }

        // Recursively process nested content
        if (token1 && typeof token1 === 'object' && 'content' in token1 &&
            Array.isArray((token1 as { content: unknown }).content)) {
          processTokens((token1 as { content: (string | object)[] }).content)
        }
      }
    }

    processTokens(env.tokens)
  })

  Prism.hooks.add('wrap', (env) => {
    if (env.type === 'latex-input-link' || env.type === 'latex-graphics-link') {
      const linkInfo = inputLinkMap.get(env.content)

      if (linkInfo) {
        const { inputPath, linkType } = linkInfo

        env.tag = 'span'
        env.attributes.class = env.type === 'latex-input-link' ? 'latex-input-link' : 'latex-graphics-link'
        env.attributes.title = `Click to open: ${inputPath}`
        env.attributes['data-input-path'] = inputPath
        env.attributes['data-link-type'] = linkType
      }
    } else if (env.type === 'latex-ref-link') {
      const refInfo = refLinkMap.get(env.content)

      if (refInfo) {
        const label = refInfo.label

        env.tag = 'span'
        env.attributes.class = 'latex-ref-link'
        env.attributes.title = `Click to go to: ${label}`
        env.attributes['data-label'] = label
        env.attributes['data-ref-type'] = refInfo.command
      }
    }
  })
}

interface FileViewerProps {
  file: FileEntry
  wordWrap?: boolean
  onError?: (message: string) => void
  files?: FileEntry[]
  onFileSelect?: (file: FileEntry) => void
  onHideCommentsChange?: (hideComments: boolean) => void
  scrollToLine?: { lineNumber: number; token: number } | null
}

type PrismWithLineNumbers = typeof Prism & {
  plugins?: {
    lineNumbers?: {
      resize: (element: Element) => void
    }
  }
}

function FileViewer({
  file,
  wordWrap = true,
  onError,
  files,
  onFileSelect,
  onHideCommentsChange,
  scrollToLine = null
}: FileViewerProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [pdfUrl, setPdfUrl] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [hideComments, setHideComments] = useState(false)
  const fileContentRef = useRef<HTMLDivElement>(null)
  const fileType = getFileType(file.name)
  const displayContent = useMemo(() => {
    let renderedContent = content
    if (fileType === 'tex' && hideComments) {
      renderedContent = stripLatexComments(renderedContent)
    }
    if (wordWrap) {
      renderedContent = normalizeWrappedDisplayText(renderedContent)
    }
    return renderedContent
  }, [content, fileType, hideComments, wordWrap])

  useEffect(() => {
    onHideCommentsChange?.(hideComments)
  }, [hideComments, onHideCommentsChange])

  const resizePrismLineNumbers = useCallback(() => {
    const preElement = fileContentRef.current?.querySelector('pre.line-numbers')
    if (!preElement) {
      return
    }

    const prism = Prism as PrismWithLineNumbers
    prism.plugins?.lineNumbers?.resize(preElement)
  }, [])

  const scrollToLineNumber = useCallback((lineNumber: number, behavior: ScrollBehavior = 'smooth'): boolean => {
    if (lineNumber < 1) {
      return false
    }

    const lineNumbersRows = fileContentRef.current?.querySelector('span.line-numbers-rows')
    const lineElement = lineNumbersRows?.children[lineNumber - 1] as HTMLElement | undefined

    if (!lineElement) {
      return false
    }

    lineElement.scrollIntoView({ behavior, block: 'center' })
    lineElement.classList.add('outline-jump-line')
    window.setTimeout(() => {
      lineElement.classList.remove('outline-jump-line')
    }, 1600)
    return true
  }, [])

  useEffect(() => {
    setImageUrl('')
    setContent('')
    setPdfUrl('')
    setHideComments(false)
    
    // Scroll to top when file changes
    window.scrollTo(0, 0)
    
    const loadFileContent = async () => {
      const fileType = getFileType(file.name)
      
      // For non-text files, always load as blob
      if (fileType === 'image') {
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
      
      if (fileType === 'pdf') {
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
      
      // For text files, check if content is already cached
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
      setImageUrl(prev => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return ''
      })
      setPdfUrl(prev => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return ''
      })
    }
  }, [file])

  useEffect(() => {
    if (displayContent && !loading) {
      if (files && onFileSelect) {
        setupLatexInputLinker(files)
      }
      if (fileContentRef.current) {
        Prism.highlightAllUnder(fileContentRef.current)
      } else {
        Prism.highlightAll()
      }

      const timers: number[] = []
      const raf = window.requestAnimationFrame(() => {
        resizePrismLineNumbers()
        timers.push(window.setTimeout(resizePrismLineNumbers, 80))
        timers.push(window.setTimeout(resizePrismLineNumbers, 220))
      })
      
      // Add click handler for LaTeX links
      const handleLatexLinkClick = async (event: MouseEvent) => {
        const target = event.target as HTMLElement

        if (target.classList.contains('latex-input-link') || target.classList.contains('latex-graphics-link')) {
          const inputPath = target.getAttribute('data-input-path')
          const linkType = target.getAttribute('data-link-type')
          if (inputPath && files && onFileSelect) {
            const isImage = linkType === 'graphics'
            const linkedFile = currentFiles.find(file => {
              if (isImage) {
                // For images, try multiple extensions
                const cleanPath = inputPath.startsWith('./') ? inputPath.substring(2) : inputPath
                const imageExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.gif']
                const hasExtension = imageExtensions.some(ext => cleanPath.toLowerCase().endsWith(ext))

                if (hasExtension) {
                  return file.name === cleanPath || file.path === cleanPath ||
                         (file.name.split('/').pop() || '') === cleanPath
                } else {
                  return imageExtensions.some(ext => {
                    const pathWithExt = cleanPath + ext
                    return file.name === pathWithExt || file.path === pathWithExt ||
                           (file.name.split('/').pop() || '') === pathWithExt
                  })
                }
              } else {
                // For .tex files
                const cleanPath = inputPath.endsWith('.tex') ? inputPath : inputPath + '.tex'
                return file.name === cleanPath || file.path === cleanPath ||
                       (file.name.split('/').pop() || '') === cleanPath
              }
            })
            if (linkedFile) {
              onFileSelect(linkedFile)
            }
          }
        } else if (target.classList.contains('latex-ref-link')) {
          const label = target.getAttribute('data-label')
          if (label && files && onFileSelect) {
            try {
              const result = await findLabelInFiles(label)
              if (result) {
                // Select the file containing the label
                onFileSelect(result.file)

                // Scroll to the label after file is loaded (with retry logic)
                let scrollRetries = 0
                const maxRetries = 2

                const attemptScroll = () => {
                  if (scrollToLineNumber(result.lineNumber + 1)) {
                    // Highlight all keyword tokens matching the label
                    const keywords = document.querySelectorAll('span.token.keyword')
                    keywords.forEach(el => {
                      if (el.textContent?.trim() === label) {
                        el.classList.add('highlight-label')
                        setTimeout(() => {
                          el.classList.remove('highlight-label')
                        }, 5000)
                      }
                    })
                  } else if (scrollRetries < maxRetries) {
                    scrollRetries++
                    setTimeout(attemptScroll, 100)
                  }
                }

                setTimeout(attemptScroll, 100)
              } else {
                onError?.(`Label '${label}' not found`)
              }
            } catch (error) {
              console.error('Error searching for label:', error)
              onError?.(`Error searching for label '${label}'`)
            }
          }
        }
      }

      document.addEventListener('click', handleLatexLinkClick)

      return () => {
        window.cancelAnimationFrame(raf)
        timers.forEach((timerId) => window.clearTimeout(timerId))
        document.removeEventListener('click', handleLatexLinkClick)
      }
    }
  }, [displayContent, loading, wordWrap, files, onFileSelect, onError, scrollToLineNumber, resizePrismLineNumbers])

  useEffect(() => {
    if (!fileContentRef.current || fileType !== 'tex') {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      resizePrismLineNumbers()
    })

    resizeObserver.observe(fileContentRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [fileType, resizePrismLineNumbers])

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
      const fileType = getFileType(file.name)
      
      if (fileType === 'image') {
        const blob = await file.zipFile.async('blob')
        const extension = file.name.toLowerCase().split('.').pop()
        let mimeType
        
        // Determine MIME type from file extension
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
            mimeType = 'image/png' // fallback
        }
        
        // Create a new blob with the correct MIME type
        const typedBlob = new Blob([blob], { type: mimeType })
        
        await navigator.clipboard.write([
          new ClipboardItem({
            [mimeType]: typedBlob
          })
        ])
        setCopySuccess(true)
        return
      }
      
      if (fileType === 'pdf') {
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
      : (fileType === 'tex' && hideComments
          ? 'Copy without LaTeX comments'
          : 'Copy to clipboard')
    const downloadTooltip = fileType === 'tex' && hideComments
      ? 'Download without comments'
      : 'Download file'

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
            <iframe 
              src={pdfUrl} 
              title={file.name}
              width="100%" 
              style={{ border: 'none', minHeight: '500px' }}
            />
          ) : (
            <p>Loading PDF...</p>
          )}
        </div>
      </div>
    )
  }

  const getLanguageClass = () => {
    switch (fileType) {
      case 'tex':
        return 'language-latex'
      case 'bib':
        return 'language-bibtex'
      default:
        return 'language-none'
    }
  }

  const renderWithLineNumbers = (content: string) => {
    return (
      <pre className={`line-numbers ${wordWrap ? 'word-wrap' : 'no-wrap'}`} style={wordWrap ? { whiteSpace: 'pre-wrap' } : {}}>
        <code className={getLanguageClass()}>
          {content}
        </code>
      </pre>
    )
  }

  return (
    <div className="file-viewer">
      <div className="file-header">
        <div className="file-info">
          <h3>{file.name}</h3>
          {fileType !== 'unknown' && (
            <span className="file-type">{fileType.toUpperCase()}</span>
          )}
        </div>
        {renderFileActions()}
      </div>
      <div className="file-content" ref={fileContentRef}>
        {renderWithLineNumbers(displayContent)}
      </div>
    </div>
  )
}

export default memo(FileViewer)
