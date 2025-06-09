import { useEffect, useState } from 'react'
import { Download, Copy } from 'lucide-react'
import type { FileEntry } from '../types'
import { getFileType } from '../types'
import Prism from 'prismjs'
import 'prismjs/themes/prism.css'
import 'prismjs/components/prism-latex'
import 'prismjs-bibtex'
import 'prismjs/plugins/line-numbers/prism-line-numbers.js'
import 'prismjs/plugins/line-numbers/prism-line-numbers.css'

// Ensure Prism is available globally for plugins
if (typeof window !== 'undefined') {
  (window as any).Prism = Prism;
}

let latexInputLinkerInstalled = false
let currentFiles: FileEntry[] = []
const inputLinkMap: Map<string, FileEntry> = new Map()

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
              // Store the mapping for later use in wrap hook
              const content = `\\input{${filename}}`
              inputLinkMap.set(content, linkedFile)
              
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
                // Store the mapping for later use in wrap hook
                const content = `\\includegraphics{${filename}}`
                inputLinkMap.set(content, linkedFile)
                
                // Replace all tokens from i to endIndex with a single link token
                const linkToken = new Prism.Token('latex-graphics-link', content, undefined, content)
                
                tokens.splice(i, endIndex - i + 1, linkToken)
              }
            }
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
      const linkedFile = inputLinkMap.get(env.content)
      
      if (linkedFile) {
        let match, linkType
        
        if (env.type === 'latex-input-link') {
          match = env.content.match(/\\input\{([^}]+)\}/)
          linkType = 'input'
        } else {
          match = env.content.match(/\\includegraphics\{([^}]+)\}/)
          linkType = 'graphics'
        }
        
        const inputPath = match ? match[1] : 'unknown'
        
        env.tag = 'span'
        env.attributes.class = env.type === 'latex-input-link' ? 'latex-input-link' : 'latex-graphics-link'
        env.attributes.title = `Click to open: ${inputPath}`
        env.attributes['data-input-path'] = inputPath
        env.attributes['data-link-type'] = linkType
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
}

export default function FileViewer({ file, wordWrap = true, onError, files, onFileSelect }: FileViewerProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [pdfUrl, setPdfUrl] = useState<string>('')

  useEffect(() => {
    setImageUrl('')
    setContent('')
    setPdfUrl('')
    
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
    if (content && !loading) {
      if (files && onFileSelect) {
        setupLatexInputLinker(files)
      }
      Prism.highlightAll()
      
      // Add click handler for LaTeX links
      const handleLatexLinkClick = (event: MouseEvent) => {
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
        }
      }
      
      document.addEventListener('click', handleLatexLinkClick)
      
      return () => {
        document.removeEventListener('click', handleLatexLinkClick)
      }
    }
  }, [content, loading, wordWrap, files, onFileSelect])

  const fileType = getFileType(file.name)

  const downloadFile = async () => {
    try {
      const blob = await file.zipFile.async('blob')
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
        return
      }
      
      if (fileType === 'pdf') {
        onError?.('Cannot copy PDF files to clipboard')
        return
      }
      
      let textContent = content
      if (!textContent && file.content === null) {
        textContent = await file.zipFile.async('text')
      }
      
      await navigator.clipboard.writeText(textContent)
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      onError?.('Failed to copy to clipboard')
    }
  }

  const shouldShowCopyButton = () => {
    const fileType = getFileType(file.name)
    return fileType !== 'pdf'
  }

  if (loading) {
    return <div className="file-viewer-loading">Loading file content...</div>
  }

  if (fileType === 'image') {
    return (
      <div className="file-viewer">
        <div className="file-header">
          <h3>{file.name}</h3>
          <div className="file-actions">
            {shouldShowCopyButton() && (
              <button 
                className="copy-file-button"
                onClick={copyToClipboard}
                title="Copy to clipboard"
              >
                <Copy size={16} />
              </button>
            )}
            <button 
              className="download-file-button"
              onClick={downloadFile}
              title={`Download ${file.name}`}
            >
              <Download size={16} />
            </button>
          </div>
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
          <div className="file-actions">
            {shouldShowCopyButton() && (
              <button 
                className="copy-file-button"
                onClick={copyToClipboard}
                title="Copy to clipboard"
              >
                <Copy size={16} />
              </button>
            )}
            <button 
              className="download-file-button"
              onClick={downloadFile}
              title={`Download ${file.name}`}
            >
              <Download size={16} />
            </button>
          </div>
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
        <div className="file-actions">
          {shouldShowCopyButton() && (
            <button 
              className="copy-file-button"
              onClick={copyToClipboard}
              title="Copy to clipboard"
            >
              <Copy size={16} />
            </button>
          )}
          <button 
            className="download-file-button"
            onClick={downloadFile}
            title={`Download ${file.name}`}
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      <div className="file-content">
        {renderWithLineNumbers(content)}
      </div>
    </div>
  )
}