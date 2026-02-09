import type { FileEntry } from '../types'
import type { DiffVersion, DiffFileStatus, DiffViewLayout } from '../types'
import VersionPicker from './VersionPicker'
import DiffFileList, { type DiffFileListItem } from './DiffFileList'
import DiffViewer from './DiffViewer'
import DiffStatusIcon from './DiffStatusIcon'

export interface DiffModeEntry extends DiffFileListItem {
  oldFile: FileEntry | null
  newFile: FileEntry | null
}

interface DiffModeProps {
  loading: boolean
  baseId: string
  versions: DiffVersion[]
  fromVersion: number | null
  toVersion: number | null
  entries: DiffModeEntry[]
  selectedPath: string | null
  message: string | null
  wordWrap: boolean
  diffViewLayout: DiffViewLayout
  onFromVersionChange: (version: number) => void
  onToVersionChange: (version: number) => void
  onSelectFile: (path: string) => void
  onError: (message: string) => void
}

function countEntries(entries: DiffModeEntry[]): Record<DiffFileStatus, number> {
  return entries.reduce<Record<DiffFileStatus, number>>(
    (acc, entry) => {
      acc[entry.status] += 1
      return acc
    },
    { added: 0, removed: 0, modified: 0, unchanged: 0 }
  )
}

export default function DiffMode({
  loading,
  baseId,
  versions,
  fromVersion,
  toVersion,
  entries,
  selectedPath,
  message,
  wordWrap,
  diffViewLayout,
  onFromVersionChange,
  onToVersionChange,
  onSelectFile,
  onError,
}: DiffModeProps) {
  const selectedEntry = entries.find((entry) => entry.path === selectedPath) ?? null
  const counts = countEntries(entries)

  return (
    <div className="diff-mode-root">
      <div className="diff-mode-toolbar">
        <div className="diff-mode-title">
          <h2>{baseId ? `Compare arXiv ${baseId}` : 'Compare arXiv versions'}</h2>
          <p>Pick two versions and inspect file-level changes.</p>
        </div>
        <VersionPicker
          versions={versions}
          fromVersion={fromVersion}
          toVersion={toVersion}
          onFromVersionChange={onFromVersionChange}
          onToVersionChange={onToVersionChange}
          disabled={loading}
        />
      </div>

      {message && <div className="diff-info-banner">{message}</div>}

      {loading ? (
        <div className="diff-loading-panel">Loading versions and building diff…</div>
      ) : (
        <div className="diff-mode-content">
          <div className="diff-file-list-panel">
            <div className="diff-file-list-header">
              <h3>Files</h3>
              <div className="diff-summary">
                <span
                  className="diff-summary-item modified"
                  data-tooltip={`${counts.modified} files modified`}
                  aria-label={`${counts.modified} files modified`}
                >
                  <DiffStatusIcon status="modified" className="summary" ariaLabel="Modified files" />
                  <span>{counts.modified}</span>
                </span>
                <span
                  className="diff-summary-item added"
                  data-tooltip={`${counts.added} files added`}
                  aria-label={`${counts.added} files added`}
                >
                  <DiffStatusIcon status="added" className="summary" ariaLabel="Added files" />
                  <span>{counts.added}</span>
                </span>
                <span
                  className="diff-summary-item removed tooltip-right"
                  data-tooltip={`${counts.removed} files removed`}
                  aria-label={`${counts.removed} files removed`}
                >
                  <DiffStatusIcon status="removed" className="summary" ariaLabel="Removed files" />
                  <span>{counts.removed}</span>
                </span>
              </div>
            </div>
            <DiffFileList
              files={entries}
              selectedFilePath={selectedPath}
              onSelectFile={onSelectFile}
            />
          </div>
          <div className="diff-viewer-panel">
            {selectedEntry ? (
              <DiffViewer
                filePath={selectedEntry.path}
                status={selectedEntry.status}
                oldFile={selectedEntry.oldFile}
                newFile={selectedEntry.newFile}
                wordWrap={wordWrap}
                diffViewLayout={diffViewLayout}
                onError={onError}
              />
            ) : (
              <div className="diff-no-file-selected">Select a file to inspect the diff.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
