import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_URL || '/',
  resolve: {
    alias: [
      {
        find: '@git-diff-view/lowlight',
        replacement: fileURLToPath(new URL('./src/diff/minimalLowlight.ts', import.meta.url)),
      },
      {
        find: /^codemirror-lang-latex$/,
        replacement: fileURLToPath(new URL('./src/codemirror/shims/codemirror-lang-latex.ts', import.meta.url)),
      },
      {
        find: /^codemirror-lang-bib$/,
        replacement: fileURLToPath(new URL('./src/codemirror/shims/codemirror-lang-bib.ts', import.meta.url)),
      },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['jszip', 'lucide-react', 'react-arborist']
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:18000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    }
  }
})
