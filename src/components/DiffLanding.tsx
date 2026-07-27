import { useEffect, useState } from 'react'
import type JSZip from 'jszip'
import type { DiffFileStatus, DiffViewLayout, FileEntry } from '../types'
import DiffViewer from './DiffViewer'

// The mock diffs below feed the real DiffViewer. Because each entry already has
// its `content` set, DiffViewer resolves text directly and never touches
// `zipFile`, so a placeholder is safe here.
function mockEntry(path: string, content: string): FileEntry {
  return {
    name: path.split('/').pop() || path,
    path,
    content,
    zipFile: null as unknown as JSZip.JSZipObject,
  }
}

interface DiffCase {
  id: string
  title: string
  description: string
  filePath: string
  status: DiffFileStatus
  oldFile: FileEntry
  newFile: FileEntry
  oldPath?: string
  newPath?: string
  renameSimilarity?: number
}

interface DiffExample {
  id: string
  fromVersion: number
  toVersion: number
  title: string
  note: string
}

// Real papers whose conclusions visibly shifted between versions. Version ranges
// were checked against each paper's arXiv submission history.
const DIFF_EXAMPLES: DiffExample[] = [
  {
    id: '1403.3985',
    fromVersion: 1,
    toVersion: 3,
    title: 'Primordial gravitational waves — BICEP2',
    note: 'The headline detection of inflationary B-modes is walked back once galactic dust is taken into account.',
  },
  {
    id: '2307.12037',
    fromVersion: 1,
    toVersion: 3,
    title: 'Room-temperature superconductor — LK-99',
    note: 'The LK-99 levitation preprint, revised three times in three weeks amid a worldwide replication scramble.',
  },
]

interface DiffLandingProps {
  onOpenExample: (id: string, fromVersion: number, toVersion: number) => void
  loading: boolean
}

// Defined at module scope so the FileEntry object identities stay stable across
// renders (DiffViewer reloads content whenever oldFile/newFile change identity).
const CASES: DiffCase[] = [
  {
    id: 'stronger-result',
    title: 'A result got stronger',
    description:
      'Authors routinely tighten their bounds between revisions. A diff shows the improvement at a glance — here a 5-colouring becomes a 4-colouring with an added running-time guarantee.',
    filePath: 'main.tex',
    status: 'modified',
    oldFile: mockEntry(
      'main.tex',
      '\\begin{theorem}\\label{thm:main}\n' +
        '  Every planar graph is properly\n' +
        '  colorable with at most $5$ colors.\n' +
        '\\end{theorem}\n'
    ),
    newFile: mockEntry(
      'main.tex',
      '\\begin{theorem}\\label{thm:main}\n' +
        '  Every planar graph is properly\n' +
        '  colorable with at most $4$ colors,\n' +
        '  and such a coloring can be computed\n' +
        '  in $O(n^2)$ time.\n' +
        '\\end{theorem}\n'
    ),
  },
  {
    id: 'hidden-assumption',
    title: 'A missing hypothesis appeared',
    description:
      'The kind of subtle correctness fix that is easy to miss when re-reading a whole paper: a "continuous" assumption was quietly added to a lemma between v1 and v2.',
    filePath: 'lemmas.tex',
    status: 'modified',
    oldFile: mockEntry(
      'lemmas.tex',
      '\\begin{lemma}\n' +
        '  Let $f\\colon [0,1] \\to \\mathbb{R}$.\n' +
        '  Then $f$ attains its maximum.\n' +
        '\\end{lemma}\n'
    ),
    newFile: mockEntry(
      'lemmas.tex',
      '\\begin{lemma}\n' +
        '  Let $f\\colon [0,1] \\to \\mathbb{R}$ be\n' +
        '  continuous. Then $f$ attains its maximum.\n' +
        '\\end{lemma}\n'
    ),
  },
  {
    id: 'walked-back-claim',
    title: 'An overclaim was walked back',
    description:
      'Reviewers often push back on sweeping statements. Diffing reveals exactly how strong the authors’ claims were before — and what survived peer review.',
    filePath: 'intro.tex',
    status: 'modified',
    oldFile: mockEntry(
      'intro.tex',
      'Our method is optimal and outperforms\n' +
        'all prior work on every benchmark.\n'
    ),
    newFile: mockEntry(
      'intro.tex',
      'Our method outperforms prior work on\n' +
        'most of the benchmarks we consider.\n'
    ),
  },
  {
    id: 'moved-file',
    title: 'Files that moved are still matched',
    description:
      'When a file is renamed or moved, its changes would normally look like a wholesale deletion and addition. The browser detects the move and diffs the two as one file instead.',
    filePath: 'experiments.tex',
    status: 'modified',
    oldPath: 'sections/experiments.tex',
    newPath: 'experiments.tex',
    renameSimilarity: 0.82,
    oldFile: mockEntry(
      'sections/experiments.tex',
      '\\section{Experiments}\n' +
        'We evaluate on three datasets and\n' +
        'report accuracy in Table~\\ref{tab:acc}.\n'
    ),
    newFile: mockEntry(
      'experiments.tex',
      '\\section{Experiments}\n' +
        'We evaluate on four datasets and\n' +
        'report accuracy in Table~\\ref{tab:acc}.\n'
    ),
  },
]

