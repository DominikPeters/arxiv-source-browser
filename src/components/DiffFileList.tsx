import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Folder, FolderOpen, FileText, LibraryBig } from 'lucide-react'
import type { DiffFileStatus } from '../types'
import DiffStatusIcon from './DiffStatusIcon'

export interface DiffFileListItem {
  path: string
  status: DiffFileStatus
}

interface DiffFileListProps {
  files: DiffFileListItem[]
  selectedFilePath: string | null
  onSelectFile: (path: string) => void
}

interface DiffTreeNode {
  id: string
  name: string
  type: 'folder' | 'file'
  path: string
  children?: DiffTreeNode[]
  status?: DiffFileStatus
}

interface DiffCounts {
  added: number
  removed: number
  modified: number
  unchanged: number
}

function isBibliographyFile(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.bib') || lower.endsWith('.bbl')
}

function statusLabel(status: DiffFileStatus): string {
  switch (status) {
    case 'added':
      return 'Added'
    case 'removed':
      return 'Removed'
    case 'modified':
      return 'Modified'
    case 'unchanged':
      return 'Unchanged'
    default:
      return status
  }
}

function emptyCounts(): DiffCounts {
  return { added: 0, removed: 0, modified: 0, unchanged: 0 }
}

function mergeCounts(a: DiffCounts, b: DiffCounts): DiffCounts {
  return {
    added: a.added + b.added,
    removed: a.removed + b.removed,
    modified: a.modified + b.modified,
    unchanged: a.unchanged + b.unchanged,
  }
}

function toFolderSummary(counts: DiffCounts): string {
  const parts: string[] = []
  if (counts.modified > 0) parts.push(`•${counts.modified}`)
  if (counts.added > 0) parts.push(`+${counts.added}`)
  if (counts.removed > 0) parts.push(`−${counts.removed}`)
  if (parts.length === 0 && counts.unchanged > 0) {
    parts.push(`·${counts.unchanged}`)
  }
  return parts.join(' ')
}

export default function DiffFileList({ files, selectedFilePath, onSelectFile }: DiffFileListProps) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  const tree = useMemo(() => {
    const root: DiffTreeNode[] = []
    const folderMap = new Map<string, DiffTreeNode>()

    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))
    for (const file of sortedFiles) {
      const parts = file.path.split('/')
      let currentPath = ''
      let currentLevel = root

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]
        let folder = folderMap.get(currentPath)
        if (!folder) {
          folder = {
            id: currentPath,
            name: parts[i],
            type: 'folder',
            path: currentPath,
            children: [],
          }
          folderMap.set(currentPath, folder)
          currentLevel.push(folder)
        }
        currentLevel = folder.children!
      }

      currentLevel.push({
        id: file.path,
        name: parts[parts.length - 1],
        type: 'file',
        path: file.path,
        status: file.status,
      })
    }

    const sortNodes = (nodes: DiffTreeNode[]): DiffTreeNode[] => {
      return nodes
        .sort((a, b) => {
          if (a.type === 'folder' && b.type !== 'folder') return -1
          if (a.type !== 'folder' && b.type === 'folder') return 1
          return a.name.localeCompare(b.name)
        })
        .map((node) => ({
          ...node,
          children: node.children ? sortNodes(node.children) : undefined,
        }))
    }

    return sortNodes(root)
  }, [files])

  const folderCounts = useMemo(() => {
    const countsByPath = new Map<string, DiffCounts>()

    const countNode = (node: DiffTreeNode): DiffCounts => {
      if (node.type === 'file') {
        const counts = emptyCounts()
        if (node.status) {
          counts[node.status] += 1
        }
        return counts
      }

      let aggregate = emptyCounts()
      for (const child of node.children ?? []) {
        aggregate = mergeCounts(aggregate, countNode(child))
      }
      countsByPath.set(node.path, aggregate)
      return aggregate
    }

    for (const rootNode of tree) {
      countNode(rootNode)
    }

    return countsByPath
  }, [tree])

  useEffect(() => {
    if (!selectedFilePath) {
      return
    }

    const parts = selectedFilePath.split('/')
    const foldersToOpen = new Set(openFolders)
    let currentPath = ''
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]
      foldersToOpen.add(currentPath)
    }
    setOpenFolders(foldersToOpen)
    // react to selected path only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilePath])

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const renderNodes = (nodes: DiffTreeNode[], depth: number): ReactNode[] => {
    return nodes.flatMap((node) => {
      const isFolder = node.type === 'folder'
      const isOpen = isFolder ? openFolders.has(node.path) : false
      const counts = isFolder ? folderCounts.get(node.path) ?? emptyCounts() : null
      const folderSummary = counts ? toFolderSummary(counts) : ''
      const row = (
        <button
          key={node.id}
          type="button"
          className={`diff-file-row diff-tree-row ${isFolder ? 'folder' : 'file'} ${node.status ?? ''} ${selectedFilePath === node.path ? 'selected' : ''}`}
          style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(node.path)
            } else {
              onSelectFile(node.path)
            }
          }}
        >
          <span className="diff-file-path">
            {isFolder ? (
              <span className="diff-folder-label">
                <ChevronRight size={14} className={`diff-folder-chevron ${isOpen ? 'open' : ''}`} />
                {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
                {node.name}
              </span>
            ) : (
              <span className="diff-folder-label">
                {isBibliographyFile(node.path) ? <LibraryBig size={14} /> : <FileText size={14} />}
                {node.name}
              </span>
            )}
          </span>
          {isFolder ? (
            !isOpen && folderSummary ? (
              <span className="diff-folder-summary">{folderSummary}</span>
            ) : null
          ) : (
            node.status && node.status !== 'unchanged' && (
              <DiffStatusIcon
                status={node.status}
                ariaLabel={statusLabel(node.status)}
                title={statusLabel(node.status)}
              />
            )
          )}
        </button>
      )

      if (!isFolder || !isOpen || !node.children || node.children.length === 0) {
        return [row]
      }

      return [row, ...renderNodes(node.children, depth + 1)]
    })
  }

  if (files.length === 0) {
    return <div className="diff-file-list-empty">No files found for this version pair.</div>
  }

  return (
    <div className="diff-file-list" role="list">
      {renderNodes(tree, 0)}
    </div>
  )
}
