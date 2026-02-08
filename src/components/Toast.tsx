import { useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'error' | 'success' | 'info'
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type = 'error', onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [onClose, duration])

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <AlertCircle size={20} />
      default:
        return <AlertCircle size={20} />
    }
  }

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-content">
        <div className="toast-icon">
          {getIcon()}
        </div>
        <div className="toast-message">
          {message}
        </div>
        <button className="toast-close" onClick={onClose} data-tooltip="Dismiss message" aria-label="Dismiss message">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
