import { useState, useEffect, useRef } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import type { FileEntry } from '../types'
import { getFileType } from '../types'

interface SearchProps {
  files: FileEntry[]
  onFileSelect: (file: FileEntry) => void
  onClose: () => void
}

interface SearchableItem {
  file: FileEntry
  content: string
  filename: string
}

interface SearchResult {
  file: FileEntry
  snippet?: string
  matchType: 'filename' | 'content'
  searchTerm?: string
}

export default function Search({ files, onFileSelect, onClose }: SearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isIndexing, setIsIndexing] = useState(false)
  const [searchIndex, setSearchIndex] = useState<SearchableItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Build search index on component mount
  useEffect(() => {
    const buildIndex = async () => {
      setIsIndexing(true)
      
      const searchItems: SearchableItem[] = []
      
      for (const file of files) {
        let content = ''
        
        // Only load content for text-based files
        const fileType = getFileType(file.name)
        if (fileType === 'tex' || fileType === 'bib' || fileType === 'text') {
          try {
            content = await file.zipFile.async('string')
          } catch (error) {
            console.error(`Error loading content for ${file.path}:`, error)
            content = ''
          }
        }
        
        const item: SearchableItem = {
          file,
          content,
          filename: file.name
        }
        searchItems.push(item)
      }

      setSearchIndex(searchItems)
      setIsIndexing(false)
    }

    buildIndex()
  }, [files])

  // Focus input when component mounts
  useEffect(() => {
    // Small delay to ensure modal is rendered
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // Parse search query into terms (handles mixed quoted and unquoted terms)
  const parseSearchQuery = (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return { terms: [], phrases: [] }
    
    const terms: string[] = []
    const phrases: string[] = []
    
    // Regular expression to match quoted phrases and individual words
    const regex = /"([^"]*)"|(\S+)/g
    let match
    
    while ((match = regex.exec(trimmed)) !== null) {
      if (match[1] !== undefined) {
        // This is a quoted phrase
        const phrase = match[1].trim()
        if (phrase) {
          phrases.push(phrase.toLowerCase())
        }
      } else if (match[2] !== undefined) {
        // This is an individual word
        terms.push(match[2].toLowerCase())
      }
    }
    
    return { terms, phrases }
  }

  // Check if text matches all search terms and phrases (AND logic)
  const matchesAllTerms = (text: string, terms: string[], phrases: string[]) => {
    const lowerText = text.toLowerCase()
    
    // All individual terms must be present
    const allTermsMatch = terms.every(term => lowerText.includes(term))
    
    // All phrases must be present as exact matches
    const allPhrasesMatch = phrases.every(phrase => lowerText.includes(phrase))
    
    return allTermsMatch && allPhrasesMatch
  }

  // Find search terms in text and create highlighted snippet
  const createSnippet = (text: string, terms: string[], phrases: string[]) => {
    const lowerText = text.toLowerCase()
    let matchIndex = -1
    let matchLength = 0
    
    // Find the earliest match among all terms and phrases
    const allSearchItems = [...terms, ...phrases]
    for (const item of allSearchItems) {
      const index = lowerText.indexOf(item)
      if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
        matchIndex = index
        matchLength = item.length
      }
    }
    
    if (matchIndex === -1) return null
    
    // Create snippet around the match
    const snippetStart = Math.max(0, matchIndex - 40)
    const snippetEnd = Math.min(text.length, matchIndex + matchLength + 40)
    let snippet = text.substring(snippetStart, snippetEnd)
    
    // Add ellipsis if snippet is truncated
    if (snippetStart > 0) snippet = '...' + snippet
    if (snippetEnd < text.length) snippet = snippet + '...'
    
    // Highlight all matching terms and phrases in the snippet
    const snippetLower = snippet.toLowerCase()
    let highlightedSnippet = snippet
    
    // Collect all positions to highlight (terms and phrases)
    const highlightPositions = []
    
    for (const item of allSearchItems) {
      let searchFrom = 0
      while (true) {
        const index = snippetLower.indexOf(item, searchFrom)
        if (index === -1) break
        highlightPositions.push({ index, length: item.length })
        searchFrom = index + 1
      }
    }
    
    // Sort by position (reverse order for replacement to avoid index shifting)
    highlightPositions.sort((a, b) => b.index - a.index)
    
    // Apply highlighting
    for (const pos of highlightPositions) {
      highlightedSnippet = highlightedSnippet.substring(0, pos.index) + 
                         '**' + highlightedSnippet.substring(pos.index, pos.index + pos.length) + '**' +
                         highlightedSnippet.substring(pos.index + pos.length)
    }
    
    return highlightedSnippet
  }

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Perform search when query changes
  useEffect(() => {
    if (!searchIndex.length || !query.trim()) {
      setResults([])
      return
    }

    const { terms, phrases } = parseSearchQuery(query)
    if (terms.length === 0 && phrases.length === 0) {
      setResults([])
      return
    }
    
    const searchResults: SearchResult[] = []
    
    for (const item of searchIndex) {
      // Search in filename (higher priority)
      if (matchesAllTerms(item.filename, terms, phrases)) {
        searchResults.push({
          file: item.file,
          matchType: 'filename',
          searchTerm: terms[0] || phrases[0] // Use first term/phrase for highlighting
        })
        continue
      }
      
      // Search in content
      if (item.content && matchesAllTerms(item.content, terms, phrases)) {
        const snippet = createSnippet(item.content, terms, phrases)
        
        if (snippet) {
          searchResults.push({
            file: item.file,
            snippet,
            matchType: 'content',
            searchTerm: terms[0] || phrases[0] // Use first term/phrase for highlighting
          })
        }
      }
    }
    
    // Sort results: filename matches first, then content matches
    searchResults.sort((a, b) => {
      if (a.matchType === 'filename' && b.matchType === 'content') return -1
      if (a.matchType === 'content' && b.matchType === 'filename') return 1
      return a.file.name.localeCompare(b.file.name)
    })
    
    setResults(searchResults.slice(0, 50)) // Limit results
  }, [query, searchIndex])

  const handleFileClick = (result: SearchResult) => {
    onFileSelect(result.file)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
      return
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
      return
    }
    
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      const selectedResult = results[selectedIndex] || results[0]
      handleFileClick(selectedResult)
    }
  }

  const formatFilename = (result: SearchResult) => {
    const fullPath = result.file.path
    const maxLength = 60
    
    let displayPath = fullPath
    if (fullPath.length > maxLength) {
      const filename = result.file.name
      const remainingLength = maxLength - filename.length - 3 // 3 for "..."
      if (remainingLength > 0) {
        const pathPrefix = fullPath.substring(0, remainingLength)
        displayPath = pathPrefix + '...' + filename
      } else {
        displayPath = '...' + filename
      }
    }
    
    // Highlight search term if this is a filename match
    if (result.matchType === 'filename' && result.searchTerm) {
      const searchTerm = result.searchTerm
      const lowerPath = displayPath.toLowerCase()
      const matchIndex = lowerPath.indexOf(searchTerm.toLowerCase())
      
      if (matchIndex !== -1) {
        return (
          <>
            {displayPath.substring(0, matchIndex)}
            <mark>{displayPath.substring(matchIndex, matchIndex + searchTerm.length)}</mark>
            {displayPath.substring(matchIndex + searchTerm.length)}
          </>
        )
      }
    }
    
    return displayPath
  }

  return (
    <div className="search-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-modal">
        <div className="search-header">
          <div className="search-input-container">
            <SearchIcon size={16} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder={isIndexing ? "Building search index..." : "Search files and content (use quotes for exact phrases)..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isIndexing}
              className="search-input"
            />
          </div>
          <button onClick={onClose} className="search-close-button" data-tooltip="Close search" aria-label="Close search">
            <X size={16} />
          </button>
        </div>
        
        {isIndexing ? (
          <div className="search-indexing">
            <div className="search-spinner"></div>
            <span>Building search index...</span>
          </div>
        ) : (
          <div className="search-results">
            {query.trim() && results.length === 0 && (
              <div className="search-no-results">No results found</div>
            )}
            {results.map((result, index) => (
              <div
                key={result.file.path}
                className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleFileClick(result)}
              >
                <div className="search-result-filename">
                  {formatFilename(result)}
                </div>
                {result.snippet && (
                  <div className="search-result-snippet">
                    {result.snippet.split('**').map((part, index) => 
                      index % 2 === 1 ? <mark key={index}>{part}</mark> : part
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="search-footer">
          <span>Use <kbd>↑</kbd><kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close • <kbd>Cmd/Ctrl+K</kbd> or <kbd>/</kbd> to open search</span>
        </div>
      </div>
    </div>
  )
}
