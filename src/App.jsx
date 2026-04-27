import { useEffect, useMemo, useRef, useState } from 'react'
import { ethers } from 'ethers'
import './App.css'

const CONTRACT_ABI = [
  'function mintWorkshopCertificate(uint256 eventId,string studentName,string branch,string tokenURI) external returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function hasMinted(uint256 eventId,address) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function totalSupplyForEvent(uint256 eventId) view returns (uint256)',
  'function MAX_SUPPLY_PER_EVENT() view returns (uint256)',
  'event CertificateMinted(uint256 indexed tokenId,address indexed recipient,uint256 indexed eventId,string studentName,string branch,string tokenURI)',
]

const COLLEGES = {
  // Using one contract per college: keep eventId constant (1) inside each contract.
  dypcoe: {
    label: 'DY Patil College of Engineering, Akurdi',
    eventId: 1,
    template: '/certificates/originals/dypcoe.jpeg',
    layout: { nameY: 0.468, fontScale: 0.062, maxWidth: 0.76, color: '#B88A2A' },
  },
  vidyavardhaka: {
    label: 'Vidyavardhaka College of Engineering',
    eventId: 1,
    template: 'certificates/originals/vidyavardhaka.jpeg',
    layout: { nameY: 0.468, fontScale: 0.062, maxWidth: 0.76, color: '#B88A2A' },
  },
}

function getCollege(key) {
  return COLLEGES[key] || null
}

function collectErrorCodesAndMessages(err, depth = 0) {
  if (!err || depth > 8) return { codes: [], text: '' }
  const codes = []
  if (err.code !== undefined && err.code !== null) codes.push(err.code)
  const text = `${err.shortMessage || ''} ${err.message || ''} ${err.reason || ''}`
  const inner = collectErrorCodesAndMessages(err.error || err.cause, depth + 1)
  return {
    codes: [...codes, ...inner.codes],
    text: `${text} ${inner.text}`,
  }
}

function isMetaMaskInternalRpcError(err) {
  const { codes, text } = collectErrorCodesAndMessages(err)
  const t = text.toLowerCase()
  if (t.includes('internal json-rpc')) return true
  if (codes.includes(-32603)) return true
  if (t.includes('-32603')) return true
  return false
}

