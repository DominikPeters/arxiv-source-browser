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

Usage: `api/api.php?url=https://arxiv.org/abs/2402.10439`

## Development Commands

### Frontend Development
```bash
npm install          # Install dependencies
npm run dev          # Start development server on http://localhost:5173
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
  - `FileBrowser`: Displays file tree with icons
  - `FileViewer`: Renders file content with syntax highlighting
- **Types**: TypeScript interfaces in `src/types.ts`
- **Styling**: CSS modules with responsive design
- **Dependencies**: JSZip for ZIP handling, Prism.js for syntax highlighting