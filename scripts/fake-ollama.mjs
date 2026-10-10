// A stand-in for Ollama on this Mac (localhost:11434), so Explain's whole flow can be
// tried in Linen without any provider: choose “Ollama on this Mac” in Explain's
// options, any model name, then Explain a passage. It answers every chat with a fixed
// explanation and logs only sizes, never the text it was sent.
//
//   node scripts/fake-ollama.mjs            (Ctrl-C to stop)
//   node scripts/fake-ollama.mjs --slow     (answers after 12 s: Linen's timeout state)
//   node scripts/fake-ollama.mjs --missing  (404: the model isn't installed)
import { createServer } from 'node:http'

const mode = process.argv[2] || ''
const answer = {
  status: 'ok',
  term: 'fake · 测试',
  meaning: '这是假 Ollama 的固定回答，用来在不连接任何服务的情况下试用 Explain。',
  qualifier: '',
  details: [{ label: 'Where this came from', text: 'scripts/fake-ollama.mjs, on this Mac.' }],
  missing: '',
}

createServer((req, res) => {
  let size = 0
  req.on('data', (c) => (size += c.length))
  req.on('end', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} (${size} bytes)`)
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.url !== '/api/chat') return send(404, { error: 'not found' })
    if (mode === '--missing') return send(404, { error: "model 'fake' not found" })
    const reply = () =>
      send(200, {
        model: 'fake',
        message: { role: 'assistant', content: JSON.stringify(answer) },
        done: true,
        done_reason: 'stop',
      })
    if (mode === '--slow') setTimeout(reply, 12_000)
    else reply()
  })
}).listen(11434, () => console.log('fake Ollama on localhost:11434'))
