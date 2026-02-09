import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { DiffViewLayout } from '../types'

interface SettingsProps {
  wordWrap: boolean
  onWordWrapChange: (enabled: boolean) => void
  showDiffLayoutOptions: boolean
  diffViewLayout: DiffViewLayout
  onDiffViewLayoutChange: (layout: DiffViewLayout) => void
  onClose: () => void
}

export default function Settings({
  wordWrap,
  onWordWrapChange,
  showDiffLayoutOptions,
  diffViewLayout,
  onDiffViewLayoutChange,
  onClose,
}: SettingsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose} data-tooltip="Close settings" aria-label="Close settings">
            <X size={20} />
          </button>
        </div>
        
        <div className="settings-content">
          <div className="setting-item">
            <label className="setting-label">
              <input
                type="checkbox"
                checked={wordWrap}
                onChange={(e) => onWordWrapChange(e.target.checked)}
                className="setting-checkbox"
              />
              <span className="setting-text">Word Wrap</span>
            </label>
            <div className="setting-description">
              Enable word wrapping for long lines in code files
            </div>
          </div>

          {showDiffLayoutOptions && (
            <div className="setting-item">
              <div className="setting-label no-hover">Diff Layout</div>
              <div className="setting-toggle-group" role="group" aria-label="Diff layout">
                <button
                  type="button"
                  className={`setting-toggle-button ${diffViewLayout === 'split' ? 'active' : ''}`}
                  onClick={() => onDiffViewLayoutChange('split')}
                  aria-pressed={diffViewLayout === 'split'}
                >
                  Split
                </button>
                <button
                  type="button"
                  className={`setting-toggle-button ${diffViewLayout === 'unified' ? 'active' : ''}`}
                  onClick={() => onDiffViewLayoutChange('unified')}
                  aria-pressed={diffViewLayout === 'unified'}
                >
                  Unified
                </button>
              </div>
              <div className="setting-description">
                Choose side-by-side or single-column diff rendering.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
