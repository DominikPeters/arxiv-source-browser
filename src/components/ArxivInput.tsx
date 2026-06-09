import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import { API_URL } from '../config'
import type { PaperMetadata } from '../types'

interface ArxivInputProps {
  onSubmit: (url: string) => void
  loading: boolean
  value: string | undefined
  onChange: (value: string) => void
  loadedArxivId?: string
}

export default function ArxivInput({ onSubmit, loading, value, onChange, loadedArxivId }: ArxivInputProps) {
  const hasInitialized = useRef(false)
  const [suggestions, setSuggestions] = useState<PaperMetadata[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const inputValue = value || ''

  useEffect(() => {
    if (!hasInitialized.current) {
      const savedUrl = localStorage.getItem('arxiv-last-url')
      if (savedUrl && !inputValue) {
        onChange(savedUrl)
      }
      hasInitialized.current = true
    }
  }, [inputValue, onChange])

  useEffect(() => {
    const query = inputValue.trim()
    if (query.length < 2 || loading) {
      setSuggestions([])
      setShowSuggestions(false)
      setIsSearching(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await fetch(`${API_URL}?action=search&q=${encodeURIComponent(query)}&limit=8`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('Search request failed')
        }

        const payload = await response.json() as { ok?: boolean; results?: PaperMetadata[] }
        if (payload.ok && Array.isArray(payload.results)) {
          setSuggestions(payload.results)
          setSelectedSuggestionIndex(0)
          setShowSuggestions(document.activeElement?.classList.contains('arxiv-url-input') ?? false)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Error searching arXiv metadata:', error)
          setSuggestions([])
          setShowSuggestions(false)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 180)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [inputValue, loading])

  const submitValue = (nextValue: string) => {
    const trimmedUrl = nextValue.trim()
    if (!trimmedUrl) {
      return
    }
    localStorage.setItem('arxiv-last-url', trimmedUrl)
    setShowSuggestions(false)
    onChange(trimmedUrl)
    onSubmit(trimmedUrl)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (showSuggestions && suggestions[selectedSuggestionIndex]) {
      submitValue(suggestions[selectedSuggestionIndex].id)
      return
    }
    submitValue(inputValue)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedSuggestionIndex((index) => (index + 1) % suggestions.length)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
      return
    }

    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const showChip = !!loadedArxivId && inputValue === loadedArxivId
  const hasSuggestions = showSuggestions && suggestions.length > 0
  const inputExpanded = hasSuggestions || isSearching

  return (
    <form onSubmit={handleSubmit} className="arxiv-input">
      <div className="input-group">
        <div className={`arxiv-url-input-wrapper${inputExpanded ? ' expanded' : ''}`}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              onChange(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={(e) => {
              e.target.select()
              if (suggestions.length > 0) {
                setShowSuggestions(true)
              }
            }}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder="Enter arXiv URL or ID (e.g., https://arxiv.org/abs/1706.03762 or 1706.03762)"
            disabled={loading}
            className={`arxiv-url-input${showChip ? ' with-chip' : ''}`}
            autoComplete="off"
          />
          {showChip && (
            <a
              href={`https://arxiv.org/abs/${loadedArxivId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="arxiv-open-chip"
              tabIndex={-1}
            >
              <svg width="14" height="14" viewBox="85 -1 88 112" aria-hidden="true">
                <path fill="#999" d="M492.976,269.5l24.36-29.89c1.492-1.989,2.2-3.03,1.492-4.723a5.142,5.142,0,0,0-4.481-3.161h0a4.024,4.024,0,0,0-3.008,1.108L485.2,261.094Z" transform="translate(-358.165 -223.27)"/>
                <path fill="#999" d="M526.273,325.341,493.91,287.058l-.972,1.033-7.789-9.214-7.743-9.357-4.695,5.076a4.769,4.769,0,0,0,.015,6.53L520.512,332.2a3.913,3.913,0,0,0,3.137,1.192,4.394,4.394,0,0,0,4.027-2.818C528.4,328.844,527.6,327.133,526.273,325.341Z" transform="translate(-358.165 -223.27)"/>
                <path fill="#b31b1b" d="M479.215,288.087l6.052,6.485L458.714,322.7a2.98,2.98,0,0,1-2.275,1.194,3.449,3.449,0,0,1-3.241-2.144c-.513-1.231.166-3.15,1.122-4.168l.023-.024.021-.026,24.851-29.448Z" transform="translate(-358.165 -223.27)"/>
                <path fill="#b31b1b" d="M448.538,224.52h.077c1,.024,2.236,1.245,2.589,1.669l.023.028.024.026,46.664,50.433a3.173,3.173,0,0,1-.034,4.336l-4.893,5.2-6.876-8.134L446.652,230.4c-1.508-2.166-1.617-2.836-1.191-3.858a3.353,3.353,0,0,1,3.077-2.02Z" transform="translate(-358.165 -223.27)"/>
              </svg>
              <span>Open on arXiv</span>
              <ExternalLink size={11} />
            </a>
          )}
          {hasSuggestions && (
            <div className="arxiv-suggestions" role="listbox">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className={`arxiv-suggestion${index === selectedSuggestionIndex ? ' selected' : ''}`}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    submitValue(suggestion.id)
                  }}
                  role="option"
                  aria-selected={index === selectedSuggestionIndex}
                >
                  <span className="arxiv-suggestion-title">{suggestion.title || suggestion.id}</span>
                  <span className="arxiv-suggestion-meta">
                    <span className="arxiv-suggestion-id">arXiv:{suggestion.id}</span>
                    {suggestion.authors.length > 0 && (
                      <span className="arxiv-suggestion-authors">{suggestion.authors.slice(0, 3).join(', ')}{suggestion.authors.length > 3 ? ' et al.' : ''}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="submit" disabled={loading || !inputValue.trim()} className="submit-button">
          {loading ? 'Loading...' : 'Open'}
        </button>
      </div>
    </form>
  )
}
