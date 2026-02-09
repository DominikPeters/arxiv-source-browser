import { useMemo, useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import type React from 'react'
import { Tree, type TreeApi } from 'react-arborist'
import { File, Folder, FolderOpen, FileText, Image, LibraryBig, FileType, Download, ChevronDown, ChevronUp, Search } from 'lucide-react'
import type { FileEntry } from '../types'
import { getFileType } from '../types'
import SearchComponent from './Search'
import type { TexOutlineEntry } from '../texOutline'

interface FileBrowserProps {
  files: FileEntry[]
  onFileSelect: (file: FileEntry) => void
  selectedFile: FileEntry | null
  texOutline?: TexOutlineEntry[]
  selectedOutlineLine?: number | null
  onOutlineSelect?: (lineNumber: number) => void
  onDownloadZip?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export interface FileBrowserRef {
  openSearch: () => void
}

interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  file?: FileEntry
  isFolder: boolean
}

const FileBrowser = forwardRef<FileBrowserRef, FileBrowserProps>(({
  files,
  onFileSelect,
  selectedFile,
  texOutline = [],
  selectedOutlineLine = null,
  onOutlineSelect,
  onDownloadZip,
  isCollapsed = false,
  onToggleCollapse
}, ref) => {
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<TreeNode>>(null)
  const [treeHeight, setTreeHeight] = useState(400)
  const [showSearch, setShowSearch] = useState(false)

  useImperativeHandle(ref, () => ({
    openSearch: () => setShowSearch(true)
  }))

  useEffect(() => {
    const updateHeight = () => {
      if (treeContainerRef.current) {
        const rect = treeContainerRef.current.getBoundingClientRect()
        // Subtract padding (3.2px top + 3.2px bottom = 6.4px total)
        const availableHeight = Math.floor(rect.height - 6.4)
        setTreeHeight(Math.max(100, availableHeight))
      }
    }

    // Use ResizeObserver for more reliable height detection
    const resizeObserver = new ResizeObserver(updateHeight)
    
    if (treeContainerRef.current) {
      resizeObserver.observe(treeContainerRef.current)
    }

    // Initial measurement
    updateHeight()
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const treeData = useMemo(() => {
    const root: TreeNode[] = []
    const folderMap = new Map<string, TreeNode>()

    // Sort files to ensure consistent ordering
    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))

    sortedFiles.forEach((file) => {
      const parts = file.path.split('/')
      let currentPath = ''
      let currentLevel = root

      // Create folder structure
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]
        
        let folder = folderMap.get(currentPath)
        if (!folder) {
          folder = {
            id: currentPath,
            name: parts[i],
            children: [],
            isFolder: true
          }
          folderMap.set(currentPath, folder)
          currentLevel.push(folder)
        }
        
        currentLevel = folder.children!
      }

      // Add the file
      const fileName = parts[parts.length - 1]
      currentLevel.push({
        id: file.path,
        name: fileName,
        file,
        isFolder: false
      })
    })

    // Sort function to put directories first, then files
    const sortTreeNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.sort((a, b) => {
        // Directories come before files
        if (a.isFolder && !b.isFolder) return -1
        if (!a.isFolder && b.isFolder) return 1
        // Within the same type, sort alphabetically
        return a.name.localeCompare(b.name)
      }).map(node => ({
        ...node,
        children: node.children ? sortTreeNodes(node.children) : undefined
      }))
    }

    return sortTreeNodes(root)
  }, [files])

  // Effect to expand parent directories and focus selected file
  useEffect(() => {
    if (selectedFile && treeRef.current) {
      const filePath = selectedFile.path
      const pathParts = filePath.split('/')
      
      // First, open all parent directories by their IDs
      let currentPath = ''
      for (let i = 0; i < pathParts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i]
        // Open this parent directory
        treeRef.current.open(currentPath)
      }
      
      // Small delay to allow the tree to update before focusing
      setTimeout(() => {
        const node = treeRef.current?.get(filePath)
        if (node) {
          node.focus()
        }
      }, 10)
    }
  }, [selectedFile])

  const getFileIcon = (node: TreeNode, isOpen?: boolean) => {
    if (node.isFolder) {
      return isOpen ? <FolderOpen size={16} /> : <Folder size={16} />
    }

    if (!node.file) return <File size={16} />

    const lowerName = node.file.name.toLowerCase()
    if (lowerName.endsWith('.bib') || lowerName.endsWith('.bbl')) {
      return <LibraryBig size={16} />
    }

    const type = getFileType(node.file.name)
    switch (type) {
      case 'tex':
        return <FileText size={16} />
      case 'image':
        return <Image size={16} />
      case 'pdf':
        return <FileType size={16} />
      default:
        return <File size={16} />
    }
  }

  interface NodeProps {
    node: {
      id: string;
      data: TreeNode;
    };
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void;
    tree: {
      isOpen: (id: string) => boolean;
      toggle: (id: string) => void;
    };
  }

  const Node = ({ node, style, dragHandle, tree }: NodeProps) => {
    const nodeData = node.data as TreeNode
    
    return (
      <div
        ref={dragHandle}
        style={style}
        className={`tree-node ${nodeData.file && selectedFile?.path === nodeData.file.path ? 'selected' : ''} ${nodeData.isFolder ? 'folder' : 'file'}`}
        onClick={() => {
          if (nodeData.file) {
            onFileSelect(nodeData.file)
          } else {
            tree.toggle(node.id)
          }
        }}
      >
        <span className="tree-node-icon">
          {getFileIcon(nodeData, tree.isOpen(node.id))}
        </span>
        <span className="tree-node-name">{nodeData.name}</span>
      </div>
    )
  }

  const showOutline = texOutline.length > 0

  return (
    <div className={`file-browser-container ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="file-browser-header">
        <button 
          className="files-header-button"
          onClick={onToggleCollapse}
          data-tooltip={isCollapsed ? "Expand file browser" : "Collapse file browser"}
          aria-label={isCollapsed ? "Expand file browser" : "Collapse file browser"}
        >
          <h3>Files ({files.length})</h3>
          {onToggleCollapse && (
            <span className="collapse-icon mobile-only">
              {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </span>
          )}
        </button>
        <div className="file-browser-actions">
          <button 
            className="search-button" 
            onClick={() => setShowSearch(true)}
            data-tooltip="Search files and content"
            aria-label="Search files and content"
          >
            <Search size={16} />
          </button>
          {onDownloadZip && (
            <button 
              className="download-zip-button" 
              onClick={onDownloadZip}
              data-tooltip="Download the full source ZIP"
              aria-label="Download the full source ZIP"
            >
              <Download size={16} />
              ZIP
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className={`file-browser-panels ${showOutline ? 'with-outline' : ''}`}>
          <div className="file-tree-panel">
            <div className="file-tree" ref={treeContainerRef}>
              <Tree
                ref={treeRef}
                data={treeData}
                openByDefault={false}
                width="100%"
                height={treeHeight}
                indent={16}
                rowHeight={28}
              >
                {Node}
              </Tree>
            </div>
          </div>

          {showOutline && (
            <div className="file-outline-panel">
              <h4 className="file-outline-title">Outline</h4>
              <div className="file-outline-list" role="list">
                {texOutline.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="listitem"
                    className={`outline-item depth-${Math.min(entry.depth, 6)} ${selectedOutlineLine === entry.lineNumber ? 'active' : ''}`}
                    onClick={() => onOutlineSelect?.(entry.lineNumber)}
                    title={`Jump to line ${entry.lineNumber}`}
                  >
                    <span className="outline-item-title">{entry.title}</span>
                    <span className="outline-item-line">{entry.lineNumber}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {showSearch && (
        <SearchComponent
          files={files}
          onFileSelect={onFileSelect}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  )
})

FileBrowser.displayName = 'FileBrowser'

export default FileBrowser
