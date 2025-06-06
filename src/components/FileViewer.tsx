import { useEffect, useState } from 'react'
import type { FileEntry } from '../types'
import { getFileType } from '../types'
import Prism from 'prismjs'
import 'prismjs/themes/prism.css'
import 'prismjs/components/prism-latex'
import 'prismjs-bibtex'

interface FileViewerProps {
  file: FileEntry
  wordWrap?: boolean
}

export default function FileViewer({ file, wordWrap = true }: FileViewerProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>('')

  useEffect(() => {
    setImageUrl('')
    setContent('')
    
    const loadFileContent = async () => {
      if (file.content !== null) {
        setContent(file.content)
        return
      }

      setLoading(true)
      try {
        const fileType = getFileType(file.name)
        
        if (fileType === 'image') {
          const blob = await file.zipFile.async('blob')
          const url = URL.createObjectURL(blob)
          setImageUrl(url)
        } else {
          const text = await file.zipFile.async('text')
          setContent(text)
          file.content = text
        }
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
    }
  }, [file])

  useEffect(() => {
    if (content && !loading) {
      Prism.highlightAll()
    }
  }, [content, loading])

  const fileType = getFileType(file.name)

  if (loading) {
    return <div className="file-viewer-loading">Loading file content...</div>
  }

  if (fileType === 'image') {
    return (
      <div className="file-viewer">
        <div className="file-header">
          <h3>{file.name}</h3>
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
        </div>
        <div className="file-content">
          <p>PDF preview not available. This is a PDF file from the source package.</p>
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
    const lines = content.split('\n')
    return (
      <div className={`code-container ${wordWrap ? 'word-wrap' : 'no-wrap'}`}>
        <div className="line-numbers">
          {lines.map((_, index) => (
            <div key={index + 1} className="line-number">
              {index + 1}
            </div>
          ))}
        </div>
        <div className="code-content">
          <pre>
            <code className={getLanguageClass()}>
              {content}
            </code>
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="file-viewer">
      <div className="file-header">
        <h3>{file.name}</h3>
        <span className="file-type">{fileType.toUpperCase()}</span>
      </div>
      <div className="file-content">
        {renderWithLineNumbers(content)}
      </div>
    </div>
  )
}