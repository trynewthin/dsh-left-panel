/**
 * Drives the host service against a real temporary git repository through a
 * fake Workspace registry and a fake connection, covering the full
 * discover → register → retitle → remove → ignore → un-ignore cycle, explicit
 * removal of ordinary/main/whole-repository registrations, and the RPC surface
 * the browser half calls.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConnectionFetchRoute, ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'

import { isDirectory, runGit } from '../src/git.ts'
import { WorktreeSyncService } from '../src/service.ts'
import { loadState } from '../src/state.ts'
import type { BranchOptions, WorktreeSnapshot } from '../src/protocol.ts'

const GIT_IDENTITY = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false']

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runGit([...GIT_IDENTITY, ...args], cwd)
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

type Listener = (change: DomainChanged) => void

/** One stored session as the persistence stub reports it. */
interface StoredSession {
  readonly id: string
  readonly cwd: string
}

class FakeWorkspace {
  readonly createdAt = new Date().toISOString()
  updatedAt = this.createdAt
  private readonly ids: string[] = []
  constructor(
    private readonly registry: FakeRegistry,
    readonly id: string,
    readonly path: string,
    public title: string,
  ) {}

  /** Mirrors the real membership rule: a session attaches only when its canonical cwd is this directory. */
  get sessionIds(): readonly string[] {
    const accounted = new Set(this.ids)
    return this.registry.sessions
      .filter(session => accounted.has(session.id) && session.cwd === this.path)
      .map(session => session.id)
  }

  async attachSession(sessionId: string): Promise<void> {
    const session = this.registry.sessions.find(candidate => candidate.id === sessionId)
    if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
    if (session.cwd !== this.path) {
      throw new Error(`session "${sessionId}" its cwd resolves to '${session.cwd}', not '${this.path}'`)
    }
    if (!this.ids.includes(sessionId)) this.ids.push(sessionId)
  }

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

