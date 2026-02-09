import type { DiffVersion } from '../types'

interface VersionPickerProps {
  versions: DiffVersion[]
  fromVersion: number | null
  toVersion: number | null
  onFromVersionChange: (version: number) => void
  onToVersionChange: (version: number) => void
  disabled?: boolean
}

export default function VersionPicker({
  versions,
  fromVersion,
  toVersion,
  onFromVersionChange,
  onToVersionChange,
  disabled = false,
}: VersionPickerProps) {
  return (
    <div className="diff-version-picker">
      <label className="diff-version-label">
        From
        <select
          className="diff-version-select"
          value={fromVersion ?? ''}
          disabled={disabled || versions.length === 0}
          onChange={(event) => onFromVersionChange(Number(event.target.value))}
        >
          {versions.map((version) => (
            <option key={`from-${version.version}`} value={version.version}>
              v{version.version} - {version.submittedUtc}
            </option>
          ))}
        </select>
      </label>

      <label className="diff-version-label">
        To
        <select
          className="diff-version-select"
          value={toVersion ?? ''}
          disabled={disabled || versions.length === 0}
          onChange={(event) => onToVersionChange(Number(event.target.value))}
        >
          {versions.map((version) => (
            <option key={`to-${version.version}`} value={version.version}>
              v{version.version} - {version.submittedUtc}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

