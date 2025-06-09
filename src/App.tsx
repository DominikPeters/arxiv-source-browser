import { useState, useEffect } from 'react'
import './App.css'
import ArxivInput from './components/ArxivInput'
import FileBrowser from './components/FileBrowser'
import FileViewer from './components/FileViewer'
import Settings from './components/Settings'
import Toast from './components/Toast'
import type { FileEntry } from './types'
import { parseURL, buildURL, extractArxivId } from './types'
import { API_BASE_URL, BASE_URL } from './config'

interface ExamplePaper {
  id: string
  title: string
  authors: string
}

const EXAMPLE_PAPERS: ExamplePaper[] = [
  {
    id: '1706.03762',
    title: 'Attention Is All You Need',
    authors: 'Vaswani et al.'
  },
  {
    id: '1406.2661',
    title: 'Generative Adversarial Networks',
    authors: 'Goodfellow et al.'
  },
  {
    id: '1312.5602',
    title: 'Playing Atari with Deep Reinforcement Learning',
    authors: 'Mnih et al.'
  },
  {
    id: '2005.14165',
    title: 'Language Models are Few-Shot Learners',
    authors: 'Brown et al.'
  }
]

async function findMainTexFile(files: FileEntry[]): Promise<FileEntry | null> {
  // Filter .tex files
  const texFiles = files.filter(file => 
    file.name.toLowerCase().endsWith('.tex')
  )
  
  // If no .tex files, return null
  if (texFiles.length === 0) {
    return null
  }
  
  // If exactly 1 .tex file, return it
  if (texFiles.length === 1) {
    return texFiles[0]
  }
  
  // If multiple .tex files, find the one containing \begin{document}
  for (const file of texFiles) {
    try {
      const content = await file.zipFile.async('string')
      if (content.includes('\\begin{document}')) {
        return file
      }
    } catch (error) {
      console.error('Error reading file content:', error)
    }
  }
  
  // If no file contains \begin{document}, return null
  return null
}

