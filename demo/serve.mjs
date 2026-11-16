// Stable entry point for the seeded demo: boots demo/dsh.mjs on an internal
// port and serves a thin proxy on PORT that bounces unauthenticated visits to
// the current `/?token=...` URL, so the public URL never changes even though
// dsh rotates its token on every boot.

import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const publicPort = Number(process.env.PORT ?? 47010)
const internalPort = publicPort + 1
const upstreamAuthority = `127.0.0.1:${internalPort}`

const demo = spawn(process.execPath, [join(repositoryRoot, 'demo', 'dsh.mjs')], {
  env: { ...process.env, DEMO_PORT: String(internalPort) },
  stdio: ['ignore', 'pipe', 'inherit'],
})

const token = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('timed out waiting for the demo token')), 60_000)
  demo.stdout.on('data', (chunk) => {
    const match = chunk.toString().match(/\?token=([^\s]+)/)
    if (match !== null) {
      clearTimeout(timeout)
      resolve(match[1])
    }
  })
  demo.once('error', reject)
  demo.once('exit', (code) => reject(new Error(`demo exited during startup with ${code}`)))
})

console.log(`Demo token: ${token}`)

function authorize(res) {
  res.writeHead(302, { location: `/?token=${token}` })
  res.end()
}

const server = createServer((req, res) => {
  const hasToken = new URL(req.url, 'http://localhost').searchParams.has('token')
  if (!hasToken && !(req.headers.cookie ?? '').includes('dsh-auth-')) {
    authorize(res)
    return
  }
  const proxy = request(
    {
      host: '127.0.0.1',
      port: internalPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: upstreamAuthority,
        // Upstream compares Origin/Referer to its authority for CSRF checks
        // on mutating requests; rewrite them to match what it sees.
        ...(req.headers.origin !== undefined ? { origin: `http://${upstreamAuthority}` } : {}),
        ...(req.headers.referer !== undefined
          ? { referer: `http://${upstreamAuthority}${new URL(req.headers.referer).pathname}${new URL(req.headers.referer).search}` }
          : {}),
      },
    },
    (up) => {
      if (up.statusCode === 401 || up.statusCode === 403) {
        // Stale or rejected auth cookie: send the client through the token
        // URL so upstream issues a fresh cookie. fetch()/XHR follow the
        // redirect and pick up set-cookie on the way, so the next retry —
        // including the remote.mux WebSocket — carries valid auth.
        up.resume()
        authorize(res)
        return
      }
      res.writeHead(up.statusCode, up.headers)
      up.pipe(res)
    },
  )
  proxy.on('error', () => {
    res.writeHead(502)
    res.end()
  })
  req.pipe(proxy)
})

server.on('upgrade', (req, socket, head) => {
  const target = connect(internalPort, '127.0.0.1', () => {
    target.write(`${req.method} ${req.url} HTTP/1.1\r\n`)
    for (const [name, value] of Object.entries(req.headers)) {
      if (name === 'host') {
        target.write(`host: ${upstreamAuthority}\r\n`)
      } else if (name === 'origin') {
        target.write(`origin: http://${upstreamAuthority}\r\n`)
      } else {
        target.write(`${name}: ${value}\r\n`)
      }
    }
    target.write('\r\n')
    if (head.length > 0) target.write(head)
    socket.pipe(target).pipe(socket)
  })
  target.on('error', () => socket.destroy())
  socket.on('error', () => target.destroy())
})

server.listen(publicPort, '127.0.0.1', () => {
  console.log(`Stable demo URL on port ${publicPort} (dsh upstream on ${internalPort})`)
})