function formatMintRpcError(err) {
  if (isMetaMaskInternalRpcError(err)) {
    return (
      'MetaMask hit an Internal JSON-RPC error (-32603) from the MST testnet endpoint. That usually means the RPC ' +
      'failed during gas estimation or returned a broken response — it does not mean the 50-certificate cap was reached. ' +
      'This app sends a fixed gas limit and gas price to avoid broken estimation. If it still fails: in MetaMask open the MST Testnet ' +
      'network settings and set the RPC URL to exactly the value in your .env as VITE_RPC_URL, save, then retry.'
    )
  }

  const msg = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.reason || ''}`.trim()
  if (msg.includes('missing revert data') || err?.code === 'CALL_EXCEPTION') {
    return (
      'The RPC did not return a revert reason. On MST Testnet this is usually an RPC limitation (not a real contract error), ' +
      'especially when MetaMask uses a different/broken RPC URL. Ensure MetaMask is on MST Testnet and its RPC URL matches ' +
      'your VITE_RPC_URL, then retry.'
    )
  }

  return err?.shortMessage || err?.message || err?.reason || 'Mint failed'
}

function normalizeExplorerBase(url) {
  if (!url) return ''
  return url.endsWith('/') ? url : `${url}/`
}

function shortAddr(addr) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function safeText(v) {
  return typeof v === 'string' ? v : ''
}

function ipfsToGateway(url, gatewayBase) {
  if (!url) return ''
  if (url.startsWith('ipfs://')) return `${gatewayBase}${url.slice('ipfs://'.length)}`
  return url
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function drawCertificate({ canvas, templateImg, studentName, layout }) {
  const ctx = canvas.getContext('2d')
  if (!ctx || !templateImg?.naturalWidth) return

  canvas.width = templateImg.naturalWidth
  canvas.height = templateImg.naturalHeight

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height)

  const name = (studentName || '').trim()
  if (!name) return

  const x = canvas.width * 0.5
  // Position between "Presented to:" and the horizontal line (default tuned for templates in /public/certificates).
  const y = canvas.height * (layout?.nameY ?? 0.468)
  const maxTextWidth = canvas.width * (layout?.maxWidth ?? 0.76)

  // Golden name as requested
  const gold = layout?.color || '#B88A2A'
  const shadow = 'rgba(0,0,0,0.22)'

  // Auto-fit font size for long names
  let fontSize = Math.round(canvas.width * (layout?.fontScale ?? 0.062))
  fontSize = clamp(fontSize, 34, 80)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  while (fontSize > 24) {
    ctx.font = `900 ${fontSize}px "Georgia", "Times New Roman", serif`
    const w = ctx.measureText(name).width
    if (w <= maxTextWidth) break
    fontSize -= 2
  }

  ctx.shadowColor = shadow
  ctx.shadowBlur = 6
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  // subtle stroke for clarity
  ctx.lineWidth = Math.max(3, Math.round(canvas.width * 0.003))
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.strokeText(name, x, y)

  ctx.fillStyle = gold
  ctx.fillText(name, x, y)

  // reset shadow
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

async function requireMstNetwork(ethereum) {
  const requiredChainIdDec = Number(import.meta.env.VITE_CHAIN_ID)
  const requiredChainIdHex = `0x${requiredChainIdDec.toString(16)}`
  const chainName = import.meta.env.VITE_CHAIN_NAME || 'MST Testnet'

  const currentChainId = await ethereum.request({ method: 'eth_chainId' })
  if (String(currentChainId).toLowerCase() !== String(requiredChainIdHex).toLowerCase()) {
    throw new Error(`Please switch your wallet network to ${chainName} and try again.`)
  } 
}

function getReadProvider() {
  const rpc = (import.meta.env.VITE_RPC_URL || '').trim()
  const chainIdRaw = import.meta.env.VITE_CHAIN_ID
  const chainId =
    chainIdRaw === undefined || chainIdRaw === null || String(chainIdRaw).trim() === ''
      ? undefined
      : Number(chainIdRaw)
  if (!rpc) return null
  return chainId !== undefined && Number.isFinite(chainId)
    ? new ethers.JsonRpcProvider(rpc, chainId)
    : new ethers.JsonRpcProvider(rpc)
}

async function getFeeOverrides(provider) {
  try {
    const fee = await provider.getFeeData()
    // Prefer EIP-1559 when supported by the chain
    if (fee?.maxFeePerGas && fee?.maxPriorityFeePerGas) {
      return {
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
      }
    }
    if (fee?.gasPrice) return { gasPrice: fee.gasPrice }
    return {}
  } catch {
    return {}
  }
}

export default function App() {
  const explorerBase = useMemo(
    () => normalizeExplorerBase(import.meta.env.VITE_BLOCK_EXPLORER),
    [],
  )
  // Dev: leave VITE_IPFS_BACKEND unset → same-origin `/api` (Vite proxies to Express on PORT).
  // Prod: set VITE_IPFS_BACKEND to your public API origin (no trailing slash).
  const ipfsApiBase = (import.meta.env.VITE_IPFS_BACKEND || '').trim().replace(/\/$/, '')
  const apiUrl = (path) => {
    const p = String(path || '')
    if (!p) return ''
    if (!ipfsApiBase) return p
    if (p.startsWith('http://') || p.startsWith('https://')) return p
    return `${ipfsApiBase}${p}`
  }
  const pinataGateway = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs/'
  const mintGasLimit = (() => {
    const raw = String(import.meta.env.VITE_MINT_GAS_LIMIT || '550000').replace(/\s+/g, '') || '550000'
    try {
      const n = BigInt(raw)
      return n > 0n ? n : 550000n
    } catch {
      return 550000n
    }
  })()

  const templateImgRef = useRef(null)
  const canvasRef = useRef(null)

  const [selectedCollege, setSelectedCollege] = useState('dypcoe')
  const college = useMemo(() => getCollege(selectedCollege), [selectedCollege])
  const contractAddress = useMemo(() => {
    const base = (import.meta.env.VITE_CONTRACT_ADDRESS || '').trim()
    const byCollegeKey = `VITE_CONTRACT_ADDRESS_${String(selectedCollege || '').toUpperCase()}`
    const override = (import.meta.env[byCollegeKey] || '').trim()
    return override || base
  }, [selectedCollege])

  const [wallet, setWallet] = useState({
    status: 'idle', // idle | connecting | connected | error
    address: '',
    chainId: '',
    error: '',
  })

  const [form, setForm] = useState({
    studentName: '',
    branch: '',
    college: 'dypcoe',
  })

  const [mintState, setMintState] = useState({
    status: 'idle', // idle | signing | pending | confirmed | error
    txHash: '',
    tokenId: '',
    tokenUri: '',
    tokenMeta: null,
    imageIpfs: '',
    imageGateway: '',
    metadataGateway: '',
    error: '',
  })

  const [stats, setStats] = useState({ totalSupply: '', hasMinted: '', maxSupply: '' })
  const [templateReady, setTemplateReady] = useState(false)
  const [mintPhase, setMintPhase] = useState('') // '' | ipfs-image | ipfs-meta | wallet

  const canUseMetaMask = typeof window !== 'undefined' && !!window.ethereum

  const links = useMemo(() => {
    const base = explorerBase
    const tx = mintState.txHash ? `${base}tx/${mintState.txHash}` : ''
    const contract = contractAddress ? `${base}address/${contractAddress}` : ''
    const token =
      mintState.tokenId && contractAddress
        ? `${base}token/${contractAddress}?a=${mintState.tokenId}`
        : ''
    return { tx, contract, token }
  }, [explorerBase, mintState.txHash, mintState.tokenId, contractAddress])

  async function refreshStats(addressOverride, eventIdOverride) {
    if (!contractAddress) return
    try {
      const eventId = BigInt(eventIdOverride ?? college?.eventId ?? 0)
      if (!eventId) return
      const provider = getReadProvider()
      if (!provider) return

      const code = await provider.getCode(contractAddress)
      if (!code || code === '0x') {
        setStats({ totalSupply: '', hasMinted: '', maxSupply: '' })
        return
      }

      const c = new ethers.Contract(contractAddress, CONTRACT_ABI, provider)
      const addr = addressOverride || wallet.address || ''
      const [supply, maxSupply, minted] = await Promise.all([
        c.totalSupplyForEvent(eventId),
        c.MAX_SUPPLY_PER_EVENT(),
        addr ? c.hasMinted(eventId, addr) : Promise.resolve(false),
      ])
      setStats({
        totalSupply: supply.toString(),
        maxSupply: maxSupply.toString(),
        hasMinted: addr ? (minted ? 'Yes' : 'No') : '',
      })
    } catch {
      // ignore (stats are optional)
    }
  }

  async function connectWallet() {
    setWallet((w) => ({ ...w, status: 'connecting', error: '' }))
    setMintState((m) => ({ ...m, error: '' }))

    try {
      if (!canUseMetaMask) {
        throw new Error('MetaMask not detected. Please install the MetaMask extension.')
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_requestAccounts', [])
      const network = await provider.getNetwork()

      const address = accounts?.[0] || ''
      setWallet({
        status: 'connected',
        address,
        chainId: network?.chainId?.toString?.() || '',
        error: '',
      })
      await refreshStats(address)
    } catch (err) {
      setWallet((w) => ({
        ...w,
        status: 'error',
        error: err?.message || 'Failed to connect wallet',
      }))
    }
  }

  const isFormValid =
    !!form.studentName.trim() &&
    !!form.branch.trim() &&
    !!form.college &&
    !!getCollege(form.college)

  async function mintCertificate(e) {
    e?.preventDefault?.()
    setMintPhase('')
    setMintState({
      status: 'signing',
      txHash: '',
      tokenId: '',
      tokenUri: '',
      tokenMeta: null,
      imageIpfs: '',
      imageGateway: '',
      metadataGateway: '',
      error: '',
    })

    try {
      if (!canUseMetaMask) throw new Error('MetaMask not detected.')
      if (!contractAddress) throw new Error('Missing VITE_CONTRACT_ADDRESS in .env')
      if (!form.studentName.trim()) throw new Error('Please enter your name.')
      if (!form.branch.trim()) throw new Error('Please enter your branch.')
      if (!form.college || !getCollege(form.college)) throw new Error('Please select your college.')

      await requireMstNetwork(window.ethereum)

      const selected = getCollege(form.college)
      const eventId = BigInt(selected?.eventId ?? 0)
      if (!eventId) throw new Error('Invalid college selection.')

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const userAddr = await signer.getAddress()

      const readProvider = getReadProvider()
      if (!readProvider) throw new Error('Missing VITE_RPC_URL in .env')
      const code = await readProvider.getCode(contractAddress)
      if (!code || code === '0x') {
        throw new Error(
          'No contract deployed at VITE_CONTRACT_ADDRESS on MST Testnet RPC. Deploy the updated contract to MST Testnet and update VITE_CONTRACT_ADDRESS.',
        )
      }
      const cRead = new ethers.Contract(contractAddress, CONTRACT_ABI, readProvider)

      let already, supply, maxSupply
      try {
        ;[already, supply, maxSupply] = await Promise.all([
          cRead.hasMinted(eventId, userAddr),
          cRead.totalSupplyForEvent(eventId),
          cRead.MAX_SUPPLY_PER_EVENT(),
        ])
      } catch {
        // Most common cause: VITE_CONTRACT_ADDRESS still points to an older deployment (ABI mismatch).
        const chainName = import.meta.env.VITE_CHAIN_NAME || 'MST Testnet'
        throw new Error(
          `Contract read failed on ${chainName}. Your VITE_CONTRACT_ADDRESS likely points to an older contract deployment. ` +
            `Redeploy the updated contract (with per-college eventId support) and update VITE_CONTRACT_ADDRESS, then reload.`,
        )
      }
      if (already) {
        throw new Error(
          'This wallet already minted a certificate for this college. Each address can mint only once per event. Use a different wallet to mint again.',
        )
      }
      if (supply >= maxSupply) {
        throw new Error('All certificate NFTs for this college have been minted (supply cap reached).')
      }

      // 1) Render certificate image (bold name in gold), then IPFS — only after on-chain check
      const templateImg = templateImgRef.current
      const canvas = canvasRef.current
      if (!templateImg || !canvas) throw new Error('Certificate template not ready.')
      await new Promise((resolve, reject) => {
        if (templateImg.complete && templateImg.naturalWidth > 0) {
          resolve()
          return
        }
        const onLoad = () => {
          templateImg.removeEventListener('load', onLoad)
          templateImg.removeEventListener('error', onErr)
          resolve()
        }
        const onErr = () => {
          templateImg.removeEventListener('load', onLoad)
          templateImg.removeEventListener('error', onErr)
          reject(new Error('Certificate template image failed to load.'))
        }
        templateImg.addEventListener('load', onLoad)
        templateImg.addEventListener('error', onErr)
      })
      if (!templateImg.naturalWidth) throw new Error('Certificate template image not loaded.')

      drawCertificate({
        canvas,
        templateImg,
        studentName: form.studentName.trim(),
        layout: selected?.layout,
      })

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95))
      if (!blob) throw new Error('Failed to generate certificate image.')

      setMintPhase('ipfs-image')
      const imgForm = new FormData()
      imgForm.append('file', blob, 'certificate.png')
      const imgRes = await fetch(apiUrl('/api/ipfs/certificate'), {
        method: 'POST',
        body: imgForm,
      })
      if (!imgRes.ok) {
        const t = await imgRes.text().catch(() => '')
        throw new Error(`IPFS image upload failed: ${t || imgRes.status}`)
      }
      const imgJson = await imgRes.json()

      // 2) Build metadata and upload JSON to IPFS
      const metaBody = {
        name: `${selected.label} Workshop Certificate #${(stats.totalSupply ? Number(stats.totalSupply) + 1 : '') || ''}`.trim(),
        description:
          'Official on-chain participation certificate issued by Masterstroke Academy for the MST Blockchain Workshop.',
        image: imgJson.ipfsUri,
        attributes: [
          { trait_type: 'Event ID', value: String(selected.eventId) },
          { trait_type: 'Event Name', value: 'MST Blockchain Workshop' },
          { trait_type: 'College', value: selected.label },
          { trait_type: 'Student Name', value: form.studentName.trim() },
          { trait_type: 'Branch', value: form.branch.trim() },
          { trait_type: 'Issuing Authority', value: 'Masterstroke Academy' },
        ],
      }

      setMintPhase('ipfs-meta')
      const metaRes = await fetch(apiUrl('/api/ipfs/metadata'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaBody),
      })
      if (!metaRes.ok) {
        const t = await metaRes.text().catch(() => '')
        throw new Error(`IPFS metadata upload failed: ${t || metaRes.status}`)
      }
      const metaJson = await metaRes.json()

      setMintPhase('wallet')
      let prepRes
      try {
        prepRes = await fetch(apiUrl('/api/chain/prepare-mint'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractAddress,
            from: userAddr,
            eventId: selected.eventId,
            studentName: form.studentName.trim(),
            branch: form.branch.trim(),
            tokenURI: metaJson.ipfsUri,
          }),
        })
      } catch {
        throw new Error(
          'Cannot reach the backend that simulates your mint. Run `npm run dev:server` in another terminal (same folder) so /api/chain/prepare-mint can use VITE_RPC_URL.',
        )
      }
      const prep = await prepRes.json().catch(() => ({}))
      if (!prepRes.ok || prep.ok === false) {
        throw new Error(prep.reason || prep.error || `Mint pre-check failed (${prepRes.status})`)
      }
      const serverGas = BigInt(String(prep.gasLimit || '0'))
      const gasLimit =
        serverGas > 0n ? (serverGas > mintGasLimit ? serverGas : mintGasLimit) : mintGasLimit

      // Send tx with explicit gas settings to avoid MetaMask's flaky estimateGas / fee logic on MST RPCs.
      const c = new ethers.Contract(contractAddress, CONTRACT_ABI, signer)
      // Force full signature to avoid accidentally encoding an older cached selector.
      const data = c.interface.encodeFunctionData('mintWorkshopCertificate(uint256,string,string,string)', [
        eventId,
        form.studentName.trim(),
        form.branch.trim(),
        metaJson.ipfsUri,
      ])
      const selector = String(data || '').slice(0, 10)
      console.log('Mint calldata selector:', selector, 'eventId:', eventId.toString())
      if (selector !== '0xb59c55a9') {
        throw new Error(
          `App bug/cached build: mint selector is ${selector} but expected 0xb59c55a9. Hard refresh the page and restart dev server.`,
        )
      }
      const feeOverrides = await getFeeOverrides(readProvider)

      // Extra safety: simulate the exact transaction on the canonical RPC so we get a real revert (if any)
      try {
        await readProvider.call({
          from: userAddr,
          to: contractAddress,
          data,
          gasLimit,
          ...feeOverrides,
        })
      } catch (simErr) {
        // Log full details for debugging
        console.error('Mint simulation failed:', simErr)
        throw simErr
      }

      const tx = await signer.sendTransaction({
        to: contractAddress,
        data,
        gasLimit,
        ...feeOverrides,
      })

      setMintState((m) => ({ ...m, status: 'pending', txHash: tx.hash }))
      const receipt = await tx.wait()
      if (receipt && Number(receipt.status) === 0) {
        const h = receipt.hash || tx.hash
        throw new Error(
          `Transaction was mined but reverted (status=0). Open MSTScan for the tx hash: ${h}. If you just saw a clear error from the pre-check, the chain state may have changed—retry once.`,
        )
      }

      let tokenId = ''
      try {
        const parsed = receipt.logs
          .map((log) => {
            try {
              return c.interface.parseLog(log)
            } catch {
              return null
            }
          })
          .find((x) => x?.name === 'CertificateMinted')
        tokenId = parsed?.args?.tokenId?.toString?.() || ''
      } catch {
        // ignore; we'll still show tx link
      }

      let tokenUri = ''
      let tokenMeta = null
      if (tokenId) {
        try {
          tokenUri = await c.tokenURI(tokenId)
          // Try to fetch off-chain metadata for preview
          const gatewayUrl = ipfsToGateway(tokenUri, pinataGateway)
          if (gatewayUrl) {
            const r = await fetch(gatewayUrl)
            if (r.ok) tokenMeta = await r.json()
          }
        } catch {
          tokenUri = ''
          tokenMeta = null
        }
      }

      setMintState((m) => ({
        ...m,
        status: 'confirmed',
        tokenId,
        tokenUri,
        tokenMeta,
        imageIpfs: imgJson.ipfsUri,
        imageGateway: imgJson.gatewayUrl,
        metadataGateway: metaJson.gatewayUrl,
        error: '',
      }))
      await refreshStats(userAddr, selected.eventId)
      setMintPhase('')
    } catch (err) {
      console.error('Mint failed (full error):', err)
      setMintPhase('')
      setMintState((m) => ({
        ...m,
        status: 'error',
        error: formatMintRpcError(err),
      }))
    }
  }

  useEffect(() => {
    if (!canUseMetaMask) return

    const ethereum = window.ethereum
    const onAccountsChanged = (accounts) => {
      const address = accounts?.[0] || ''
      setWallet((w) => ({
        ...w,
        status: address ? 'connected' : 'idle',
        address,
        error: '',
      }))
      if (address) refreshStats(address)
    }
    const onChainChanged = () => window.location.reload()

    ethereum.on?.('accountsChanged', onAccountsChanged)
    ethereum.on?.('chainChanged', onChainChanged)

    return () => {
      ethereum.removeListener?.('accountsChanged', onAccountsChanged)
      ethereum.removeListener?.('chainChanged', onChainChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setForm((f) => ({ ...f, college: selectedCollege }))
    setTemplateReady(false)
    if (wallet.status === 'connected' && wallet.address) {
      refreshStats(wallet.address, college?.eventId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollege])

  return (
    <div className="page">
      <div className="shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">MST Blockchain Workshop</div>
            <h1 className="title">Certificate NFT Minting</h1>
            <p className="subtitle">
              Mint your on-chain participation certificate on MST Testnet.
            </p>
          </div>

          <div className="walletCard">
            <div className="walletRow">
              <div className="walletLabel">Wallet</div>
              {wallet.status === 'connected' ? (
                <div className="walletValue" title={wallet.address}>
                  {shortAddr(wallet.address)}
                </div>
              ) : (
                <div className="walletValue muted">Not connected</div>
              )}
            </div>

            <div className="walletActions">
              <button
                className="btn secondary"
                onClick={connectWallet}
                disabled={!canUseMetaMask || wallet.status === 'connecting'}
              >
                {wallet.status === 'connecting'
                  ? 'Connecting…'
                  : wallet.status === 'connected'
                    ? 'Reconnect'
                    : 'Connect Wallet'}
              </button>
            </div>

            {wallet.error ? <div className="alert error">{wallet.error}</div> : null}
          </div>
        </header>

        <main className="grid">
          <section className="card">
            <h2 className="cardTitle">Your details</h2>
            <p className="cardHint">These values go on-chain in your NFT metadata.</p>

            <form className="form" onSubmit={mintCertificate}>
              <label className="field">
                <div className="fieldLabel">College</div>
                <select
                  className="input select"
                  value={selectedCollege}
                  onChange={(e) => setSelectedCollege(e.target.value)}
                  required
                >
                  {Object.entries(COLLEGES).map(([key, c]) => (
                    <option key={key} value={key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <div className="fieldLabel">Name</div>
                <input
                  className="input"
                  value={form.studentName}
                  onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
                  placeholder="Enter your full name"
                  autoComplete="name"
                  required
                />
              </label>

              <label className="field">
                <div className="fieldLabel">Branch</div>
                <input
                  className="input"
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  placeholder="e.g. CSE / IT / E&TC"
                  required
                />
              </label>

              <div className="formActions">
                <button
                  className="btn primary"
                  type="submit"
                  disabled={
                    !canUseMetaMask ||
                    !contractAddress ||
                    wallet.status !== 'connected' ||
                    stats.hasMinted === 'Yes' ||
                    !templateReady ||
                    !isFormValid ||
                    mintState.status === 'signing' ||
                    mintState.status === 'pending'
                  }
                >
                  {mintState.status === 'signing'
                    ? mintPhase === 'ipfs-image'
                      ? 'Uploading certificate to IPFS…'
                      : mintPhase === 'ipfs-meta'
                        ? 'Uploading metadata to IPFS…'
                        : mintPhase === 'wallet'
                          ? 'Confirm in MetaMask…'
                          : 'Preparing…'
                    : mintState.status === 'pending'
                      ? 'Minting…'
                      : stats.hasMinted === 'Yes'
                        ? 'Already minted'
                        : 'Mint Certificate'}
                </button>
              </div>

              {stats.hasMinted === 'Yes' ? (
                <div className="alert warn">
                  This wallet already holds a certificate NFT for this college. The contract allows one mint per address
                  per event — connect a different wallet to mint again.
                </div>
              ) : null}

              {mintState.status === 'confirmed' ? (
                <div className="alert success">
                  Minted successfully{mintState.tokenId ? ` — Token #${mintState.tokenId}` : ''}.
                </div>
              ) : null}

              {mintState.error ? <div className="alert error">{mintState.error}</div> : null}

              {!canUseMetaMask ? (
                <div className="alert warn">
                  MetaMask extension not detected. Install MetaMask and refresh.
                </div>
              ) : null}
              {!contractAddress ? (
                <div className="alert warn">
                  Missing <code>VITE_CONTRACT_ADDRESS</code> in <code>.env</code>.
                </div>
              ) : null}
            </form>
          </section>

          <section className="card">
            <h2 className="cardTitle">Mint result</h2>
            <p className="cardHint">
              After minting, you’ll see your token info and MSTScan links here.
            </p>

            <div className="result">
              <div className="kv">
                <div className="k">Status</div>
                <div className="v">
                  {mintState.status === 'idle'
                    ? 'Waiting'
                    : mintState.status === 'signing'
                      ? 'Awaiting signature'
                      : mintState.status === 'pending'
                        ? 'Transaction pending'
                        : mintState.status === 'confirmed'
                          ? 'Minted'
                          : 'Error'}
                </div>
              </div>

              <div className="kv">
                <div className="k">Token ID</div>
                <div className="v">
                  {mintState.tokenId ? `#${mintState.tokenId}` : <span className="muted">—</span>}
                </div>
              </div>

              <div className="kv">
                <div className="k">MSTScan</div>
                <div className="v vLinks">
                  <a
                    className={`linkBtn ${links.tx ? '' : 'disabled'}`}
                    href={links.tx || undefined}
                    target={links.tx ? '_blank' : undefined}
                    rel={links.tx ? 'noreferrer' : undefined}
                    aria-disabled={!links.tx}
                    onClick={(e) => {
                      if (!links.tx) e.preventDefault()
                    }}
                  >
                    View Tx on MSTScan
                  </a>
                  <a
                    className={`linkBtn ${links.token ? '' : 'disabled'}`}
                    href={links.token || undefined}
                    target={links.token ? '_blank' : undefined}
                    rel={links.token ? 'noreferrer' : undefined}
                    aria-disabled={!links.token}
                    onClick={(e) => {
                      if (!links.token) e.preventDefault()
                    }}
                  >
                    View NFT on MSTScan
                  </a>
                </div>
              </div>

              {mintState.status === 'confirmed' ? (
                <>
                  <div className="certWrap">
                    <div className="certHeader">
                      <div>
                        <div className="certEyebrow">Certificate NFT</div>
                        <div className="certName">
                          {safeText(mintState.tokenMeta?.name) ||
                            (mintState.tokenId ? `${college?.label || 'Workshop'} Certificate #${mintState.tokenId}` : '—')}
                        </div>
                        <div className="certDesc">
                          {safeText(mintState.tokenMeta?.description) ||
                            'Official on-chain participation certificate issued by Masterstroke Academy for the MST Blockchain Workshop.'}
                        </div>
                      </div>
                      {mintState.txHash ? (
                        <div className="txPill" title={mintState.txHash}>
                          Tx: {shortAddr(mintState.txHash)}
                        </div>
                      ) : null}
                    </div>

                    <div className="certPreview">
                      {safeText(mintState.tokenMeta?.image) ? (
                        <img
                          className="certImg"
                          src={ipfsToGateway(mintState.tokenMeta.image, pinataGateway)}
                          alt={safeText(mintState.tokenMeta?.name) || 'Certificate NFT'}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="kv">
                    <div className="k">IPFS</div>
                    <div className="v vLinks">
                      <a
                        className={`linkBtn ${mintState.metadataGateway ? '' : 'disabled'}`}
                        href={mintState.metadataGateway || undefined}
                        target={mintState.metadataGateway ? '_blank' : undefined}
                        rel={mintState.metadataGateway ? 'noreferrer' : undefined}
                        aria-disabled={!mintState.metadataGateway}
                        onClick={(e) => {
                          if (!mintState.metadataGateway) e.preventDefault()
                        }}
                      >
                        View Metadata
                      </a>
                      <a
                        className={`linkBtn ${mintState.imageGateway ? '' : 'disabled'}`}
                        href={mintState.imageGateway || undefined}
                        target={mintState.imageGateway ? '_blank' : undefined}
                        rel={mintState.imageGateway ? 'noreferrer' : undefined}
                        aria-disabled={!mintState.imageGateway}
                        onClick={(e) => {
                          if (!mintState.imageGateway) e.preventDefault()
                        }}
                      >
                        View Certificate Image
                      </a>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </main>

        {/* Hidden image + hidden canvas (used during mint) */}
        <img
          ref={templateImgRef}
          src={college?.template || ''}
          alt=""
          className="hiddenAsset"
          onLoad={() => {
            setTemplateReady(true)
          }}
        />
        <canvas ref={canvasRef} className="hiddenAsset" />

        <footer className="footer">
          <div>
            Contract: <code>{contractAddress || '—'}</code>
          </div>
          <div>
            Explorer: <code>{explorerBase || '—'}</code>
          </div>
        </footer>
      </div>
    </div>
  )
}
