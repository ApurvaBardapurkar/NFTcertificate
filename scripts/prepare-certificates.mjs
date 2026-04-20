import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(process.cwd())
const OUT_DIR = path.join(ROOT, 'public', 'certificates')

const SOURCES = [
  { src: path.join(ROOT, 'BMS-Certi.jpg'), out: 'bms.png' },
  { src: path.join(ROOT, 'jain-university-certi.jpg'), out: 'jain.png' },
  // Replace old MIT certificate with MIT-Alandi-certi
  { src: path.join(ROOT, 'MIT-Alandi-certi.jpg'), out: 'mit.png' },
  { src: path.join(ROOT, 'reva-university-certi.jpg'), out: 'reva.png' },
  { src: path.join(ROOT, 'Vidyashilp-University-certi.jpg'), out: 'vidyashilp.png' },
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
    // eslint-disable-next-line no-console
    console.log(`Wrote ${path.relative(ROOT, outPath)}`)
  }

  // eslint-disable-next-line no-console
  console.log('Certificate assets ready.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

