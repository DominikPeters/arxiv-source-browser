import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import ArxivInput from './components/ArxivInput'
import FileBrowser, { type FileBrowserRef } from './components/FileBrowser'
import FileViewer from './components/FileViewer'
import Settings from './components/Settings'
import Toast from './components/Toast'
import DiffMode, { type DiffModeEntry } from './components/DiffMode'
import type { AppMode, DiffVersion, FileEntry, DiffViewLayout } from './types'
import { parseURL, buildURL, buildDiffURL, extractArxivId, getFileType, splitArxivVersion } from './types'
import { BASE_URL, API_URL } from './config'
import { Settings as SettingsIcon, Loader2, Columns2, GitCompare } from 'lucide-react'
import { buildVisibleLineMapAfterCommentStrip } from './latexComments'
import { parseTexOutline, type TexOutlineEntry } from './texOutline'

interface ExamplePaper {
  id: string
  title: string
  authors: string
}

interface OutlineJumpRequest {
  lineNumber: number
  token: number
}

interface BrowseLoadOptions {
  skipHistory?: boolean
}

interface DiffLoadOptions {
  preferredFromVersion?: number | null
  preferredToVersion?: number | null
  preferredFilePath?: string | null
  skipHistory?: boolean
  replaceHistory?: boolean
}

function findNearestOutlineLineAtOrAbove(lineNumber: number, outline: TexOutlineEntry[]): number | null {
  if (outline.length === 0) {
    return null
  }

  let left = 0
  let right = outline.length - 1
  let bestIndex = -1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (outline[mid].lineNumber <= lineNumber) {
      bestIndex = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  if (bestIndex >= 0) {
    return outline[bestIndex].lineNumber
  }

  return outline[0].lineNumber
}

const EXAMPLE_PAPERS: ExamplePaper[] = [
  {
    id: '1706.03762',
    title: 'Attention Is All You Need',
    authors: 'Vaswani et al.'
  },
  {
    id: '1406.2661',
    title: 'Generative Adversarial Networks',
    authors: 'Goodfellow et al.'
  },
  {
    id: '1312.5602',
    title: 'Playing Atari with Deep Reinforcement Learning',
    authors: 'Mnih et al.'
  },
  {
    id: '2005.14165',
    title: 'Language Models are Few-Shot Learners',
    authors: 'Brown et al.'
  }
]

async function findMainTexFile(files: FileEntry[]): Promise<FileEntry | null> {
  const texFiles = files.filter(file =>
    file.name.toLowerCase().endsWith('.tex')
  )

  if (texFiles.length === 0) {
    return null
  }

  if (texFiles.length === 1) {
    return texFiles[0]
  }

  for (const file of texFiles) {
    try {
      const content = await file.zipFile.async('string')
      if (content.includes('\\begin{document}')) {
        return file
      }
    } catch (error) {
      console.error('Error reading file content:', error)
    }
  }

  return null
}

async function parseZipBlob(blob: Blob): Promise<{ entries: FileEntry[]; rawBlob: Blob }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(blob)

  const fileEntries: FileEntry[] = []
  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      fileEntries.push({
        name: relativePath,
        path: relativePath,
        content: null,
        zipFile: file,
      })
    }
  })

  return { entries: fileEntries, rawBlob: blob }
}

async function fileContentsEqual(oldFile: FileEntry, newFile: FileEntry): Promise<boolean> {
  const [oldBytes, newBytes] = await Promise.all([
    oldFile.zipFile.async('uint8array'),
    newFile.zipFile.async('uint8array'),
  ])

  if (oldBytes.length !== newBytes.length) {
    return false
  }

  for (let i = 0; i < oldBytes.length; i++) {
    if (oldBytes[i] !== newBytes[i]) {
      return false
    }
  }

  return true
}

