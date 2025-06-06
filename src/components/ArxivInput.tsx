import { useState } from 'react'

interface ArxivInputProps {
  onSubmit: (url: string) => void
  loading: boolean
}

export default function ArxivInput({ onSubmit, loading }: ArxivInputProps) {
  const [url, setUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) {
      onSubmit(url.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="arxiv-input">
      <div className="input-group">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter arXiv URL or ID (e.g., https://arxiv.org/abs/2402.10439 or 2402.10439)"
          disabled={loading}
          className="arxiv-url-input"
        />
        <button type="submit" disabled={loading || !url.trim()} className="submit-button">
          {loading ? 'Loading...' : 'Browse Source'}
        </button>
      </div>
    </form>
  )
}