import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

function offlineBuild(): Plugin {
  return {
    name: 'stripe-offline-shell',
    apply: 'build',
    async writeBundle({ dir = 'dist' }) {
      const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
        .filter((file) => file.isFile() && /\.(html|js|css|svg|woff2?|mp4)$/.test(file.name) && file.name !== 'service-worker.js')
        .map((file) => relative(dir, join(file.parentPath, file.name)).split(sep).join('/'))
        .sort()
      const source = await readFile(new URL('./src/workers/offline-sw.js', import.meta.url), 'utf8')
      const hash = createHash('sha256').update(source)
      for (const name of files) hash.update(name).update(await readFile(join(dir, name)))
      const revision = hash.digest('hex').slice(0, 16)
      const manifest = JSON.stringify({ revision, files })
      await writeFile(join(dir, 'service-worker.js'), `const BUILD = ${manifest}\n${source}`)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [vue(), offlineBuild()],
})