async function buildDiffEntries(oldFiles: FileEntry[], newFiles: FileEntry[]): Promise<DiffModeEntry[]> {
  const oldMap = new Map(oldFiles.map((file) => [file.path, file]))
  const newMap = new Map(newFiles.map((file) => [file.path, file]))
  const paths = new Set<string>([...oldMap.keys(), ...newMap.keys()])

  const sortedPaths = Array.from(paths).sort((a, b) => a.localeCompare(b))
  const entries: DiffModeEntry[] = []

  for (const path of sortedPaths) {
    const oldFile = oldMap.get(path) ?? null
    const newFile = newMap.get(path) ?? null

    if (!oldFile && newFile) {
      entries.push({ path, status: 'added', oldFile: null, newFile })
      continue
    }

    if (oldFile && !newFile) {
      entries.push({ path, status: 'removed', oldFile, newFile: null })
      continue
    }

    if (!oldFile || !newFile) {
      continue
    }

    const isEqual = await fileContentsEqual(oldFile, newFile)
    entries.push({
      path,
      status: isEqual ? 'unchanged' : 'modified',
      oldFile,
      newFile,
    })
  }

  return entries
}

async function findMainTexDiffPath(entries: DiffModeEntry[]): Promise<string | null> {
  const texCandidates = entries.filter((entry) => entry.path.toLowerCase().endsWith('.tex'))
  if (texCandidates.length === 0) {
    return null
  }

  if (texCandidates.length === 1) {
    return texCandidates[0].path
  }

  for (const entry of texCandidates) {
    const sourceFile = entry.newFile ?? entry.oldFile
    if (!sourceFile) {
      continue
    }

    try {
      const content = sourceFile.content ?? await sourceFile.zipFile.async('text')
      sourceFile.content = content
      if (content.includes('\\begin{document}')) {
        return entry.path
      }
    } catch (error) {
      console.error('Error reading TeX file while selecting default diff file:', error)
    }
  }

  return texCandidates[0].path
}

function selectPreferredDiffPair(
  versions: DiffVersion[],
  preferredFromVersion?: number | null,
  preferredToVersion?: number | null
): { fromVersion: number | null; toVersion: number | null } {
  const availableVersions = versions.map((version) => version.version).sort((a, b) => a - b)
  if (availableVersions.length === 0) {
    return { fromVersion: null, toVersion: null }
  }

  const latestVersion = availableVersions[availableVersions.length - 1]
  const previousVersion = availableVersions.length >= 2 ? availableVersions[availableVersions.length - 2] : latestVersion

  const fromIsValid = preferredFromVersion !== null && preferredFromVersion !== undefined && availableVersions.includes(preferredFromVersion)
  const toIsValid = preferredToVersion !== null && preferredToVersion !== undefined && availableVersions.includes(preferredToVersion)

  return {
    fromVersion: fromIsValid ? preferredFromVersion! : previousVersion,
    toVersion: toIsValid ? preferredToVersion! : latestVersion,
  }
}