  constructor(readonly sessions: StoredSession[]) {}

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
  /** Every route path the service registered. */
  readonly routePaths: () => string[]
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
    sessionPersistence: {
      // Header shape only: the service reads id + cwd.
      list: async () => registry.sessions.map(session => ({ header: { id: session.id, cwd: session.cwd }, revision: 'rev' })),
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
    routePaths: () => [...routes.keys()],
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
  const threePath = join(root, 'wt-three')
  await git(repo, 'worktree', 'add', '-q', '-b', 'feat/x', featPath)

  const registry = new FakeRegistry([
    // A session that already lived in the linked worktree before its Workspace
    // existed: it sat under Ungrouped and must be adopted on registration.
    { id: 'session-orphan', cwd: await realpath(featPath) },
    // A session created by naming the main worktree directory directly, while
    // that Workspace was already registered: it never entered the ledger and
    // must be adopted by the self-healing pass.
    { id: 'session-cwd-only', cwd: await realpath(repo) },
  ])
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
    assert.deepEqual(repoInfo.worktrees.map(w => [w.title, w.main, w.workspaceId !== null]), [['main', true, true], ['feat/x', false, true]])
    assert.equal(snapshot.workspaceRepo[main.id], repoInfo.key)
    assert.equal(snapshot.workspaceRepo[feat.id], repoInfo.key)
  })

  await t.test('adopts a session that already lived in the worktree directory', async () => {
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat)
    assert.deepEqual(feat.sessionIds, ['session-orphan'])
    // A session from another directory is never adopted, even if offered.
    await assert.rejects(feat.attachSession('session-elsewhere'))
  })

  await t.test('adopts a session that named an already-registered worktree directory', async () => {
    assert.deepEqual(main.sessionIds, ['session-cwd-only'])
  })

  await t.test('keeps the display name on a branch switch (names are decoupled)', async () => {
    await git(featPath, 'checkout', '-q', '-b', 'feat/y')
    await harness.service.syncNow()
    assert.equal((await registry.resolveByPath(featPath))?.title, 'feat/x')
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

  await t.test('deletes only the workspace record into a durable tombstone and restores its sessions', async () => {
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat)
    const removed = await harness.rpc('deleteWorkspace', { workspaceId: feat.id })
    assert.equal(await realpath(featPath), featPath, 'working directory retained')
    assert.equal(registry.get(feat.id), undefined, 'workspace registration removed')
    assert.deepEqual(removed.repos[0]?.deletedWorktrees?.map(entry => [entry.branch, entry.title]), [
      ['feat/z', 'My branch'],
    ])
    await harness.service.syncNow()
    assert.equal(registry.list().some(workspace => workspace.path === featPath), false, 'tombstoned path is not auto-registered')
    assert.equal(harness.service.snapshot().repos[0]?.worktrees.find(entry => entry.path === featPath)?.workspaceId, null)
    const persisted = await loadState(join(root, 'state.json'))
    assert.equal(persisted.state.ignored.includes(featPath), true)
    assert.equal(persisted.state.deletedWorktrees[0]?.path, featPath)

    const restoredSnapshot = await harness.rpc('restoreWorkspace', { path: featPath })
    assert.equal(restoredSnapshot.repos[0]?.deletedWorktrees?.length, 0)
    assert.equal(await realpath(featPath), featPath)
    const restored = await registry.resolveByPath(featPath)
    assert.ok(restored)
    assert.equal(restored.title, 'My branch', 'custom workspace title restored')
    assert.deepEqual(restored.sessionIds, ['session-orphan'], 'sessions reattached by their retained cwd')
  })

  await t.test('a user delete is not re-registered, and adding the directory back resumes management', async () => {
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat)
    await registry.delete(feat.id)
    await sleep(20)
    await harness.service.syncNow()
    assert.equal(await registry.resolveByPath(featPath), undefined, 'not re-registered automatically')
    assert.equal(harness.service.snapshot().repos[0]?.worktrees.find(w => w.path === featPath)?.workspaceId, null)
    // The user's route back is the ordinary "add workspace" gesture.
    const restored = await registry.create(featPath, 'repo-login')
    await harness.service.syncNow()
    const persisted = await loadState(join(root, 'state.json'))
    assert.equal(persisted.state.ignored.includes(await realpath(featPath)), false, 'tombstone cleared')
    const worktree = harness.service.snapshot().repos[0]?.worktrees.find(w => w.path === featPath)
    assert.ok(worktree)
    assert.equal(worktree.workspaceId, restored.id)
  })

  await t.test('renames a repository without touching DSH data, and restores the derived default', async () => {
    const repoKey = harness.service.snapshot().repos[0]?.key
    assert.ok(repoKey)
    assert.equal(harness.service.snapshot().repos[0]?.name, 'repo', 'derived from the main worktree')
    const renamed = await harness.rpc('setRepoName', { repoKey, name: '  左栏实验  ' })
    assert.equal(renamed.repos[0]?.name, '左栏实验', 'trimmed')
    assert.deepEqual((await loadState(join(root, 'state.json'))).state.repoNames, { [repoKey]: '左栏实验' })
    const reset = await harness.rpc('setRepoName', { repoKey, name: '' })
    assert.equal(reset.repos[0]?.name, 'repo')
    assert.deepEqual((await loadState(join(root, 'state.json'))).state.repoNames, {})
    await assert.rejects(harness.rpc('setRepoName', { repoKey: '/nope/.git', name: 'x' }), /unknown-repository/)
    await assert.rejects(harness.rpc('setRepoName', { repoKey }), /bad-request/)
  })

  await t.test('scopes worktree title conflicts to one repository', async () => {
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat)
    const outsidePath = join(root, 'outside')
    await mkdir(outsidePath)
    const outside = await registry.create(outsidePath, 'shared')
    const renamed = await harness.rpc('setWorkspaceTitle', { workspaceId: feat.id, title: '  shared  ' })
    assert.equal(registry.get(feat.id)?.title, 'shared', 'a title used outside the repository is allowed')
    assert.equal(renamed.workspaceRepo[feat.id] !== undefined, true)
    await assert.rejects(
      harness.rpc('setWorkspaceTitle', { workspaceId: main.id, title: 'shared' }),
      /name-conflict/,
      'the same title inside one repository is rejected',
    )
    await assert.rejects(harness.rpc('setWorkspaceTitle', { workspaceId: outside.id, title: 'x' }), /not-worktree/)
    await assert.rejects(harness.rpc('setWorkspaceTitle', { workspaceId: feat.id, title: '  ' }), /bad-request/)
    await feat.setTitle('My branch')
    await registry.delete(outside.id)
  })

  await t.test('exposes exactly the endpoints the browser half uses', async () => {
    // The plugin has no per-repository switches and no manual registration:
    // reconciliation is continuous and the browser only reads or refreshes.
    assert.deepEqual(harness.routePaths().sort(), [
      '/api/left-panel/branchOptions', '/api/left-panel/createWorktree',
      '/api/left-panel/deleteRepository', '/api/left-panel/deleteWorkspace', '/api/left-panel/list',
      '/api/left-panel/renameBranch', '/api/left-panel/restoreWorkspace', '/api/left-panel/setRepoName',
      '/api/left-panel/setWorkspaceTitle', '/api/left-panel/sync',
    ])
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

  await t.test('removes an ordinary directory Workspace, keeping its files and skipping a tombstone', async () => {
    const plainPath = join(root, 'plain')
    const plain = await registry.resolveByPath(plainPath)
    assert.ok(plain)
    const removed = await harness.rpc('deleteWorkspace', { workspaceId: plain.id })
    assert.equal(registry.get(plain.id), undefined, 'registration removed')
    assert.equal(await realpath(plainPath), plainPath, 'directory retained')
    assert.deepEqual(removed.repos.flatMap(repo => repo.deletedWorktrees ?? []), [], 'no worktree tombstone')
    assert.deepEqual((await loadState(join(root, 'state.json'))).state.deletedWorktrees, [])
    await harness.service.syncNow()
    await harness.service.syncNow()
    assert.equal(await registry.resolveByPath(plainPath), undefined, 'not re-registered')
    assert.equal(registry.sessions.length, 2, 'session logs untouched')
  })

  await t.test('refuses to delete the main worktree record', async () => {
    await assert.rejects(harness.rpc('deleteWorkspace', { workspaceId: main.id }), /main-worktree/)
    assert.ok(registry.get(main.id), 'main registration kept')
    assert.equal(await realpath(repo), repo, 'main worktree directory retained')
    const feat = await registry.resolveByPath(featPath)
    assert.ok(feat, 'linked worktree record untouched')
    assert.equal(registry.sessions.length, 2, 'session logs untouched')
  })

  await t.test('rejects unknown deletion targets with structured errors', async () => {
    await assert.rejects(harness.rpc('deleteWorkspace', {}), /bad-request/)
    await assert.rejects(harness.rpc('deleteWorkspace', { workspaceId: 'ws-missing' }), /unknown-workspace/)
    await assert.rejects(harness.rpc('deleteRepository', {}), /bad-request/)
    await assert.rejects(harness.rpc('deleteRepository', { repoKey: '/nope/.git' }), /unknown-repository/)
  })

  await t.test('removes a whole repository and never resurrects its worktrees', async () => {
    await git(repo, 'worktree', 'add', '-q', '-b', 'three', threePath)
    await harness.service.syncNow()
    const repoKey = harness.service.snapshot().repos[0]?.key
    assert.ok(repoKey)
    const feat = await registry.resolveByPath(featPath)
    const three = await registry.resolveByPath(threePath)
    assert.ok(feat)
    assert.ok(three)

    const removed = await harness.rpc('deleteRepository', { repoKey })
    assert.equal(removed.repos.length, 0, 'repository group gone from the fresh snapshot')
    for (const path of [repo, featPath, threePath]) {
      assert.equal(await registry.resolveByPath(path), undefined, `${path} unregistered`)
      assert.equal(await realpath(path), path, 'worktree directory retained')
    }
    assert.equal(registry.sessions.length, 2, 'session logs untouched')
    const persisted = await loadState(join(root, 'state.json'))
    for (const path of [repo, featPath, threePath]) {
      assert.equal(persisted.state.ignored.includes(path), true, `${path} tombstoned`)
    }
    assert.deepEqual(
      persisted.state.deletedWorktrees.map(entry => [entry.branch, entry.title]).sort(),
      [['feat/z', 'My branch'], ['main', 'repo'], ['three', 'three']].sort(),
      'every worktree of the repository stays restorable with its own metadata',
    )

    await harness.service.syncNow()
    await harness.service.syncNow()
    for (const path of [repo, featPath, threePath]) {
      assert.equal(await registry.resolveByPath(path), undefined, 'no resurrection after repeated sync')
      assert.equal((await loadState(join(root, 'state.json'))).state.ignored.includes(path), true, 'tombstone stays durable')
    }
    assert.equal(harness.service.snapshot().repos.length, 0)
  })

  await t.test('adding a removed path back natively clears only its own tombstone', async () => {
    const feat = await registry.create(featPath, 'feat-back')
    await harness.service.syncNow()
    assert.ok(registry.get(feat.id), 'natively added Workspace kept')
    const repoInfo = harness.service.snapshot().repos[0]
    assert.ok(repoInfo, 'repository visible again through the re-added worktree')
    assert.equal(repoInfo.worktrees.find(worktree => worktree.path === featPath)?.workspaceId, feat.id)
    assert.deepEqual(
      repoInfo.deletedWorktrees?.map(entry => entry.path).sort(),
      [repo, threePath].sort(),
      'the path is no longer listed as removed and its neighbours still are',
    )
    let persisted = await loadState(join(root, 'state.json'))
    assert.equal(persisted.state.ignored.includes(featPath), false, 'ignore lifted')
    assert.equal(persisted.state.deletedWorktrees.some(entry => entry.path === featPath), false, 'tombstone lifted')
    assert.equal(persisted.state.ignored.includes(repo), true, 'other tombstone preserved')
    assert.equal(persisted.state.ignored.includes(threePath), true)

    const mainAgain = await registry.create(repo, 'repo')
    await harness.service.syncNow()
    assert.ok(registry.get(mainAgain.id))
    persisted = await loadState(join(root, 'state.json'))
    assert.equal(persisted.state.ignored.includes(repo), false, 'main worktree tombstone lifted too')
    assert.equal(persisted.state.deletedWorktrees.some(entry => entry.path === repo), false)
    assert.deepEqual(
      harness.service.snapshot().repos[0]?.deletedWorktrees?.map(entry => entry.path),
      [threePath],
      'the untouched worktree stays removed',
    )
    assert.equal(persisted.state.ignored.includes(threePath), true)
  })
})

