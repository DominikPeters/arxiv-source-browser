import { useMemo } from 'react'
import type React from 'react'
import { Tree } from 'react-arborist'
import { File, Folder, FolderOpen, FileText, Image, BookOpen, FileType, Download } from 'lucide-react'
import type { FileEntry } from '../types'
import { getFileType } from '../types'

interface FileBrowserProps {
  files: FileEntry[]
  onFileSelect: (file: FileEntry) => void
  selectedFile: FileEntry | null
  onDownloadZip?: () => void
}

interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  file?: FileEntry
  isFolder: boolean
}

export default function FileBrowser({ files, onFileSelect, selectedFile, onDownloadZip }: FileBrowserProps) {
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

  const getFileIcon = (node: TreeNode, isOpen?: boolean) => {
    if (node.isFolder) {
      return isOpen ? <FolderOpen size={16} /> : <Folder size={16} />
    }

    if (!node.file) return <File size={16} />

    const type = getFileType(node.file.name)
    switch (type) {
      case 'tex':
        return <FileText size={16} />
      case 'bib':
        return <BookOpen size={16} />
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

  return (
    <div className="file-browser-container">
      <div className="file-browser-header">
        <h3>Files</h3>
        {onDownloadZip && (
          <button 
            className="download-zip-button" 
            onClick={onDownloadZip}
            title="Download entire source as ZIP"
          >
            <Download size={16} />
            ZIP
          </button>
        )}
      </div>
      <div className="file-tree">
        <Tree
          data={treeData}
          openByDefault={false}
          width="100%"
          height={600}
          indent={16}
          rowHeight={28}
        >
          {Node}
        </Tree>
      </div>
    </div>
  )
}