function App() {
  const [appMode, setAppMode] = useState<AppMode>('browse')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [wordWrap, setWordWrap] = useState(true)
  const [diffViewLayout, setDiffViewLayout] = useState<DiffViewLayout>('split')
  const [showSettings, setShowSettings] = useState(false)
  const [zipBlob, setZipBlob] = useState<Blob | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [paperId, setPaperId] = useState('')
  const [fileBrowserCollapsed, setFileBrowserCollapsed] = useState(false)
  const [hideCommentsInViewer, setHideCommentsInViewer] = useState(false)
  const [texOutline, setTexOutline] = useState<TexOutlineEntry[]>([])
  const [selectedOutlineLine, setSelectedOutlineLine] = useState<number | null>(null)
  const [outlineJumpRequest, setOutlineJumpRequest] = useState<OutlineJumpRequest | null>(null)

  const [diffBaseId, setDiffBaseId] = useState('')
  const [diffVersions, setDiffVersions] = useState<DiffVersion[]>([])
  const [diffFromVersion, setDiffFromVersion] = useState<number | null>(null)
  const [diffToVersion, setDiffToVersion] = useState<number | null>(null)
  const [diffEntries, setDiffEntries] = useState<DiffModeEntry[]>([])
  const [selectedDiffFilePath, setSelectedDiffFilePath] = useState<string | null>(null)
  const [diffMessage, setDiffMessage] = useState<string | null>(null)

  const fileBrowserRef = useRef<FileBrowserRef>(null)
  const outlineSelectionLockUntilRef = useRef(0)
  const outlineSelectionLockTimerRef = useRef<number | null>(null)

  const lockOutlineSelectionFromScroll = useCallback((durationMs = 1000) => {
    const unlockAt = Date.now() + durationMs
    outlineSelectionLockUntilRef.current = unlockAt

    if (outlineSelectionLockTimerRef.current !== null) {
      window.clearTimeout(outlineSelectionLockTimerRef.current)
    }

    outlineSelectionLockTimerRef.current = window.setTimeout(() => {
      outlineSelectionLockUntilRef.current = 0
      outlineSelectionLockTimerRef.current = null
    }, durationMs)
  }, [])

  const updateDiffHistory = useCallback((
    baseId: string,
    fromVersion: number,
    toVersion: number,
    filePath?: string | null,
    replace = false
  ) => {
    const nextUrl = buildDiffURL(baseId, fromVersion, toVersion, filePath || undefined)
    if (replace) {
      window.history.replaceState(null, '', nextUrl)
      return
    }
    window.history.pushState(null, '', nextUrl)
  }, [])

  const clearDiffState = useCallback(() => {
    setDiffBaseId('')
    setDiffVersions([])
    setDiffFromVersion(null)
    setDiffToVersion(null)
    setDiffEntries([])
    setSelectedDiffFilePath(null)
    setDiffMessage(null)
  }, [])

  const handleArxivSubmit = useCallback(async (url: string, options: BrowseLoadOptions = {}) => {
    setLoading(true)
    try {
      const arxivId = extractArxivId(url)
      if (!arxivId) {
        throw new Error('Invalid arXiv URL or ID')
      }

      const response = await fetch(`${API_URL}?url=${encodeURIComponent(url)}`)
      if (!response.ok) {
        throw new Error('Failed to fetch arXiv source')
      }

      const blob = await response.blob()
      const parsed = await parseZipBlob(blob)

      setZipBlob(parsed.rawBlob)
      setFiles(parsed.entries)
      setPaperId(arxivId)

      const currentUrlState = parseURL(window.location.pathname)
      let nextSelectedFile: FileEntry | null = null

      if (currentUrlState.mode === 'browse' && currentUrlState.filePath && currentUrlState.arxivId === arxivId) {
        nextSelectedFile = parsed.entries.find((file) => file.path === currentUrlState.filePath) || null
      }

      if (!nextSelectedFile) {
        nextSelectedFile = await findMainTexFile(parsed.entries)
      }

      setSelectedFile(nextSelectedFile)

      if (!options.skipHistory) {
        const newURL = buildURL(arxivId, nextSelectedFile?.path)
        window.history.pushState(null, '', newURL)
      }
    } catch (error) {
      console.error('Error fetching arXiv source:', error)
      setToastMessage('Error fetching arXiv source. Please check the URL and try again.')
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  const loadDiffPair = useCallback(async (
    baseId: string,
    fromVersion: number,
    toVersion: number,
    preferredFilePath?: string | null,
    options: DiffLoadOptions = {}
  ) => {
    setLoading(true)
    setDiffMessage(null)

    try {
      const [oldResponse, newResponse] = await Promise.all([
        fetch(`${API_URL}?action=source&id=${encodeURIComponent(`${baseId}v${fromVersion}`)}`),
        fetch(`${API_URL}?action=source&id=${encodeURIComponent(`${baseId}v${toVersion}`)}`),
      ])

      if (!oldResponse.ok || !newResponse.ok) {
        throw new Error('Failed to fetch one of the source archives for diff mode')
      }

      const [oldBlob, newBlob] = await Promise.all([oldResponse.blob(), newResponse.blob()])
      const [oldParsed, newParsed] = await Promise.all([parseZipBlob(oldBlob), parseZipBlob(newBlob)])

      const entries = await buildDiffEntries(oldParsed.entries, newParsed.entries)
      setDiffEntries(entries)
      setDiffFromVersion(fromVersion)
      setDiffToVersion(toVersion)

      const hasPreferredPath = preferredFilePath ? entries.some((entry) => entry.path === preferredFilePath) : false
      const mainTexPath = await findMainTexDiffPath(entries)
      const firstChanged = entries.find((entry) => entry.status !== 'unchanged')
      const nextSelectedPath = hasPreferredPath
        ? preferredFilePath!
        : mainTexPath || firstChanged?.path || entries[0]?.path || null

      setSelectedDiffFilePath(nextSelectedPath)

      if (!options.skipHistory) {
        updateDiffHistory(baseId, fromVersion, toVersion, nextSelectedPath, options.replaceHistory ?? false)
      }
    } catch (error) {
      console.error('Error loading diff pair:', error)
      setToastMessage('Error loading selected version pair.')
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [updateDiffHistory])

  const handleDiffSubmit = useCallback(async (input: string, options: DiffLoadOptions = {}) => {
    setLoading(true)
    try {
      const extractedId = extractArxivId(input)
      if (!extractedId) {
        throw new Error('Invalid arXiv URL or ID')
      }

      const { baseId } = splitArxivVersion(extractedId)

      const versionsResponse = await fetch(`${API_URL}?action=versions&id=${encodeURIComponent(baseId)}`)
      if (!versionsResponse.ok) {
        throw new Error('Failed to fetch version metadata')
      }

      const versionsPayload = await versionsResponse.json() as {
        ok: boolean
        baseId: string
        versions: DiffVersion[]
        latestVersion: number
      }

      if (!versionsPayload.ok || !Array.isArray(versionsPayload.versions)) {
        throw new Error('Invalid version metadata response')
      }

      setDiffBaseId(versionsPayload.baseId)
      setPaperId(versionsPayload.baseId)
      setDiffVersions(versionsPayload.versions)
      setAppMode('diff')

      const { fromVersion, toVersion } = selectPreferredDiffPair(
        versionsPayload.versions,
        options.preferredFromVersion,
        options.preferredToVersion
      )

      if (fromVersion === null || toVersion === null) {
        setDiffMessage('No versions found for this paper.')
        setDiffEntries([])
        setSelectedDiffFilePath(null)
        setLoading(false)
        setInitialLoading(false)
        return
      }

      if (versionsPayload.versions.length < 2) {
        setDiffFromVersion(fromVersion)
        setDiffToVersion(toVersion)
        setDiffEntries([])
        setSelectedDiffFilePath(null)
        setDiffMessage('Only one version is available for this paper. Diff mode requires at least two versions.')
        if (!options.skipHistory) {
          updateDiffHistory(versionsPayload.baseId, fromVersion, toVersion, null, options.replaceHistory ?? false)
        }
        setLoading(false)
        setInitialLoading(false)
        return
      }

      await loadDiffPair(
        versionsPayload.baseId,
        fromVersion,
        toVersion,
        options.preferredFilePath,
        options
      )
    } catch (error) {
      console.error('Error loading diff mode:', error)
      setToastMessage('Error loading diff mode. Please verify the arXiv ID and try again.')
      setLoading(false)
      setInitialLoading(false)
    }
  }, [loadDiffPair, updateDiffHistory])

  // Auto-uncollapse file browser when screen size increases above mobile breakpoint
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && fileBrowserCollapsed) {
        setFileBrowserCollapsed(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [fileBrowserCollapsed])

  // Keyboard shortcuts for search (browse mode only)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appMode !== 'browse' || files.length === 0) return

      const isSearchShortcut = (e.metaKey || e.ctrlKey) && e.key === 'k'
      const isSlashShortcut = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey

      if (isSearchShortcut || isSlashShortcut) {
        const activeElement = document.activeElement as HTMLElement
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
          return
        }

        e.preventDefault()
        fileBrowserRef.current?.openSearch()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [appMode, files.length])

  // Handle initial URL loading on mount
  useEffect(() => {
    const urlState = parseURL(window.location.pathname)

    if (urlState.mode === 'diff' && urlState.arxivId && urlState.fromVersion !== null && urlState.toVersion !== null) {
      setAppMode('diff')
      setPaperId(urlState.arxivId)
      void handleDiffSubmit(urlState.arxivId, {
        preferredFromVersion: urlState.fromVersion,
        preferredToVersion: urlState.toVersion,
        preferredFilePath: urlState.filePath,
        skipHistory: true,
      })
      return
    }

    if (urlState.mode === 'browse' && urlState.arxivId) {
      setAppMode('browse')
      void handleArxivSubmit(urlState.arxivId, { skipHistory: true })
      return
    }

    setInitialLoading(false)
  }, [handleArxivSubmit, handleDiffSubmit])

  // Handle browser navigation (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const urlState = parseURL(window.location.pathname)

      if (urlState.mode === 'diff') {
        setAppMode('diff')

        if (urlState.arxivId && urlState.fromVersion !== null && urlState.toVersion !== null) {
          const alreadyLoaded =
            diffBaseId === urlState.arxivId &&
            diffFromVersion === urlState.fromVersion &&
            diffToVersion === urlState.toVersion &&
            diffEntries.length > 0

          setPaperId(urlState.arxivId)

          if (alreadyLoaded) {
            if (urlState.filePath && diffEntries.some((entry) => entry.path === urlState.filePath)) {
              setSelectedDiffFilePath(urlState.filePath)
            } else {
              const firstChanged = diffEntries.find((entry) => entry.status !== 'unchanged')
              setSelectedDiffFilePath(firstChanged?.path || diffEntries[0]?.path || null)
            }
          } else {
            void handleDiffSubmit(urlState.arxivId, {
              preferredFromVersion: urlState.fromVersion,
              preferredToVersion: urlState.toVersion,
              preferredFilePath: urlState.filePath,
              skipHistory: true,
            })
          }
        }

        return
      }

      setAppMode('browse')
      if (urlState.arxivId && urlState.arxivId !== paperId) {
        setPaperId(urlState.arxivId)
        void handleArxivSubmit(urlState.arxivId, { skipHistory: true })
      } else if (!urlState.arxivId && paperId) {
        setFiles([])
        setSelectedFile(null)
        setZipBlob(null)
        setPaperId('')
        setInitialLoading(false)
      } else if (urlState.arxivId === paperId && files.length > 0) {
        const targetFile = files.find((file) => file.path === urlState.filePath)
        if (targetFile && targetFile !== selectedFile) {
          setSelectedFile(targetFile)
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [
    diffBaseId,
    diffEntries,
    diffFromVersion,
    diffToVersion,
    files,
    handleArxivSubmit,
    handleDiffSubmit,
    paperId,
    selectedFile,
  ])

  // Handle file selection from URL after files are loaded in browse mode
  useEffect(() => {
    if (appMode !== 'browse') {
      return
    }

    if (files.length > 0 && paperId) {
      const urlState = parseURL(window.location.pathname)
      if (urlState.mode === 'browse' && urlState.filePath && urlState.arxivId === paperId) {
        const targetFile = files.find((file) => file.path === urlState.filePath)
        if (targetFile && targetFile !== selectedFile) {
          setSelectedFile(targetFile)
        }
      }
    }
  }, [appMode, files, paperId, selectedFile])

  // Update document title based on current state
  useEffect(() => {
    if (appMode === 'diff') {
      if (diffBaseId && diffFromVersion !== null && diffToVersion !== null) {
        if (selectedDiffFilePath) {
          document.title = `${selectedDiffFilePath} - arXiv ${diffBaseId} v${diffFromVersion}..v${diffToVersion} - Diff`
          return
        }
        document.title = `arXiv ${diffBaseId} v${diffFromVersion}..v${diffToVersion} - Diff`
        return
      }

      document.title = 'arXiv Diff Mode - arXiv Source Browser'
      return
    }

    if (paperId && selectedFile) {
      document.title = `${selectedFile.name} - arXiv ${paperId} - arXiv Source Browser`
    } else if (paperId) {
      document.title = `arXiv ${paperId} - arXiv Source Browser`
    } else {
      document.title = 'arXiv Source Browser'
    }
  }, [appMode, diffBaseId, diffFromVersion, diffToVersion, paperId, selectedDiffFilePath, selectedFile])

  useEffect(() => {
    if (appMode !== 'browse') {
      setTexOutline([])
      setSelectedOutlineLine(null)
      return
    }

    let cancelled = false

    const loadOutline = async () => {
      if (!selectedFile || getFileType(selectedFile.name) !== 'tex') {
        setTexOutline([])
        setSelectedOutlineLine(null)
        return
      }

      try {
        let textContent = selectedFile.content
        if (textContent === null) {
          textContent = await selectedFile.zipFile.async('text')
          selectedFile.content = textContent
        }

        const { lineCount, entries } = parseTexOutline(textContent)
        if (cancelled) {
          return
        }

        if (lineCount < 150 || entries.length <= 1) {
          setTexOutline([])
          setSelectedOutlineLine(null)
          return
        }

        if (!hideCommentsInViewer) {
          setTexOutline(entries)
          return
        }

        const lineMap = buildVisibleLineMapAfterCommentStrip(textContent)
        const mappedEntries = entries
          .map((entry) => {
            const mappedLine = lineMap[entry.lineNumber - 1]
            return {
              ...entry,
              lineNumber: mappedLine ?? entry.lineNumber
            }
          })
          .filter((entry) => entry.lineNumber > 0)

        setTexOutline(mappedEntries)
      } catch (error) {
        console.error('Error building TeX outline:', error)
        if (!cancelled) {
          setTexOutline([])
          setSelectedOutlineLine(null)
        }
      }
    }

    void loadOutline()

    return () => {
      cancelled = true
    }
  }, [appMode, selectedFile, hideCommentsInViewer])

  useEffect(() => {
    setHideCommentsInViewer(false)
  }, [selectedFile?.path])

  useEffect(() => {
    setSelectedOutlineLine(null)
    setOutlineJumpRequest(null)
    outlineSelectionLockUntilRef.current = 0
    if (outlineSelectionLockTimerRef.current !== null) {
      window.clearTimeout(outlineSelectionLockTimerRef.current)
      outlineSelectionLockTimerRef.current = null
    }
  }, [selectedFile?.path, hideCommentsInViewer])

  useEffect(() => {
    return () => {
      if (outlineSelectionLockTimerRef.current !== null) {
        window.clearTimeout(outlineSelectionLockTimerRef.current)
      }
    }
  }, [])

  const handleFileSelect = useCallback((file: FileEntry) => {
    setSelectedFile(file)

    if (paperId) {
      const newURL = buildURL(paperId, file.path)
      window.history.pushState(null, '', newURL)
    }

    if (window.innerWidth <= 768) {
      setFileBrowserCollapsed(true)
    }
  }, [paperId])

  const handleOutlineSelect = useCallback((lineNumber: number) => {
    lockOutlineSelectionFromScroll()
    setSelectedOutlineLine(lineNumber)
    setOutlineJumpRequest((prev) => ({
      lineNumber,
      token: (prev?.token ?? 0) + 1
    }))
  }, [lockOutlineSelectionFromScroll])

  const handleViewerVisibleLineChange = useCallback((lineNumber: number) => {
    if (!selectedFile || getFileType(selectedFile.name) !== 'tex') {
      return
    }

    if (Date.now() < outlineSelectionLockUntilRef.current) {
      return
    }

    const activeOutlineLine = findNearestOutlineLineAtOrAbove(lineNumber, texOutline)
    setSelectedOutlineLine((prev) => (prev === activeOutlineLine ? prev : activeOutlineLine))
  }, [selectedFile, texOutline])

  const handleToggleFileBrowser = () => {
    setFileBrowserCollapsed(!fileBrowserCollapsed)
  }

  const handleDownloadZip = () => {
    if (!zipBlob) return

    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arxiv-source.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleLogoClick = () => {
    setAppMode('browse')
    setFiles([])
    setSelectedFile(null)
    setZipBlob(null)
    setPaperId('')
    clearDiffState()
    setInitialLoading(false)
    window.history.pushState(null, '', BASE_URL)
  }

  const handleExampleClick = (examplePaperId: string) => {
    setPaperId(examplePaperId)
    void handleArxivSubmit(examplePaperId)
  }

  const handleModeSwitch = (mode: AppMode) => {
    if (mode === appMode) {
      return
    }

    setAppMode(mode)
    setInitialLoading(false)

    if (mode === 'browse') {
      if (paperId && files.length > 0) {
        window.history.pushState(null, '', buildURL(paperId, selectedFile?.path))
      } else {
        window.history.pushState(null, '', BASE_URL)
      }
      return
    }

    if (diffBaseId && diffFromVersion !== null && diffToVersion !== null) {
      updateDiffHistory(diffBaseId, diffFromVersion, diffToVersion, selectedDiffFilePath)
    }
  }

  const handleDiffFileSelect = (path: string) => {
    setSelectedDiffFilePath(path)
    if (diffBaseId && diffFromVersion !== null && diffToVersion !== null) {
      updateDiffHistory(diffBaseId, diffFromVersion, diffToVersion, path)
    }
  }

  const handleDiffFromVersionChange = (version: number) => {
    if (!diffBaseId || diffToVersion === null) {
      return
    }
    void loadDiffPair(diffBaseId, version, diffToVersion, selectedDiffFilePath, { replaceHistory: false })
  }

  const handleDiffToVersionChange = (version: number) => {
    if (!diffBaseId || diffFromVersion === null) {
      return
    }
    void loadDiffPair(diffBaseId, diffFromVersion, version, selectedDiffFilePath, { replaceHistory: false })
  }

  const handleInputSubmit = (url: string) => {
    if (appMode === 'diff') {
      void handleDiffSubmit(url)
      return
    }
    void handleArxivSubmit(url)
  }

  const hasMainContent = appMode === 'diff' || files.length > 0

  return (
    <div className={`app ${hasMainContent ? 'has-files' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <h1 onClick={handleLogoClick} className="app-logo">arXiv Source Browser</h1>
          <div className="header-input-group">
            <div className="mode-toggle" role="tablist" aria-label="Application mode">
              <button
                type="button"
                className={`mode-toggle-button ${appMode === 'browse' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('browse')}
                aria-pressed={appMode === 'browse'}
              >
                <Columns2 size={16} />
                Browse
              </button>
              <button
                type="button"
                className={`mode-toggle-button ${appMode === 'diff' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('diff')}
                aria-pressed={appMode === 'diff'}
              >
                <GitCompare size={16} />
                Diff
              </button>
            </div>
            <ArxivInput
              onSubmit={handleInputSubmit}
              loading={loading}
              value={paperId}
              onChange={setPaperId}
            />
          </div>
          <button
            className="settings-button"
            onClick={() => setShowSettings(true)}
            data-tooltip="Open settings"
            aria-label="Open settings"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
        {initialLoading && (
          <div className="start-page">
            <div className="welcome-section">
              <div className="loading-spinner">
                <Loader2 size={32} className="spinner" />
              </div>
              <h2>Loading arXiv paper...</h2>
              <p className="description">
                Please wait while we fetch and process the source files.
              </p>
            </div>
          </div>
        )}
        {appMode === 'browse' && files.length === 0 && !initialLoading && (
          <div className="start-page">
            <div className="welcome-section">
              <h2>Browse arXiv LaTeX Source Files</h2>
              <p className="description">
                Explore the LaTeX source code of papers from arXiv.
                View, navigate, and download the raw files that researchers use to create their publications.
              </p>
            </div>

            <div className="features-section">
              <h3>What you can do:</h3>
              <ul className="features-list">
                <li>📁 Browse all source files in an interactive file tree</li>
                <li>📝 View LaTeX files with syntax highlighting</li>
                <li>🖼️ Preview images and PDFs embedded in papers</li>
                <li>💾 Download the complete source as a ZIP file</li>
              </ul>
            </div>

            <div className="examples-section">
              <h3>Try these example papers:</h3>
              <div className="example-papers">
                {EXAMPLE_PAPERS.map((paper) => (
                  <button
                    key={paper.id}
                    className="example-paper"
                    onClick={() => handleExampleClick(paper.id)}
                    disabled={loading}
                  >
                    <div className="paper-id">{paper.id}</div>
                    <div className="paper-title">{paper.title}</div>
                    <div className="paper-authors">{paper.authors}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="about-section">
              <p>This website is maintained by <a href="https://dominik-peters.de">Dominik Peters</a> and is not affiliated with arXiv.org.</p>
              <p>First published: June 2025. Last updated: February 2026, version 2.0.</p>
              <p>Source code is available on <a href="https://github.com/DominikPeters/arxiv-source-browser">GitHub</a> under MIT license. The app was mostly implemented using Claude Code.</p>
            </div>
          </div>
        )}
      </header>

      {appMode === 'browse' && files.length > 0 && (
        <div className="app-content">
          <div className="file-browser">
            <FileBrowser
              ref={fileBrowserRef}
              files={files}
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              texOutline={texOutline}
              selectedOutlineLine={selectedOutlineLine}
              onOutlineSelect={handleOutlineSelect}
              onDownloadZip={handleDownloadZip}
              isCollapsed={fileBrowserCollapsed}
              onToggleCollapse={handleToggleFileBrowser}
            />
          </div>
          <div className="file-viewer-container">
            {selectedFile ? (
              <FileViewer
                file={selectedFile}
                wordWrap={wordWrap}
                onError={setToastMessage}
                files={files}
                onFileSelect={handleFileSelect}
                onHideCommentsChange={setHideCommentsInViewer}
                onVisibleLineChange={handleViewerVisibleLineChange}
                scrollToLine={outlineJumpRequest}
              />
            ) : (
              <div className="no-file-selected">
                Select a file to view its contents
              </div>
            )}
          </div>
        </div>
      )}

      {appMode === 'diff' && (
        <div className="app-content diff-app-content">
          <DiffMode
            loading={loading}
            baseId={diffBaseId || splitArxivVersion(paperId).baseId}
            versions={diffVersions}
            fromVersion={diffFromVersion}
            toVersion={diffToVersion}
            entries={diffEntries}
            selectedPath={selectedDiffFilePath}
            message={diffMessage}
            wordWrap={wordWrap}
            diffViewLayout={diffViewLayout}
            onFromVersionChange={handleDiffFromVersionChange}
            onToVersionChange={handleDiffToVersionChange}
            onSelectFile={handleDiffFileSelect}
            onError={setToastMessage}
          />
        </div>
      )}

      {showSettings && (
        <Settings
          wordWrap={wordWrap}
          onWordWrapChange={setWordWrap}
          showDiffLayoutOptions={appMode === 'diff'}
          diffViewLayout={diffViewLayout}
          onDiffViewLayoutChange={setDiffViewLayout}
          onClose={() => setShowSettings(false)}
        />
      )}

      {toastMessage && (
        <Toast
          message={toastMessage}
          type="error"
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  )
}

export default App
