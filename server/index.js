import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const upload = multer({ storage: multer.memoryStorage() })

// Load .env reliably (works even if process CWD is different)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

function getPinataJwt() {
  return (process.env.PINATA_JWT || '').trim()
}

function getGatewayBase() {
  const v = (process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs/').trim()
  return v.endsWith('/') ? v : `${v}/`
}

function requireJwt() {
  if (!getPinataJwt()) {
    const err = new Error('Missing PINATA_JWT in server environment')
    err.statusCode = 500
    throw err
  }
}

async function pinFileToPinata({ fileBuffer, fileName, contentType }) {
  requireJwt()

  const form = new FormData()
  form.append('file', new Blob([fileBuffer], { type: contentType || 'application/octet-stream' }), fileName)

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getPinataJwt()}` },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Pinata pinFileToIPFS failed: ${res.status} ${text}`)
  }

  return await res.json()
}

async function pinJsonToPinata(json) {
  requireJwt()

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getPinataJwt()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(json),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Pinata pinJSONToIPFS failed: ${res.status} ${text}`)
  }

  return await res.json()
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasPinataJwt: !!getPinataJwt() })
})

// Upload rendered certificate image (PNG/JPG) to IPFS
app.post('/api/ipfs/certificate', upload.single('file'), async (req, res) => {
  try {
    const f = req.file
    if (!f) return res.status(400).json({ error: 'Missing file' })

    const pinned = await pinFileToPinata({
      fileBuffer: f.buffer,
      fileName: f.originalname || 'certificate.png',
      contentType: f.mimetype,
    })

    const ipfsHash = pinned.IpfsHash
    const gateway = getGatewayBase()
    res.json({
      ipfsHash,
      ipfsUri: `ipfs://${ipfsHash}`,
      gatewayUrl: `${gateway}${ipfsHash}`,
    })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Upload failed' })
  }
})

// Upload NFT metadata JSON to IPFS
app.post('/api/ipfs/metadata', async (req, res) => {
  try {
    const { name, description, image, attributes } = req.body || {}
    if (!name || !description || !image) {
      return res.status(400).json({ error: 'Missing name/description/image' })
    }

    const pinned = await pinJsonToPinata({
      name,
      description,
      image,
      attributes: Array.isArray(attributes) ? attributes : [],
    })

    const ipfsHash = pinned.IpfsHash
    const gateway = getGatewayBase()
    res.json({
      ipfsHash,
      ipfsUri: `ipfs://${ipfsHash}`,
      gatewayUrl: `${gateway}${ipfsHash}`,
    })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Upload failed' })
  }
})

// Default to 5175 to avoid clashing with Vite (which often uses 5173/5174)
const port = Number(process.env.PORT || 5175)
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`IPFS backend listening on http://localhost:${port}`)
})