function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [wordWrap, setWordWrap] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [zipBlob, setZipBlob] = useState<Blob | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [paperId, setPaperId] = useState('')
  const [fileBrowserCollapsed, setFileBrowserCollapsed] = useState(false)

  // Auto-uncollapse file browser when screen size increases above mobile breakpoint
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && fileBrowserCollapsed) {
        setFileBrowserCollapsed(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [fileBrowserCollapsed])

  // Handle initial URL loading on mount
  useEffect(() => {
    const urlState = parseURL(window.location.pathname)
    if (urlState.arxivId) {
      handleArxivSubmit(urlState.arxivId)
    }
  }, []) // Empty dependency array for initial load only

  // Handle browser navigation (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const urlState = parseURL(window.location.pathname)
      if (urlState.arxivId && urlState.arxivId !== paperId) {
        // Load new paper
        setPaperId(urlState.arxivId)
        handleArxivSubmit(urlState.arxivId)
      } else if (!urlState.arxivId && paperId) {
        // Navigate back to home
        handleLogoClick()
      } else if (urlState.arxivId === paperId && files.length > 0) {
        // Same paper, different file
        const targetFile = files.find(f => f.path === urlState.filePath)
        if (targetFile) {
          setSelectedFile(targetFile)
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, []) // Remove paperId dependency to prevent triggering on initial load

  // Handle file selection from URL after files are loaded
  useEffect(() => {
    if (files.length > 0 && paperId) {
      const urlState = parseURL(window.location.pathname)
      if (urlState.filePath && urlState.arxivId === paperId) {
        const targetFile = files.find(f => f.path === urlState.filePath)
        if (targetFile && targetFile !== selectedFile) {
          setSelectedFile(targetFile)
        }
      }
    }
  }, [files, paperId, selectedFile])

  const handleArxivSubmit = async (url: string) => {
    setLoading(true)
    try {
      const arxivId = extractArxivId(url)
      if (!arxivId) {
        throw new Error('Invalid arXiv URL or ID')
      }

      const response = await fetch(`${API_BASE_URL}api/api.php?url=${encodeURIComponent(url)}`)
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
      setPaperId(arxivId)
      
      // Check if we should select a specific file from URL
      const currentUrlState = parseURL(window.location.pathname)
      let selectedFile: FileEntry | null = null
      
      if (currentUrlState.filePath && currentUrlState.arxivId === arxivId) {
        // Try to find the specific file from URL
        selectedFile = fileEntries.find(f => f.path === currentUrlState.filePath) || null
      }
      
      // If no specific file found, find and select the main .tex file
      if (!selectedFile) {
        selectedFile = await findMainTexFile(fileEntries)
      }
      
      setSelectedFile(selectedFile)
      
      // Update URL - push new state to history
      const newURL = buildURL(arxivId, selectedFile?.path)
      window.history.pushState(null, '', newURL)
    } catch (error) {
      console.error('Error fetching arXiv source:', error)
      setToastMessage('Error fetching arXiv source. Please check the URL and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (file: FileEntry) => {
    setSelectedFile(file)
    
    // Update URL with file path (cosmetic update after interface change)
    if (paperId) {
      const newURL = buildURL(paperId, file.path)
      window.history.pushState(null, '', newURL)
    }
    
    // Auto-collapse on small screens when a file is selected
    if (window.innerWidth <= 768) {
      setFileBrowserCollapsed(true)
    }
  }

  const handleToggleFileBrowser = () => {
    setFileBrowserCollapsed(!fileBrowserCollapsed)
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

  const handleLogoClick = () => {
    setFiles([])
    setSelectedFile(null)
    setZipBlob(null)
    setPaperId('')
    window.history.pushState(null, '', BASE_URL)
  }

  const handleExampleClick = (examplePaperId: string) => {
    setPaperId(examplePaperId)
    handleArxivSubmit(examplePaperId)
  }

  return (
    <div className={`app ${files.length > 0 ? 'has-files' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <h1 onClick={handleLogoClick} className="app-logo">arXiv Source Browser</h1>
          <ArxivInput 
            onSubmit={handleArxivSubmit} 
            loading={loading} 
            value={paperId}
            onChange={setPaperId}
          />
          <button 
            className="settings-button"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
        {files.length === 0 && (
          <div className="start-page">
            <div className="welcome-section">
              <h2>Browse arXiv LaTeX Source Files</h2>
              <p className="description">
                Explore the LaTeX source code of papers from arXiv. 
                View, navigate, and download the raw files that researchers use to create their publications.
              </p>
            </div>
            
            <div className="features-section">
              <h3>What you can do:</h3>
              <ul className="features-list">
                <li>📁 Browse all source files in an interactive file tree</li>
                <li>📝 View LaTeX files with syntax highlighting</li>
                <li>🖼️ Preview images and PDFs embedded in papers</li>
                <li>💾 Download the complete source as a ZIP file</li>
              </ul>
            </div>
            
            <div className="examples-section">
              <h3>Try these example papers:</h3>
              <div className="example-papers">
                {EXAMPLE_PAPERS.map((paper) => (
                  <button
                    key={paper.id}
                    className="example-paper"
                    onClick={() => handleExampleClick(paper.id)}
                    disabled={loading}
                  >
                    <div className="paper-id">{paper.id}</div>
                    <div className="paper-title">{paper.title}</div>
                    <div className="paper-authors">{paper.authors}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="about-section">
              <p>This website is maintained by <a href="https://dominik-peters.de">Dominik Peters</a> and is not affiliated with arXiv.org.</p>
              <p>First published: June 2025. Last updated: June 2025, version 1.</p>
              <p>Source code is available on <a href="https://github.com/DominikPeters/arxiv-source-browser">GitHub</a> under MIT license. The app was mostly implemented using Claude Code.</p>
            </div>
          </div>
        )}
      </header>
      
      {files.length > 0 && (
        <div className="app-content">
          <div className="file-browser">
            <FileBrowser 
              files={files} 
              onFileSelect={handleFileSelect} 
              selectedFile={selectedFile} 
              onDownloadZip={handleDownloadZip}
              isCollapsed={fileBrowserCollapsed}
              onToggleCollapse={handleToggleFileBrowser}
            />
          </div>
          <div className="file-viewer-container">
            {selectedFile ? (
              <FileViewer 
                file={selectedFile} 
                wordWrap={wordWrap} 
                onError={setToastMessage}
                files={files}
                onFileSelect={handleFileSelect}
              />
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

      {toastMessage && (
        <Toast 
          message={toastMessage}
          type="error"
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  )
}

export default App
