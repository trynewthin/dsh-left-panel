import { existsSync } from 'node:fs'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const runtimeRoot = await mkdtemp(join(tmpdir(), 'dsh-left-panel-demo-'))
const profileName = 'left-panel-demo'

// Use Desktop's shipped launcher: plain Node cannot load its CLI from app.asar.
const desktopCli = ['/Applications', join(homedir(), 'Applications')]
  .map(root => join(root, 'DeepSeek Harness.app', 'Contents', 'Resources', 'runtime', 'cli', 'bin', 'dsh'))
  .find(launcher => existsSync(launcher))

function dshCommand(args) {
  if (process.env.DSH_BIN) return { command: process.env.DSH_BIN, args }
  if (desktopCli !== undefined) return { command: desktopCli, args }
  return { command: 'dsh', args }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.quiet ? 'ignore' : 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

async function runDsh(args, options = {}) {
  const invocation = dshCommand(args)
  await run(invocation.command, invocation.args, {
    env: { ...process.env, DSH_HOME: runtimeRoot },
    ...options,
  })
}

async function git(args) {
  await run('git', args, { quiet: true })
}

async function createRepository(name, branches) {
  const mainPath = join(runtimeRoot, 'fixtures', name)
  await git(['init', '-q', '-b', 'main', mainPath])
  await git(['-C', mainPath, '-c', 'user.email=demo@example.invalid', '-c', 'user.name=Demo User', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'demo'])
  for (const branch of branches) {
    const worktreePath = join(runtimeRoot, 'fixtures', `${name}-${branch.replaceAll('/', '-')}`)
    await git(['-C', mainPath, 'worktree', 'add', '-q', '-b', branch, worktreePath])
  }
  return realpath(mainPath)
}

// A mock OpenAI-compatible endpoint so demo sessions actually run (and the
// left panel's status indicators have something to show): every chat request
// gets a ~1k-line reply streamed over a few seconds.
const mockModelId = 'mock-1k'
const mockReply = Array.from({ length: 40 }, (_, index) =>
  `Line ${index + 1}: this is a fixed-length mock response for the left-panel demo.`,
).join(' ')

function mockCompletion(stream) {
  if (!stream) {
    return JSON.stringify({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: mockModelId,
      choices: [{ index: 0, message: { role: 'assistant', content: mockReply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 400, total_tokens: 500 },
    })
  }
  const chunk = (delta, finishReason = null) => `data: ${JSON.stringify({
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: mockModelId,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`
  return chunk
}

function startMockLlm(port) {
  const words = mockReply.split(' ')
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.endsWith('/models') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: mockModelId, object: 'model', created: 0, owned_by: 'mock' }] }))
      return
    }
    if (url.pathname.endsWith('/chat/completions') && req.method === 'POST') {
      const chunks = []
      req.on('data', (part) => chunks.push(part))
      req.on('end', async () => {
        let parsed = {}
        try { parsed = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { /* keep default */ }
        if (!parsed.stream) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(mockCompletion(false))
          return
        }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        const chunk = mockCompletion(true)
        res.write(chunk({ role: 'assistant' }))
        for (let index = 0; index < words.length; index += 8) {
          res.write(chunk({ content: words.slice(index, index + 8).join(' ') + ' ' }))
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        res.write(chunk({}, 'stop'))
        res.end('data: [DONE]\n\n')
      })
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'not found', type: 'invalid_request_error' } }))
  })
  server.unref()
  return new Promise((resolve) => {
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => resolve(true))
  })
}

/** Point the demo profile at the mock endpoint so sessions can run without a real API key. */
async function configureMockProvider(port) {
  // The template file is the comments plus a bare `[]` patch list — replace
  // the empty list with the provider entries (appending would split the
  // document into two top-level values).
  const patchFile = join(runtimeRoot, 'profiles', profileName, 'cordis.patch.yml')
  const template = await readFile(patchFile, 'utf8')
  const entries = `- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      mock:
        displayName: Mock LLM
        apiKeyEnv: MOCK_API_KEY
        api: openai-completions
        baseURL: http://127.0.0.1:${port}/v1
        models:
          - id: ${mockModelId}
            name: ${mockModelId}
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: mock
    model: ${mockModelId}
`
  const patched = template.replace(/\[\]\s*$/, entries)
  if (patched === template) throw new Error('unexpected cordis.patch.yml layout')
  await writeFile(patchFile, patched)
}