export default function DiffLanding({ onOpenExample, loading }: DiffLandingProps) {
  const [layout, setLayout] = useState<DiffViewLayout>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 760 ? 'split' : 'unified'
  )

  useEffect(() => {
    const handleResize = () => {
      setLayout(window.innerWidth >= 760 ? 'split' : 'unified')
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="diff-landing start-page">
      <section className="landing-hero">
        <p className="landing-eyebrow">Version diff</p>
        <h2>See exactly what changed between two versions of a paper.</h2>
        <p className="landing-description">
          arXiv papers are frequently revised, but the site only ever shows you the latest PDF.
          Pick any two versions and this browser lines up the LaTeX source side by side, so you can
          see precisely what the authors added, removed, or reworded — proofs, theorem statements,
          experiments, and all.
        </p>
        <div className="landing-highlights">
          <span className="highlight-chip">Side-by-side source diff</span>
          <span className="highlight-chip">LaTeX syntax highlighting</span>
          <span className="highlight-chip">Renamed &amp; moved files matched</span>
          <span className="highlight-chip">Any pair of revisions</span>
        </div>
        <p className="diff-landing-cta">
          Paste an arXiv link in the box above, or switch a paper you are already browsing into
          Diff mode.
        </p>
      </section>

      <section className="diff-landing-cases" aria-label="Why diff between versions">
        {CASES.map((diffCase) => (
          <article className="diff-landing-case" key={diffCase.id}>
            <div className="diff-landing-case-text">
              <h3>{diffCase.title}</h3>
              <p>{diffCase.description}</p>
            </div>
            <div className="diff-landing-case-diff">
              <DiffViewer
                filePath={diffCase.filePath}
                oldPath={diffCase.oldPath}
                newPath={diffCase.newPath}
                renameSimilarity={diffCase.renameSimilarity}
                status={diffCase.status}
                oldFile={diffCase.oldFile}
                newFile={diffCase.newFile}
                wordWrap
                diffViewLayout={layout}
              />
            </div>
          </article>
        ))}
      </section>

      <section className="examples-section">
        <div className="section-heading">
          <h3>Try it on a real paper</h3>
          <p>Famous preprints whose conclusions shifted between versions. Click to open the diff.</p>
        </div>
        <div className="example-papers">
          {DIFF_EXAMPLES.map((example) => (
            <button
              key={example.id}
              className="example-paper diff-example-paper"
              onClick={() => onOpenExample(example.id, example.fromVersion, example.toVersion)}
              disabled={loading}
            >
              <div className="paper-id">
                arXiv:{example.id} · v{example.fromVersion}&rarr;v{example.toVersion}
              </div>
              <div className="paper-title">{example.title}</div>
              <div className="diff-example-note">{example.note}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="about-section">
        <p>
          This website is maintained by <a href="https://dominik-peters.de">Dominik Peters</a> and is
          not affiliated with arXiv.org. The illustrated diffs above are mock-ups; the papers below
          are real.
        </p>
      </section>
    </div>
  )
}
