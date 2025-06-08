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

interface FileViewerProps {
  file: FileEntry
  wordWrap?: boolean
  onError?: (message: string) => void
}

export default function FileViewer({ file, wordWrap = true, onError }: FileViewerProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [pdfUrl, setPdfUrl] = useState<string>('')

  useEffect(() => {
    setImageUrl('')
    setContent('')
    setPdfUrl('')
    
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
      Prism.highlightAll()
    }
  }, [content, loading, wordWrap])

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