import { createApp } from './app.js'

const app = createApp()

// Default 5190: Vite often grabs 5173–5178+ when those ports are busy; keep API off that range.
const port = Number(process.env.PORT || 5190)
app.listen(port, () => {
  console.log(`IPFS backend listening on http://localhost:${port}`)
})

