import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { prerenderPages } from './scripts/prerenderPages.ts'

// After a production build, writes a real HTML file (title, description, structured data and readable content) for every public
// page, plus sitemap.xml and llms.txt. See scripts/prerenderPages.ts. Set VITE_SITE_URL to the public address of the site.
function prerenderPublicPages(): Plugin {
  let outDir = ''
  let siteUrl: string | undefined
  return {
    name: 'prerender-public-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      siteUrl = process.env.VITE_SITE_URL ?? loadEnv(config.mode, config.root, 'VITE_').VITE_SITE_URL
    },
    closeBundle() {
      console.log(prerenderPages(outDir, siteUrl))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prerenderPublicPages()],
  test: {
    environment: 'happy-dom', // Updated from jsdom
    globals: true,
    pool: 'threads',
  }
})
