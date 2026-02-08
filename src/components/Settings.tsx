import { useEffect } from 'react'
import { X } from 'lucide-react'

interface SettingsProps {
  wordWrap: boolean
  onWordWrapChange: (enabled: boolean) => void
  onClose: () => void
}

export default function Settings({ wordWrap, onWordWrapChange, onClose }: SettingsProps) {
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
        </div>
      </div>
    </div>
  )
}
