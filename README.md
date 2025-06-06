# arxiv-source-browser
A web utility for browsing the LaTeX source of an arXiv paper

A user can enter an arXiv URL or paper ID, and the utility will fetch the LaTeX source code of the paper from arXiv. All the files from the source package will be extracted and displayed in a user-friendly format. In particular, LaTeX and bib files are shown with syntax highlighting and there is a preview function for image files and PDFs. The user can navigate through the files easily.

The web app uses React. Almost all the logic is implemented in the frontend, with a small backend that fetches the source code .tar.gz from arXiv and converts it to .zip which is easier to handle in the browser.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```