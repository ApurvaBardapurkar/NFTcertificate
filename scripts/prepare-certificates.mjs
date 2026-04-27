import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(process.cwd())
const OUT_DIR = path.join(ROOT, 'public', 'certificates')

const SOURCES = [
  // Optional: if you have high-res certificate JPGs, drop them in repo root and run `npm run assets:certificates`.
  // Otherwise, the app ships with SVG templates in `public/certificates/`.
  { src: path.join(ROOT, 'DYPCOE-certi.jpg'), out: 'dypcoe.jpeg' },
  { src: path.join(ROOT, 'Vidyavardhaka-certi.jpg'), out: 'vidyavardhaka.jpeg' },
]

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  const missing = []
  for (const s of SOURCES) {
    if (!(await fileExists(s.src))) missing.push(path.basename(s.src))
  }
  if (missing.length) {
    console.error(`Missing source images in project root: ${missing.join(', ')}`)
    process.exitCode = 1
    return
  }

  for (const s of SOURCES) {
    const outPath = path.join(OUT_DIR, s.out)
    await sharp(s.src).png({ quality: 95 }).toFile(outPath)
    console.log(`Wrote ${path.relative(ROOT, outPath)}`)
  }

  console.log('Certificate assets ready.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