test('createWorktree runs git worktree add and reconciliation registers it', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'left-panel-create-')))
  t.after(async () => { await rm(root, { recursive: true, force: true }) })
  const repo = join(root, 'repo')
  await git(root, 'init', '-q', '-b', 'main', repo)
  await git(repo, 'commit', '-q', '--allow-empty', '-m', 'init')
  // A local branch no worktree holds: the dialog offers it for checkout.
  await git(repo, 'branch', 'release/1.0')

  const registry = new FakeRegistry([])
  await registry.create(repo, 'repo')
  const harness = createHarness(registry, join(root, 'state.json'))
  t.after(() => { harness.dispose() })
  await harness.service.start()
  await harness.service.syncNow()
  const repoKey = harness.service.snapshot().repos[0]?.key
  assert.ok(repoKey)

  await t.test('branchOptions lists unchecked-out branches, the base and the sibling directories', async () => {
    const options = await harness.rpc('branchOptions', { repoKey }) as unknown as BranchOptions
    assert.deepEqual(options.availableBranches, ['release/1.0'], 'the checked-out main is excluded')
    assert.equal(options.base, 'main')
    assert.deepEqual(options.parents, [root])
    assert.equal(options.dirName, 'repo')
    await assert.rejects(harness.rpc('branchOptions', { repoKey: '/nope/.git' }), /unknown-repository/)
    await assert.rejects(harness.rpc('branchOptions', {}), /bad-request/)
  })

  const newPath = join(root, 'repo-feat-new')

  await t.test('grows a new branch and the worktree registers under the project', async () => {
    const snapshot = await harness.rpc('createWorktree', { repoKey, branch: 'feat/new', path: newPath })
    const worktree = snapshot.repos[0]?.worktrees.find(entry => entry.path === newPath)
    assert.ok(worktree)
    assert.equal(worktree.branch, 'feat/new')
    assert.notEqual(worktree.workspaceId, null, 'registered by the same reconcile a manual add triggers')
    assert.equal((await registry.resolveByPath(newPath))?.title, 'feat/new')
    assert.equal(await git(newPath, 'branch', '--show-current'), 'feat/new')
  })

  await t.test('checks out an existing unchecked-out branch', async () => {
    const target = join(root, 'repo-release')
    const snapshot = await harness.rpc('createWorktree', { repoKey, branch: 'release/1.0', path: target })
    const worktree = snapshot.repos[0]?.worktrees.find(entry => entry.path === target)
    assert.ok(worktree)
    assert.equal(worktree.branch, 'release/1.0')
    assert.notEqual(worktree.workspaceId, null)
    assert.equal(await git(target, 'branch', '--show-current'), 'release/1.0')
  })

  await t.test('rejects bad input and git failures with structured errors', async () => {
    await assert.rejects(harness.rpc('createWorktree', { repoKey }), /bad-request/)
    await assert.rejects(
      harness.rpc('createWorktree', { repoKey: '/nope/.git', branch: 'x', path: join(root, 'a') }),
      /unknown-repository/,
    )
    await assert.rejects(
      harness.rpc('createWorktree', { repoKey, branch: 'feat/relative', path: 'relative/dir' }),
      /bad-request/,
    )
    await assert.rejects(
      harness.rpc('createWorktree', { repoKey, branch: 'feat/dup', path: repo }),
      /path-conflict/,
    )
    const existing = join(root, 'exists')
    await mkdir(existing)
    await assert.rejects(
      harness.rpc('createWorktree', { repoKey, branch: 'feat/elsewhere', path: existing }),
      /path-exists/,
    )
    await assert.rejects(
      harness.rpc('createWorktree', { repoKey, branch: 'bad..name', path: join(root, 'x1') }),
      /invalid-branch/,
    )
    // 'main' is held by the main worktree: git refuses the checkout itself.
    await assert.rejects(
      harness.rpc('createWorktree', { repoKey, branch: 'main', path: join(root, 'x2') }),
      /git-error/,
    )
  })

  await t.test('creating at a tombstoned path lifts the removal memory', async () => {
    const worktree = harness.service.snapshot().repos[0]?.worktrees.find(entry => entry.path === newPath)
    const workspaceId = worktree?.workspaceId
    assert.ok(workspaceId)
    // Remove the registration (tombstone) and the worktree itself, then let the
    // dialog recreate both: the plugin treats that as a native re-add.
    await harness.rpc('deleteWorkspace', { workspaceId })
    await git(repo, 'worktree', 'remove', '--force', newPath)
    await harness.service.syncNow()
    let persisted = await loadState(join(root, 'state.json'))
    assert.equal(persisted.state.ignored.includes(newPath), true)
    assert.equal(persisted.state.deletedWorktrees.some(entry => entry.path === newPath), true)

    const snapshot = await harness.rpc('createWorktree', { repoKey, branch: 'feat/new', path: newPath })
    persisted = await loadState(join(root, 'state.json'))
    assert.equal(persisted.state.ignored.includes(newPath), false, 'ignore lifted')
    assert.equal(persisted.state.deletedWorktrees.some(entry => entry.path === newPath), false, 'tombstone lifted')
    const recreated = snapshot.repos[0]?.worktrees.find(entry => entry.path === newPath)
    assert.ok(recreated)
    assert.notEqual(recreated.workspaceId, null, 'registered again')
    assert.equal(snapshot.repos[0]?.deletedWorktrees?.length, 0)
  })
})

