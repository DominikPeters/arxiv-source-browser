# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is an arXiv source browser web application with a simple architecture:

- **Backend**: PHP API (`api/api.php`) that serves as a proxy to download arXiv LaTeX source files
  - Takes arXiv URLs/IDs as input
  - Downloads .tar.gz source files from arXiv
  - Converts them to .zip format for easier browser handling
  - Serves the converted files for download
- **Frontend**: React TypeScript application with Vite
  - Handles user input (arXiv URLs/paper IDs)
  - Displays and navigates through extracted LaTeX files
  - Provides syntax highlighting for LaTeX/bib files using Prism.js
  - Previews images and PDFs
  - Uses JSZip to handle ZIP files from the backend

## Backend API Details

The PHP API (`api/api.php`) handles the core functionality:
- Supports multiple arXiv URL formats (abs, pdf, html, src)
- Handles both new format IDs (YYYY.NNNNN) and old format IDs
- Uses cURL for downloading with proper user agent and timeout settings
- Extracts tar.gz files using PharData (with system tar fallback)
- Creates ZIP archives using ZipArchive
- Includes proper error handling and temporary file cleanup

Usage: `api/api.php?url=https://arxiv.org/abs/1706.03762`

## Development Commands

### Frontend Development
```bash
npm install          # Install dependencies
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Backend Development
For local development, serve the PHP API:
```bash
php -S localhost:8000 -t .   # Serve PHP API on port 8000
```

The Vite dev server is configured to proxy `/api` requests to `localhost:8000`.

## Frontend Architecture

- **Components**:
  - `ArxivInput`: Handles URL/ID input and submission
  - `FileBrowser`: Displays file tree with icons and auto-expansion
  - `FileViewer`: Renders file content with syntax highlighting, LaTeX link detection, file downloads, and copy-to-clipboard functionality
- **Types**: TypeScript interfaces in `src/types.ts`
- **Styling**: CSS modules with responsive design
- **Dependencies**: JSZip for ZIP handling, Prism.js for syntax highlighting

## LaTeX Link Detection

The FileViewer component includes automatic link detection for LaTeX commands using Prism.js hooks:

### Supported Commands
- `\input{filename}` - Links to .tex files (auto-adds .tex extension)
- `\includegraphics[options]{filename}` - Links to image files (tries common extensions: .png, .jpg, .jpeg, .pdf, .eps, .svg, .gif)

### Prism.js Tokenization Architecture
**Key Challenge**: Prism's LaTeX tokenizer breaks commands into separate tokens rather than complete strings.

**Token Structure**:
- `\input{filename}` → `\input` (function) + `{` (punctuation) + `filename` (content) + `}` (punctuation)
- `\includegraphics[options]{file}` → `\includegraphics` (function) + `[` + options + `]` + `{` (punctuation) + `file` (content) + `}` (punctuation)

**Implementation Strategy**:
1. **after-tokenize hook**: Detects token patterns and reconstructs commands
   - For `\input`: Find function token + immediate `{` token
   - For `\includegraphics`: Skip optional `[...]` parameters, find first `{` token
   - Collect content between `{` and `}`
   - Replace token sequence with custom `Prism.Token`
2. **wrap hook**: Adds HTML attributes and CSS classes to custom tokens
3. **Event delegation**: Handles clicks on generated links

**File Resolution**:
- Handles relative paths (removes `./` prefix)
- Auto-adds extensions (.tex for inputs, tries multiple for images)
- Searches by full path, filename, and directory structure

### Tree Navigation
The FileBrowser automatically expands parent directories when files are selected:
- Manually opens parent directories using `treeRef.current.open()`
- Uses setTimeout to allow tree re-render before focusing
- Focuses selected file using `node.focus()`

## URL Routing

The app implements client-side routing with browser history support:

### URL Format
- **Home**: `/`
- **Paper**: `/abs/[arxiv-id]` (loads paper and selects main .tex file)
- **Specific file**: `/abs/[arxiv-id]/[file-path]` (loads paper and selects specific file)

### Examples
- `/abs/1706.03762` - Loads paper 1706.03762 and shows main .tex file
- `/abs/1706.03762/ms.tex` - Loads paper and shows ms.tex file
- `/abs/1706.03762/figures/attention.png` - Loads paper and shows attention.png

### Implementation Details
- **URL parsing**: `parseURL()` in `src/types.ts` extracts arXiv ID and file path
- **URL building**: `buildURL()` constructs URLs from arXiv ID and optional file path
- **File path handling**: Preserves directory structure with forward slashes (not URL encoded)
- **Browser history**: Back/forward buttons work correctly, URLs update after interface changes
- **Initial load**: App reads URL on startup and loads appropriate paper/file
- **Fallback behavior**: If specified file doesn't exist, falls back to main .tex file

### URL State Management
- Interface updates happen first, then URL is updated (prevents sluggishness)
- API calls only occur when loading new papers, not on file navigation
- Browser navigation events handled via `popstate` listener

## Base URL Configuration

The app supports deployment in subdirectories via environment variable:

### Environment Variables
- `VITE_BASE_URL`: Set the base path for the application (default: `/`)

### Examples
```bash
# Deploy to subdirectory
VITE_BASE_URL=/myapp/ npm run build

# Deploy to root (default)
npm run build
```

### Apache Configuration
The app includes `.htaccess` file in `/public/` for URL rewriting:
- Redirects all requests to `index.html` (except API calls and static files)
- Enables client-side routing on Apache servers
- Includes optional caching and compression optimizations

### Production Deployment
1. Set `VITE_BASE_URL` if deploying to subdirectory
2. Build the app: `npm run build`
3. Copy `dist/` contents to web server
4. Ensure `.htaccess` is included for Apache servers
5. For other servers, configure URL rewriting to serve `index.html` for non-file requests