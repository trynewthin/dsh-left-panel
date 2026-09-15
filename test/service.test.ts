/**
 * Drives the host service against a real temporary git repository through a
 * fake Workspace registry and a fake connection, covering the full
 * discover → register → retitle → remove → ignore → un-ignore cycle and the
 * RPC surface the browser half calls.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConnectionFetchRoute, ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'

import { runGit } from '../src/git.ts'
import { WorktreeSyncService } from '../src/service.ts'
import type { WorktreeSnapshot } from '../src/protocol.ts'

const GIT_IDENTITY = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false']

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runGit([...GIT_IDENTITY, ...args], cwd)
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

type Listener = (change: DomainChanged) => void

class FakeWorkspace {
  readonly createdAt = new Date().toISOString()
  updatedAt = this.createdAt
  readonly sessionIds: readonly string[] = []
  constructor(
    private readonly registry: FakeRegistry,
    readonly id: string,
    readonly path: string,
    public title: string,
  ) {}

  async setTitle(title: string): Promise<void> {
    this.title = title
    this.registry.emit({ domain: 'workspace', table: 'workspaces', key: this.id, operation: 'put', value: {} })
  }
}

class FakeRegistry {
  order: string[] = []
  readonly byId = new Map<string, FakeWorkspace>()
  readonly listeners = new Set<Listener>()
  private counter = 0

  emit(change: DomainChanged): void {
    for (const listener of this.listeners) listener(change)
  }

  async create(path: string, title?: string): Promise<FakeWorkspace> {
    const canonical = await realpath(path)
    const existing = await this.resolveByPath(canonical)
    if (existing !== undefined) return existing
    const id = `ws-${++this.counter}`
    const workspace = new FakeWorkspace(this, id, canonical, title ?? canonical.split('/').pop() ?? canonical)
    this.byId.set(id, workspace)
    this.order.unshift(id)
    this.emit({ domain: 'workspace', table: 'workspaces', key: id, operation: 'put', value: {} })
    return workspace
  }

  get(id: string): FakeWorkspace | undefined {
    return this.byId.get(id)
  }

  list(): FakeWorkspace[] {
    return this.order.flatMap((id) => {
      const workspace = this.byId.get(id)
      return workspace === undefined ? [] : [workspace]
    })
  }

  async delete(id: string): Promise<boolean> {
    if (!this.byId.delete(id)) return false
    this.order = this.order.filter(candidate => candidate !== id)
    this.emit({ domain: 'workspace', table: 'workspaces', key: id, operation: 'deleted' })
    return true
  }

  async insertBefore(id: string, beforeId?: string): Promise<readonly string[]> {
    this.order = this.order.filter(candidate => candidate !== id)
    const index = beforeId === undefined ? this.order.length : this.order.indexOf(beforeId)
    this.order.splice(index < 0 ? this.order.length : index, 0, id)
    return this.order
  }

  async resolveByPath(path: string): Promise<FakeWorkspace | undefined> {
    const canonical = await realpath(path)
    return this.list().find(workspace => workspace.path === canonical)
  }

  titles(): string[] {
    return this.list().map(workspace => workspace.title)
  }
}

interface Harness {
  readonly registry: FakeRegistry
  readonly service: WorktreeSyncService
  readonly rpc: (endpoint: string, payload?: unknown) => Promise<WorktreeSnapshot>
  /** Send one raw Request to a registered route, bypassing the envelope helper. */
  readonly raw: (path: string, init: RequestInit) => Promise<Response>
  readonly dispose: () => void
}

