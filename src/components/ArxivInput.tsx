import { useEffect, useRef } from 'react'

interface ArxivInputProps {
  onSubmit: (url: string) => void
  loading: boolean
  value: string | undefined
  onChange: (value: string) => void
}

export default function ArxivInput({ onSubmit, loading, value, onChange }: ArxivInputProps) {
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

  return (
    <form onSubmit={handleSubmit} className="arxiv-input">
      <div className="input-group">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter arXiv URL or ID (e.g., https://arxiv.org/abs/1706.03762 or 1706.03762)"
          disabled={loading}
          className="arxiv-url-input"
        />
        <button type="submit" disabled={loading || !value?.trim()} className="submit-button">
          {loading ? 'Loading...' : 'Browse Source'}
        </button>
      </div>
    </form>
  )
}