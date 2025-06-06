import { useState } from 'react'
import './App.css'
import ArxivInput from './components/ArxivInput'
import FileBrowser from './components/FileBrowser'
import FileViewer from './components/FileViewer'
import Settings from './components/Settings'
import type { FileEntry } from './types'

function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [wordWrap, setWordWrap] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [zipBlob, setZipBlob] = useState<Blob | null>(null)

  const handleArxivSubmit = async (url: string) => {
    setLoading(true)
    try {
      const response = await fetch(`./api/api.php?url=${encodeURIComponent(url)}`)
      if (!response.ok) {
        throw new Error('Failed to fetch arXiv source')
      }
      
      const blob = await response.blob()
      setZipBlob(blob)
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(blob)
      
      const fileEntries: FileEntry[] = []
      zip.forEach((relativePath, file) => {
        if (!file.dir) {
          fileEntries.push({
            name: relativePath,
            path: relativePath,
            content: null,
            zipFile: file
          })
        }
      })
      
      setFiles(fileEntries)
      setSelectedFile(null)
    } catch (error) {
      console.error('Error fetching arXiv source:', error)
      alert('Error fetching arXiv source. Please check the URL and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (file: FileEntry) => {
    setSelectedFile(file)
  }

  const handleDownloadZip = () => {
    if (!zipBlob) return
    
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arxiv-source.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>arXiv Source Browser</h1>
          <ArxivInput onSubmit={handleArxivSubmit} loading={loading} />
          <button 
            className="settings-button"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
        {files.length === 0 && (
          <div className="how-to">
            <p>Enter an arXiv URL or paper ID to browse LaTeX source files. Supports formats like:</p>
            <ul>
              <li><strong>URL:</strong> https://arxiv.org/abs/2402.10439</li>
              <li><strong>Paper ID:</strong> 2402.10439</li>
            </ul>
          </div>
        )}
      </header>
      
      {files.length > 0 && (
        <div className="app-content">
          <div className="file-browser">
            <FileBrowser files={files} onFileSelect={handleFileSelect} selectedFile={selectedFile} onDownloadZip={handleDownloadZip} />
          </div>
          <div className="file-viewer">
            {selectedFile ? (
              <FileViewer file={selectedFile} wordWrap={wordWrap} />
            ) : (
              <div className="no-file-selected">
                Select a file to view its contents
              </div>
            )}
          </div>
        </div>
      )}
      
      {showSettings && (
        <Settings 
          wordWrap={wordWrap}
          onWordWrapChange={setWordWrap}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

export default App