function createHarness(registry: FakeRegistry, stateFile: string): Harness {
  const disposers: Array<() => unknown> = []
  const routes = new Map<string, ConnectionFetchRoute>()
  const ctx = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    on: (name: string, listener: Listener) => {
      assert.equal(name, 'domain/changed')
      registry.listeners.add(listener)
      return () => registry.listeners.delete(listener)
    },
    effect: (execute: () => unknown) => {
      const disposer = execute()
      if (typeof disposer === 'function') disposers.push(disposer as () => unknown)
    },
    connection: {
      fetch: {
        register: (route: ConnectionFetchRoute) => {
          assert.equal(routes.has(route.path), false, `route ${route.path} registered once`)
          routes.set(route.path, route)
          return async () => { routes.delete(route.path) }
        },
      },
    },
    workspaceRegistry: registry,
  }
  const service = new WorktreeSyncService(ctx as unknown as ConstructorParameters<typeof WorktreeSyncService>[0], {
    stateFile,
    pollMs: 60_000,
    debounceMs: 5,
    removalGraceMs: 40,
  })
  const raw = async (path: string, init: RequestInit): Promise<Response> => {
    const route = routes.get(path)
    assert.ok(route, `route ${path} registered`)
    assert.deepEqual(route.methods, ['POST'])
    return route.fetch(new Request(`http://dsh.internal${path}`, init))
  }
  return {
    registry,
    service,
    raw,
    rpc: async (endpoint, payload = {}) => {
      const method = `left-panel/${endpoint}`
      const rpcId = `rpc-${Math.random().toString(16).slice(2)}`
      const response = await raw(`/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
      })
      assert.equal(response.status, 200)
      const envelope = await response.json() as { type: string; rpcId: string; result: ConnectionRpcResult<unknown> }
      assert.equal(envelope.type, 'server-response')
      assert.equal(envelope.rpcId, rpcId)
      if (!envelope.result.ok) throw new Error(`${envelope.result.error.code}: ${envelope.result.error.message}`)
      return envelope.result.value as WorktreeSnapshot
    },
    dispose: () => { for (const disposer of disposers) void disposer() },
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

test('worktree sync end to end against a real repository', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'left-panel-e2e-')))
  t.after(async () => { await rm(root, { recursive: true, force: true }) })
  const repo = join(root, 'repo')
  await git(root, 'init', '-q', '-b', 'main', repo)
  await git(repo, 'commit', '-q', '--allow-empty', '-m', 'init')
  const featPath = join(root, 'wt-feat')
  await git(repo, 'worktree', 'add', '-q', '-b', 'feat/x', featPath)

  const registry = new FakeRegistry()
  const main = await registry.create(repo, 'repo')
  const harness = createHarness(registry, join(root, 'state.json'))
  t.after(() => { harness.dispose() })
  await harness.service.start()
  await harness.service.syncNow()

  await t.test('discovers and registers the linked worktree with its branch as title', async () => {
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat, 'feat worktree registered')
    assert.equal(feat.title, 'feat/x')
    assert.deepEqual(registry.order, [main.id, feat.id], 'worktree placed right after its main workspace')
    const snapshot = harness.service.snapshot()
    assert.equal(snapshot.repos.length, 1)
    const [repoInfo] = snapshot.repos
    assert.ok(repoInfo)
    assert.equal(repoInfo.name, 'repo')
    assert.equal(repoInfo.auto, true)
    assert.deepEqual(repoInfo.worktrees.map(w => [w.title, w.main, w.workspaceId !== null]), [['main', true, true], ['feat/x', false, true]])
    assert.equal(snapshot.workspaceRepo[main.id], repoInfo.key)
    assert.equal(snapshot.workspaceRepo[feat.id], repoInfo.key)
  })

  await t.test('follows a branch switch while the plugin-assigned title is untouched', async () => {
    await git(featPath, 'checkout', '-q', '-b', 'feat/y')
    await harness.service.syncNow()
    assert.equal((await registry.resolveByPath(featPath))?.title, 'feat/y')
  })

  await t.test('leaves a user-renamed worktree Workspace alone', async () => {
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat)
    await feat.setTitle('My branch')
    await git(featPath, 'checkout', '-q', '-b', 'feat/z')
    await harness.service.syncNow()
    assert.equal((await registry.resolveByPath(featPath))?.title, 'My branch')
  })

  await t.test('a new worktree is registered and a removed one unregistered after the grace period', async () => {
    const twoPath = join(root, 'wt-two')
    await git(repo, 'worktree', 'add', '-q', '-b', 'two', twoPath)
    await harness.service.syncNow()
    const two = await registry.resolveByPath(twoPath)
    assert.ok(two, 'second worktree registered')
    assert.equal(two.title, 'two')

    await git(repo, 'worktree', 'remove', '--force', twoPath)
    await harness.service.syncNow()
    assert.ok(registry.get(two.id), 'still registered inside the grace period')
    await sleep(60)
    await harness.service.syncNow()
    assert.equal(registry.get(two.id), undefined, 'unregistered once the grace period elapsed')
    assert.ok(registry.get(main.id), 'main workspace untouched')
  })

  await t.test('a worktree Workspace the user deletes is ignored, not re-registered, and can be un-ignored', async () => {
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat)
    await registry.delete(feat.id)
    await sleep(20)
    await harness.service.syncNow()
    assert.equal(await registry.resolveByPath(featPath), undefined, 'not re-registered')
    let snapshot = harness.service.snapshot()
    const ghost = snapshot.repos[0]?.worktrees.find(w => w.path === featPath)
    assert.ok(ghost)
    assert.equal(ghost.ignored, true)
    assert.equal(ghost.workspaceId, null)

    snapshot = await harness.rpc('unignore', { path: featPath })
    const restored = await registry.resolveByPath(featPath)
    assert.ok(restored, 're-registered after un-ignore')
    assert.equal(snapshot.repos[0]?.worktrees.find(w => w.path === featPath)?.workspaceId, restored.id)
  })

  await t.test('ignore via RPC unregisters and stops automation; register brings it back', async () => {
    let snapshot = await harness.rpc('ignore', { path: featPath })
    assert.equal(await registry.resolveByPath(featPath), undefined)
    assert.equal(snapshot.repos[0]?.worktrees.find(w => w.path === featPath)?.ignored, true)
    snapshot = await harness.rpc('register', { path: featPath })
    assert.ok(await registry.resolveByPath(featPath))
    assert.equal(snapshot.repos[0]?.worktrees.find(w => w.path === featPath)?.ignored, false)
  })

  await t.test('automation off lists new worktrees without registering them', async () => {
    const repoKey = harness.service.snapshot().repos[0]?.key
    assert.ok(repoKey)
    await harness.rpc('setRepoAuto', { repoKey, auto: false })
    const threePath = join(root, 'wt-three')
    await git(repo, 'worktree', 'add', '-q', '-b', 'three', threePath)
    const snapshot = await harness.rpc('sync')
    assert.equal(await registry.resolveByPath(threePath), undefined)
    const three = snapshot.repos[0]?.worktrees.find(w => w.path === threePath)
    assert.ok(three)
    assert.equal(three.workspaceId, null)
    assert.equal(three.ignored, false)
    await harness.rpc('register', { path: threePath })
    assert.equal((await registry.resolveByPath(threePath))?.title, 'three')
  })

  await t.test('rejects paths outside the scanned worktrees and unknown endpoints', async () => {
    await assert.rejects(harness.rpc('register', { path: root }), /unknown-worktree/)
    await assert.rejects(harness.rpc('ignore', {}), /bad-request/)
    assert.equal(harness.service.snapshot().repos.length, 1)
  })

  await t.test('answers malformed transport requests in the Connection envelope conventions', async () => {
    const path = '/api/left-panel/list'
    assert.equal((await harness.raw(path, { method: 'POST', body: 'x' })).status, 415)
    assert.equal((await harness.raw(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400)
    const wrongMethod = await harness.raw(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'left-panel/sync', payload: {} }),
    })
    const envelope = await wrongMethod.json() as { rpcId: string; result: ConnectionRpcResult<unknown> }
    assert.equal(envelope.rpcId, 'r1')
    assert.equal(envelope.result.ok, false)
    if (!envelope.result.ok) assert.equal(envelope.result.error.code, 'gateway/bad-request')
  })

  await t.test('plain directories outside git are left alone', async () => {
    const plain = join(root, 'plain')
    await git(root, 'init', '-q', plain)
    await rm(join(plain, '.git'), { recursive: true, force: true })
    await registry.create(plain, 'plain')
    const snapshot = await harness.rpc('sync')
    assert.equal(snapshot.repos.length, 1)
    assert.ok(await registry.resolveByPath(plain))
  })
})