async function rpc(baseUrl, cookie, route, method, payload) {
  const response = await fetch(new URL(`/api/${route}`, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: `demo-${Date.now()}-${Math.random()}`, method, payload }),
  })
  const envelope = await response.json()
  if (!envelope.result?.ok) throw new Error(`${envelope.result?.error?.code ?? 'rpc/error'}: ${envelope.result?.error?.message ?? 'unknown error'}`)
  return envelope.result.value
}

async function seed(baseUrl, paths) {
  const auth = await fetch(baseUrl, { redirect: 'manual' })
  const setCookie = auth.headers.get('set-cookie')
  if (!setCookie) throw new Error('DSH did not issue a browser cookie')
  const cookie = setCookie.split(';', 1)[0]
  for (const path of paths) {
    await rpc(baseUrl, cookie, 'workspace/create', 'workspace/create', { args: { request: { path } } })
  }
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const snapshot = await rpc(baseUrl, cookie, 'left-panel/list', 'left-panel/list', {})
    const worktrees = snapshot.repos.flatMap(repo => repo.worktrees)
    if (snapshot.repos.length === paths.length && worktrees.length === 5 && worktrees.every(entry => entry.workspaceId !== null)) {
      for (const repo of snapshot.repos) {
        const main = repo.worktrees.find(entry => entry.main)
        if (main?.workspaceId) {
          await rpc(baseUrl, cookie, 'left-panel/setWorkspaceTitle', 'left-panel/setWorkspaceTitle', {
            workspaceId: main.workspaceId,
            title: 'main',
          })
        }
      }
      return
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('worktree synchronization timed out')
}

let server
let cleanupPromise

/** Stop the demo server and wait for it to exit, so the runtime directory is not removed under a live host. */
function stopServer() {
  if (server === undefined || server.exitCode !== null || server.signalCode !== null) return Promise.resolve()
  const exited = new Promise(resolve => server.once('exit', resolve))
  server.kill('SIGTERM')
  const force = setTimeout(() => server.kill('SIGKILL'), 5_000)
  force.unref()
  return exited.finally(() => clearTimeout(force))
}

function cleanup() {
  cleanupPromise ??= (async () => {
    await stopServer()
    await rm(runtimeRoot, { recursive: true, force: true })
  })()
  return cleanupPromise
}

try {
  await runDsh(['--profile', profileName, '--from-default-profile', 'web', '--dump-config'], { quiet: true })
  await runDsh(['plugin', '--profile', profileName, 'add', '-w', repositoryRoot], { quiet: true })
  const mockPort = Number(process.env.DEMO_MOCK_PORT ?? '9701')
  if (!(await startMockLlm(mockPort))) {
    console.warn(`mock LLM port ${mockPort} already in use; reusing the existing listener`)
  }
  await configureMockProvider(mockPort)
  const atlas = await createRepository('atlas', ['feature/search', 'fix/layout'])
  const orbit = await createRepository('orbit', ['feature/auth'])
  const invocation = dshCommand(['--profile', profileName, '--no-open', '--host', '127.0.0.1', '--port', process.env.DEMO_PORT ?? '0'])
  server = spawn(invocation.command, invocation.args, {
    env: { ...process.env, DSH_HOME: runtimeRoot, MOCK_API_KEY: 'mock-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DSH startup timed out')), 20_000)
    const inspect = (chunk) => {
      const text = chunk.toString()
      const match = text.match(/https?:\/\/[^\s\u001b]+\?token=[^\s\u001b]+/)
      if (!match) return
      clearTimeout(timeout)
      resolve(match[0])
    }
    server.stdout.on('data', inspect)
    server.stderr.on('data', inspect)
    server.once('error', reject)
    server.once('exit', code => reject(new Error(`DSH exited during startup with ${code}`)))
  })
  await seed(baseUrl, [atlas, orbit])
  console.log('\nReal isolated DSH demo is ready:')
  console.log(baseUrl)
  console.log(`Runtime data: ${runtimeRoot}`)
  console.log('Press Ctrl+C to stop and remove all demo data.\n')
  process.on('SIGINT', () => { cleanup().catch(() => undefined) })
  process.on('SIGTERM', () => { cleanup().catch(() => undefined) })
  await new Promise(resolve => server.once('exit', resolve))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await cleanup()
}
