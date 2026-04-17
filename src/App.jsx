import { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import './App.css'

const CONTRACT_ABI = [
  'function mintWorkshopCertificate(string studentName,string mobileNumber,string branch) external returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function hasMinted(address) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'event CertificateMinted(uint256 indexed tokenId,address indexed recipient,string studentName,string mobileNumber,string branch)',
]

function normalizeExplorerBase(url) {
  if (!url) return ''
  return url.endsWith('/') ? url : `${url}/`
}

function shortAddr(addr) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function parseDataUriJsonToken(tokenUri) {
  if (!tokenUri) return null
  const prefix = 'data:application/json;base64,'
  if (!tokenUri.startsWith(prefix)) return null
  try {
    const b64 = tokenUri.slice(prefix.length)
    const jsonStr = atob(b64)
    const json = JSON.parse(jsonStr)
    return json
  } catch {
    return null
  }
}

function safeText(v) {
  return typeof v === 'string' ? v : ''
}

async function ensureMstNetwork(ethereum) {
  const chainIdDec = Number(import.meta.env.VITE_CHAIN_ID)
  const chainIdHex = `0x${chainIdDec.toString(16)}`

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
    return
  } catch (err) {
    // 4902 = unknown chain
    if (err?.code !== 4902) throw err
  }

  const rpcUrl = import.meta.env.VITE_RPC_URL
  const chainName = import.meta.env.VITE_CHAIN_NAME || 'MST Testnet'
  const nativeName = import.meta.env.VITE_NATIVE_NAME || 'MST'
  const nativeSymbol = import.meta.env.VITE_NATIVE_SYMBOL || 'MST'
  const explorerBase = normalizeExplorerBase(import.meta.env.VITE_BLOCK_EXPLORER)

  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: chainIdHex,
        chainName,
        nativeCurrency: { name: nativeName, symbol: nativeSymbol, decimals: 18 },
        rpcUrls: [rpcUrl],
        blockExplorerUrls: explorerBase ? [explorerBase] : [],
      },
    ],
  })
}

export default function App() {
  const explorerBase = useMemo(
    () => normalizeExplorerBase(import.meta.env.VITE_BLOCK_EXPLORER),
    [],
  )
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS
  const chainName = import.meta.env.VITE_CHAIN_NAME || 'MST Testnet'

  const [wallet, setWallet] = useState({
    status: 'idle', // idle | connecting | connected | error
    address: '',
    chainId: '',
    error: '',
  })

  const [form, setForm] = useState({
    studentName: '',
    mobileNumber: '',
    branch: '',
  })

  const [mintState, setMintState] = useState({
    status: 'idle', // idle | signing | pending | confirmed | error
    txHash: '',
    tokenId: '',
    tokenUri: '',
    tokenMeta: null,
    error: '',
  })

  const [stats, setStats] = useState({ totalSupply: '', hasMinted: '' })

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

  async function refreshStats(addressOverride) {
    if (!canUseMetaMask || !contractAddress) return
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const c = new ethers.Contract(contractAddress, CONTRACT_ABI, provider)
      const [supply, addr] = await Promise.all([
        c.totalSupply(),
        addressOverride || provider.getSigner().then((s) => s.getAddress()),
      ])
      const minted = await c.hasMinted(addr)
      setStats({ totalSupply: supply.toString(), hasMinted: minted ? 'Yes' : 'No' })
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

      await ensureMstNetwork(window.ethereum)
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

  async function mintCertificate(e) {
    e?.preventDefault?.()
    setMintState({
      status: 'signing',
      txHash: '',
      tokenId: '',
      tokenUri: '',
      tokenMeta: null,
      error: '',
    })

    try {
      if (!canUseMetaMask) throw new Error('MetaMask not detected.')
      if (!contractAddress) throw new Error('Missing VITE_CONTRACT_ADDRESS in .env')
      if (!form.studentName.trim()) throw new Error('Please enter your name.')
      if (!form.mobileNumber.trim()) throw new Error('Please enter your mobile number.')
      if (!form.branch.trim()) throw new Error('Please enter your branch.')

      await ensureMstNetwork(window.ethereum)

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const c = new ethers.Contract(contractAddress, CONTRACT_ABI, signer)

      const tx = await c.mintWorkshopCertificate(
        form.studentName.trim(),
        form.mobileNumber.trim(),
        form.branch.trim(),
      )

      setMintState((m) => ({ ...m, status: 'pending', txHash: tx.hash }))
      const receipt = await tx.wait()

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
          tokenMeta = parseDataUriJsonToken(tokenUri)
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
        error: '',
      }))
      await refreshStats()
    } catch (err) {
      setMintState((m) => ({
        ...m,
        status: 'error',
        error: err?.shortMessage || err?.message || 'Mint failed',
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
                    : 'Connect MetaMask'}
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  try {
                    if (!canUseMetaMask) return
                    setWallet((w) => ({ ...w, error: '' }))
                    await ensureMstNetwork(window.ethereum)
                    const provider = new ethers.BrowserProvider(window.ethereum)
                    const network = await provider.getNetwork()
                    setWallet((w) => ({ ...w, chainId: network?.chainId?.toString?.() || '' }))
                  } catch (err) {
                    setWallet((w) => ({
                      ...w,
                      status: 'error',
                      error: err?.message || 'Failed to switch network',
                    }))
                  }
                }}
                disabled={!canUseMetaMask}
              >
                Switch to {chainName}
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
                <div className="fieldLabel">Name</div>
                <input
                  className="input"
                  value={form.studentName}
                  onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
                  placeholder="Enter your full name"
                  autoComplete="name"
                />
              </label>

              <label className="field">
                <div className="fieldLabel">Mobile number</div>
                <input
                  className="input"
                  value={form.mobileNumber}
                  onChange={(e) => setForm((f) => ({ ...f, mobileNumber: e.target.value }))}
                  placeholder="e.g. 98XXXXXXXX"
                  inputMode="numeric"
                />
              </label>

              <label className="field">
                <div className="fieldLabel">Branch</div>
                <input
                  className="input"
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  placeholder="e.g. CSE / IT / E&TC"
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
                    mintState.status === 'signing' ||
                    mintState.status === 'pending'
                  }
                >
                  {mintState.status === 'signing'
                    ? 'Confirm in MetaMask…'
                    : mintState.status === 'pending'
                      ? 'Minting…'
                      : 'Mint Certificate'}
                </button>
                <div className="miniInfo">
                  <div>
                    <div className="miniLabel">Supply</div>
                    <div className="miniValue">{stats.totalSupply || '—'} / 50</div>
                  </div>
                  <div>
                    <div className="miniLabel">Already minted</div>
                    <div className="miniValue">{stats.hasMinted || '—'}</div>
                  </div>
                </div>
              </div>

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

              <div className="certWrap">
                <div className="certHeader">
                  <div>
                    <div className="certEyebrow">Certificate NFT</div>
                    <div className="certName">
                      {safeText(mintState.tokenMeta?.name) ||
                        (mintState.tokenId ? `MIT Workshop Certificate #${mintState.tokenId}` : '—')}
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
                      src={mintState.tokenMeta.image}
                      alt={safeText(mintState.tokenMeta?.name) || 'Certificate NFT'}
                    />
                  ) : (
                    <div className="certEmpty">
                      Mint your certificate to preview it here.
                      <div className="certEmptyHint">
                        (After minting we render the on-chain <code>tokenURI</code> image.)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>

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
