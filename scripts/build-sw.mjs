import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const bundledPackages = ['three', '@fontsource-variable/dm-sans', '@fontsource-variable/space-grotesk']
const notices = await Promise.all(bundledPackages.map(async name => {
  const license = await readFile(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), 'utf8')
  return `${name}\n\n${license.trim()}`
}))
notices.push('Park photography and grass texture · CC0 1.0\nEvening Meadow, Alexander Scholten · https://polyhaven.com/a/evening_meadow\nGrass Ground, Charlotte Baglioni · https://polyhaven.com/a/grass_ground\nhttps://polyhaven.com/license')
await writeFile(path.join(dist, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'))

const artifacts = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => path.relative(dist, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  .sort()
if (!artifacts.includes('index.html')) throw new Error('Build the site before generating its service worker.')

const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8')
const hash = createHash('sha256').update(template)
for (const name of artifacts) {
  hash.update(name)
  hash.update(await readFile(path.join(dist, name)))
}
const worker = template
  .replace('__ASSETS__', JSON.stringify(artifacts))
  .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 16)))
await writeFile(path.join(dist, 'sw.js'), worker)
