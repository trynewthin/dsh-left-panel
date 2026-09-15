import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const bundledDsh = '/Applications/DSH Desktop Beta.app/Contents/Resources/app/node_modules/@deepseek-ai/dsh/lib/bin.js'
const runtimeRoot = await mkdtemp(join(tmpdir(), 'dsh-left-panel-demo-'))
const profileName = 'left-panel-demo'

function dshCommand(args) {
  if (process.env.DSH_BIN) return { command: process.env.DSH_BIN, args }
  if (existsSync(bundledDsh)) return { command: process.execPath, args: [bundledDsh, ...args] }
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
function cleanup() {
  cleanupPromise ??= (async () => {
    server?.kill('SIGTERM')
    await rm(runtimeRoot, { recursive: true, force: true })
  })()
  return cleanupPromise
}

try {
  await runDsh(['--profile', profileName, '--from-default-profile', 'web', '--dump-config'], { quiet: true })
  await runDsh(['plugin', '--profile', profileName, 'add', '-w', repositoryRoot], { quiet: true })
  const atlas = await createRepository('atlas', ['feature/search', 'fix/layout'])
  const orbit = await createRepository('orbit', ['feature/auth'])
  const invocation = dshCommand(['--profile', profileName, '--no-open', '--host', '127.0.0.1', '--port', '0'])
  server = spawn(invocation.command, invocation.args, {
    env: { ...process.env, DSH_HOME: runtimeRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DSH startup timed out')), 20_000)
    const inspect = (chunk) => {
      const text = chunk.toString()
      const match = text.match(/https?:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)
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