test('renameBranch and deleteBranch drive git mutations through the dialog actions', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'left-panel-branch-')))
  t.after(async () => { await rm(root, { recursive: true, force: true }) })
  const repo = join(root, 'repo')
  await git(root, 'init', '-q', '-b', 'main', repo)
  await git(repo, 'commit', '-q', '--allow-empty', '-m', 'init')
  const featPath = join(root, 'repo-feat')
  await git(repo, 'worktree', 'add', '-b', 'feat', featPath)

  const registry = new FakeRegistry([])
  await registry.create(repo, 'repo')
  const harness = createHarness(registry, join(root, 'state.json'))
  t.after(() => { harness.dispose() })
  await harness.service.start()
  await harness.service.syncNow()
  const repoKey = harness.service.snapshot().repos[0]?.key
  assert.ok(repoKey)
  const featWorkspaceId = harness.service.snapshot().repos[0]?.worktrees
    .find(worktree => worktree.path === featPath)?.workspaceId
  assert.ok(featWorkspaceId)
  const mainWorkspaceId = harness.service.snapshot().repos[0]?.worktrees
    .find(worktree => worktree.main)?.workspaceId
  assert.ok(mainWorkspaceId)

  await t.test('renameBranch renames the checked-out branch without touching the display name', async () => {
    const snapshot = await harness.rpc('renameBranch', { workspaceId: featWorkspaceId, branch: 'feat/renamed' })
    const worktree = snapshot.repos[0]?.worktrees.find(entry => entry.path === featPath)
    assert.equal(worktree?.branch, 'feat/renamed')
    assert.equal(await git(featPath, 'branch', '--show-current'), 'feat/renamed')
    assert.equal((await registry.resolveByPath(featPath))?.title, 'feat', 'display name stays decoupled from the branch')
    await git(featPath, 'branch', '-m', 'feat')
    await harness.service.syncNow()
  })

  await t.test('renameBranch rejects bad input and collisions', async () => {
    await assert.rejects(harness.rpc('renameBranch', {}), /bad-request/)
    await assert.rejects(harness.rpc('renameBranch', { workspaceId: 'ws-missing', branch: 'x' }), /unknown-workspace/)
    await assert.rejects(harness.rpc('renameBranch', { workspaceId: featWorkspaceId, branch: 'bad..name' }), /invalid-branch/)
    await assert.rejects(harness.rpc('renameBranch', { workspaceId: featWorkspaceId, branch: 'main' }), /branch-exists/)
    // Renaming to the current name is a no-op, not an error.
    await harness.rpc('renameBranch', { workspaceId: featWorkspaceId, branch: 'feat' })
  })

  await t.test('deleteBranch removes a clean merged worktree and its branch without a tombstone', async () => {
    const mergedPath = join(root, 'repo-merged')
    await git(repo, 'worktree', 'add', '-b', 'merged', mergedPath)
    await harness.service.syncNow()
    const workspaceId = harness.service.snapshot().repos[0]?.worktrees
      .find(worktree => worktree.path === mergedPath)?.workspaceId
    assert.ok(workspaceId)

    const snapshot = await harness.rpc('deleteWorkspace', { workspaceId, deleteBranch: true })
    assert.equal(snapshot.repos[0]?.worktrees.some(worktree => worktree.path === mergedPath), false)
    assert.equal(await isDirectory(mergedPath), false, 'worktree directory removed')
    assert.equal(await git(repo, 'branch', '--list', 'merged'), '', 'branch deleted')
    const persisted = await loadState(join(root, 'state.json'))
    assert.equal(persisted.state.deletedWorktrees.some(entry => entry.path === mergedPath), false, 'no tombstone for a gone directory')
  })

  await t.test('deleteBranch on a dirty or unmerged worktree needs the second confirmation', async () => {
    // Uncommitted work is rejected until the dialog repeats with force.
    await writeFile(join(featPath, 'dirty.txt'), 'wip')
    await assert.rejects(
      harness.rpc('deleteWorkspace', { workspaceId: featWorkspaceId, deleteBranch: true }),
      /unsafe-delete/,
    )
    // A clean tree with unmerged commits trips the same gate.
    await git(featPath, 'add', 'dirty.txt')
    await git(featPath, 'commit', '-qm', 'wip')
    await assert.rejects(
      harness.rpc('deleteWorkspace', { workspaceId: featWorkspaceId, deleteBranch: true }),
      /unsafe-delete/,
    )
    const snapshot = await harness.rpc('deleteWorkspace', { workspaceId: featWorkspaceId, deleteBranch: true, force: true })
    assert.equal(snapshot.repos[0]?.worktrees.some(worktree => worktree.path === featPath), false)
    assert.equal(await isDirectory(featPath), false, 'worktree directory removed')
    assert.equal(await git(repo, 'branch', '--list', 'feat'), '', 'branch deleted')
  })

  await t.test('deleteBranch refuses the main worktree and non-branch workspaces', async () => {
    await assert.rejects(
      harness.rpc('deleteWorkspace', { workspaceId: mainWorkspaceId, deleteBranch: true }),
      /main-worktree/,
    )
    const plain = join(root, 'plain')
    await mkdir(plain)
    const outside = await registry.create(plain, 'plain')
    await assert.rejects(
      harness.rpc('deleteWorkspace', { workspaceId: outside.id, deleteBranch: true }),
      /bad-request/,
    )
    await registry.delete(outside.id)
  })
})
