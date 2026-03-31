import { useEffect, useRef } from 'react'
import { ExternalLink } from 'lucide-react'

interface ArxivInputProps {
  onSubmit: (url: string) => void
  loading: boolean
  value: string | undefined
  onChange: (value: string) => void
  loadedArxivId?: string
}

export default function ArxivInput({ onSubmit, loading, value, onChange, loadedArxivId }: ArxivInputProps) {
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!hasInitialized.current) {
      const savedUrl = localStorage.getItem('arxiv-last-url')
      if (savedUrl && !value) {
        onChange(savedUrl)
      }
      hasInitialized.current = true
    }
  }, [value, onChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value?.trim()) {
      const trimmedUrl = value.trim()
      localStorage.setItem('arxiv-last-url', trimmedUrl)
      onSubmit(trimmedUrl)
    }
  }

  const showChip = !!loadedArxivId && value === loadedArxivId

  return (
    <form onSubmit={handleSubmit} className="arxiv-input">
      <div className="input-group">
        <div className="arxiv-url-input-wrapper">
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Enter arXiv URL or ID (e.g., https://arxiv.org/abs/1706.03762 or 1706.03762)"
            disabled={loading}
            className={`arxiv-url-input${showChip ? ' with-chip' : ''}`}
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
        </div>
        <button type="submit" disabled={loading || !value?.trim()} className="submit-button">
          {loading ? 'Loading...' : 'Open'}
        </button>
      </div>
    </form>
  )
}