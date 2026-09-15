/**
 * Host half of the plugin: keeps the Workspace registry in step with the git
 * worktrees of every registered repository and answers the browser half.
 *
 * Triggers for a reconcile: startup, `domain/changed` on the workspace domain,
 * filesystem events under each repository's common git dir, a slow poll, the
 * removal grace timer, and explicit client requests. Reconciles are
 * serialized; triggers that arrive mid-run coalesce into one follow-up run.
 */
import { watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute, ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Workspace, WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-workspace'

import { canonical, isDirectory, listWorktrees, locate } from './git.ts'
import {
  CHANNEL, ENDPOINTS, methodOf,
  type Endpoint, type RepoInfo, type WorktreeInfo, type WorktreeSnapshot,
} from './protocol.ts'
import { StateStore, defaultStateFile, type PersistedState } from './state.ts'
import {
  planSync, worktreeTitle,
  type RegisteredWorkspace, type ScannedRepo, type ScannedWorktree, type SyncMemory, type SyncPlan,
} from './sync.ts'

export interface WorktreeSyncOptions {
  readonly stateFile?: string
  readonly pollMs?: number
  readonly debounceMs?: number
  /** How long a worktree must stay gone before its Workspace is unregistered. */
  readonly removalGraceMs?: number
}

const DEFAULT_POLL_MS = 30_000
const DEFAULT_DEBOUNCE_MS = 400
/** How long a self-issued delete stays recognizable in the change stream. */
const SELF_DELETE_TTL_MS = 5_000

interface FailedRepo {
  readonly mainPath: string
  readonly error: string
}

function ok<T>(value: T): ConnectionRpcResult<T> {
  return { ok: true, value }
}

function fail(code: string, message: string, details: object = {}): ConnectionRpcResult<never> {
  return { ok: false, error: { code, message, details } }
}

function stringField(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function booleanField(payload: unknown, key: string): boolean | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : undefined
}

function sameState(a: PersistedState, b: PersistedState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The Connection RPC request envelope the browser's `rpc.call` sends. */
interface ClientRequestEnvelope {
  readonly rpcId: string
  readonly method: string
  readonly payload: unknown
}

function parseEnvelope(body: unknown): ClientRequestEnvelope | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const record = body as Record<string, unknown>
  if (record.type !== 'client-request' || typeof record.rpcId !== 'string' || typeof record.method !== 'string') return undefined
  return { rpcId: record.rpcId, method: record.method, payload: record.payload }
}

/** The Connection RPC response envelope the browser's `rpc.call` parses. */
function respond(rpcId: string, result: ConnectionRpcResult<unknown>): Response {
  return Response.json({ type: 'server-response', rpcId, result })
}

export class WorktreeSyncService {
  private readonly store: StateStore
  private readonly pollMs: number
  private readonly debounceMs: number
  private readonly removalGraceMs: number | undefined

  private registry: readonly RegisteredWorkspace[] = []
  private repos: readonly ScannedRepo[] = []
  private failedRepos: ReadonlyMap<string, FailedRepo> = new Map()
  private pendingRemoval: ReadonlyMap<string, number> = new Map()
  private syncing = false
  private syncedAt = 0
  private dirty = false
  private running: Promise<void> | undefined
  private readonly watchers = new Map<string, FSWatcher[]>()
  private readonly selfDeletes = new Set<string>()
  private debounceTimer: NodeJS.Timeout | undefined
  private graceTimer: NodeJS.Timeout | undefined
  private pollTimer: NodeJS.Timeout | undefined
  private disposed = false

  constructor(private readonly ctx: Context, options: WorktreeSyncOptions = {}) {
    this.store = new StateStore(options.stateFile ?? defaultStateFile())
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.removalGraceMs = options.removalGraceMs
  }

  /** Load memory, attach to the registry and the connection, and kick off the first reconcile. */
  async start(): Promise<void> {
    const loadError = await this.store.load()
    if (loadError !== undefined) this.ctx.logger.warn(`left-panel: state file unreadable, starting empty: ${loadError}`)
    this.ctx.effect(() => this.ctx.on('domain/changed', change => this.onDomainChanged(change)), 'left-panel: workspace changes')
    // Exact Fetch routes on the shared, authenticated /api channel: the
    // connection applies its Host/Origin fence and browser authentication
    // before dispatching, and registering them touches nothing but the
    // connection's own route table.
    for (const endpoint of ENDPOINTS) {
      const method = methodOf(endpoint)
      const route: ConnectionFetchRoute = {
        path: `${CHANNEL}/${method}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: request => this.serve(endpoint, method, request),
      }
      this.ctx.effect(() => this.ctx.connection.fetch.register(route), `left-panel: ${route.path}`)
    }
    this.ctx.effect(() => () => this.dispose(), 'left-panel: worktree sync')
    this.pollTimer = setInterval(() => this.requestSync(), this.pollMs)
    this.pollTimer.unref()
    this.requestSync()
  }

  /** Decode one RPC envelope, dispatch it, and answer in the envelope the browser expects. */
  private async serve(endpoint: Endpoint, method: string, request: Request): Promise<Response> {
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return new Response('content type must be application/json', { status: 415 })
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response('body is not JSON', { status: 400 })
    }
    const envelope = parseEnvelope(body)
    if (envelope === undefined) return respond('invalid-request', fail('gateway/bad-request', 'invalid client-request message'))
    if (envelope.method !== method) {
      return respond(envelope.rpcId, fail('gateway/bad-request', `method ${JSON.stringify(envelope.method)} does not match endpoint ${JSON.stringify(method)}`))
    }
    return respond(envelope.rpcId, await this.handle(endpoint, envelope.payload))
  }

  /** Current view for the browser half; never touches git. */
  snapshot(): WorktreeSnapshot {
    const state = this.store.current
    const byPath = new Map(this.registry.map(workspace => [workspace.path, workspace]))
    const ignored = new Set(state.ignored)
    const workspaceRepo: Record<string, string> = {}
    const repos: RepoInfo[] = this.repos.map((repo) => {
      const worktrees: WorktreeInfo[] = []
      for (const worktree of repo.worktrees) {
        if (worktree.bare) continue
        const workspaceId = byPath.get(worktree.path)?.id ?? null
        if (workspaceId !== null) workspaceRepo[workspaceId] = repo.key
        worktrees.push({
          path: worktree.path,
          head: worktree.head,
          branch: worktree.branch,
          detached: worktree.detached,
          main: worktree.main,
          bare: false,
          locked: worktree.locked,
          prunable: worktree.prunable,
          exists: worktree.exists,
          title: worktreeTitle(worktree),
          workspaceId,
          ignored: ignored.has(worktree.path),
        })
      }
      return {
        key: repo.key,
        name: basename(repo.mainPath) || repo.mainPath,
        mainPath: repo.mainPath,
        auto: state.repoAuto[repo.key] ?? true,
        worktrees,
      }
    })
    for (const [key, failed] of this.failedRepos) {
      repos.push({
        key,
        name: basename(failed.mainPath) || failed.mainPath,
        mainPath: failed.mainPath,
        auto: state.repoAuto[key] ?? true,
        worktrees: [],
        error: failed.error,
      })
    }
    return { repos, workspaceRepo, syncedAt: this.syncedAt, syncing: this.syncing }
  }

  /** Schedule a reconcile shortly; repeated requests collapse into one run. */
  requestSync(): void {
    if (this.disposed) return
    this.dirty = true
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined
      void this.run()
    }, this.debounceMs)
  }

  /** Reconcile now and wait for it. */
  async syncNow(): Promise<void> {
    if (this.disposed) return
    this.dirty = true
    await this.run()
  }

  private run(): Promise<void> {
    if (this.running !== undefined) return this.running
    this.running = (async () => {
      while (this.dirty && !this.disposed) {
        this.dirty = false
        this.syncing = true
        try {
          await this.reconcileOnce()
        } catch (error) {
          this.ctx.logger.warn(`left-panel: reconcile failed: ${String(error)}`)
        } finally {
          this.syncing = false
        }
      }
    })().finally(() => { this.running = undefined })
    return this.running
  }

  private async reconcileOnce(): Promise<void> {
    await this.scan()
    const state = this.store.current
    const memory: SyncMemory = {
      ignored: new Set(state.ignored),
      repoAuto: new Map(Object.entries(state.repoAuto)),
      knownWorktrees: new Map(Object.entries(state.knownWorktrees)),
      autoTitles: new Map(Object.entries(state.autoTitles)),
      pendingRemoval: this.pendingRemoval,
    }
    const plan = planSync(this.registry, this.repos, memory, Date.now(), this.removalGraceMs)
    await this.apply(plan, state)
    this.pendingRemoval = plan.pendingRemoval
    this.scheduleGrace(plan.nextCheckAt)
    this.updateWatchers()
    this.syncedAt = Date.now()
  }

  /** Read the registry and ask git about every worktree-root Workspace, grouped by repository. */
  private async scan(): Promise<void> {
    const registry: RegisteredWorkspace[] = []
    const members = new Map<string, string[]>()
    for (const workspace of this.ctx.workspaceRegistry.list()) {
      registry.push({ id: workspace.id, path: workspace.path, title: workspace.title })
      if (!(await isDirectory(workspace.path))) continue
      const location = await locate(workspace.path)
      if (location === null || !location.isRoot) continue
      const list = members.get(location.commonDir)
      if (list === undefined) members.set(location.commonDir, [workspace.path])
      else list.push(workspace.path)
    }
    const repos: ScannedRepo[] = []
    const failed = new Map<string, FailedRepo>()
    for (const [key, paths] of members) {
      const cwd = paths[0]
      if (cwd === undefined) continue
      try {
        const entries = await listWorktrees(cwd)
        const worktrees: ScannedWorktree[] = []
        for (const [index, entry] of entries.entries()) {
          const path = await canonical(entry.path)
          worktrees.push({ ...entry, path, exists: await isDirectory(path), main: index === 0 })
        }
        const mainPath = worktrees.find(worktree => worktree.main)?.path ?? cwd
        repos.push({ key, mainPath, worktrees })
      } catch (error) {
        failed.set(key, { mainPath: cwd, error: String(error) })
        this.ctx.logger.warn(`left-panel: git worktree list failed in ${cwd}: ${String(error)}`)
      }
    }
    this.registry = registry
    this.repos = repos
    this.failedRepos = failed
  }

  private async apply(plan: SyncPlan, state: PersistedState): Promise<void> {
    const known = new Map(plan.knownWorktrees)
    const titles: Record<string, string> = { ...state.autoTitles }
    const released = new Set(plan.releaseIgnored)
    // Sessions that already live in a worktree directory predate its Workspace
    // registration (they sat under Ungrouped). Membership is the Workspace's
    // durable session ledger, so a registered worktree adopts them explicitly;
    // attachSession re-validates the canonical cwd, so this can never move a
    // session into the wrong directory.
    const ungrouped = plan.actions.some(action => action.type === 'create')
      ? await this.sessionsByDirectory()
      : new Map<string, readonly SessionId[]>()
    for (const action of plan.actions) {
      switch (action.type) {
        case 'create': {
          try {
            const workspace = await this.ctx.workspaceRegistry.create(action.path, action.title)
            known.set(action.path, action.repoKey)
            titles[action.path] = action.title
            await this.placeAfterRepo(workspace.id, action.repoKey, action.mainWorkspaceId)
            this.ctx.logger.info(`left-panel: registered worktree ${action.path} as "${action.title}"`)
            await this.adoptExistingSessions(workspace, ungrouped.get(action.path) ?? [])
          } catch (error) {
            this.ctx.logger.warn(`left-panel: could not register ${action.path}: ${String(error)}`)
          }
          break
        }
        case 'delete': {
          this.rememberSelfDelete(action.workspaceId)
          try {
            await this.ctx.workspaceRegistry.delete(action.workspaceId as WorkspaceId)
            this.ctx.logger.info(`left-panel: unregistered ${action.path} (${action.reason})`)
          } catch (error) {
            this.ctx.logger.warn(`left-panel: could not unregister ${action.path}: ${String(error)}`)
          }
          known.delete(action.path)
          delete titles[action.path]
          break
        }
        case 'retitle': {
          const workspace = this.ctx.workspaceRegistry.get(action.workspaceId as WorkspaceId)
          if (workspace === undefined) break
          try {
            await workspace.setTitle(action.title)
            titles[action.path] = action.title
          } catch (error) {
            this.ctx.logger.warn(`left-panel: could not retitle ${action.path}: ${String(error)}`)
          }
          break
        }
      }
    }
    for (const path of Object.keys(titles)) if (!known.has(path)) delete titles[path]
    const next: PersistedState = {
      ...state,
      ignored: state.ignored.filter(path => !released.has(path)),
      knownWorktrees: Object.fromEntries(known),
      autoTitles: titles,
    }
    if (!sameState(state, next)) await this.store.update(() => next)
  }

  /** Stored sessions grouped by canonical cwd, for adopting orphans into a new worktree Workspace. */
  private async sessionsByDirectory(): Promise<Map<string, SessionId[]>> {
    const byPath = new Map<string, SessionId[]>()
    try {
      for (const snapshot of await this.ctx.sessionPersistence.list()) {
        const cwd = snapshot.header.cwd
        if (typeof cwd !== 'string' || cwd === '') continue
        const path = await canonical(cwd)
        const ids = byPath.get(path)
        if (ids === undefined) byPath.set(path, [snapshot.header.id])
        else ids.push(snapshot.header.id)
      }
    } catch (error) {
      this.ctx.logger.warn(`left-panel: could not list stored sessions: ${String(error)}`)
    }
    return byPath
  }

  /** Attach sessions whose immutable cwd is this worktree; attachSession rejects any mismatch. */
  private async adoptExistingSessions(workspace: Workspace, candidates: readonly SessionId[]): Promise<void> {
    let adopted = 0
    for (const sessionId of candidates) {
      if (workspace.sessionIds.includes(sessionId)) continue
      try {
        await workspace.attachSession(sessionId)
        adopted += 1
      } catch (error) {
        this.ctx.logger.warn(`left-panel: could not attach ${sessionId} to ${workspace.path}: ${String(error)}`)
      }
    }
    if (adopted > 0) {
      this.ctx.logger.info(`left-panel: adopted ${adopted} pre-existing session(s) into ${workspace.path}`)
    }
  }

  /** Keep a repository's worktree Workspaces adjacent in the durable order: right after the last one already placed. */
  private async placeAfterRepo(id: WorkspaceId, repoKey: string, mainWorkspaceId: string | undefined): Promise<void> {
    if (mainWorkspaceId === undefined) return
    const repo = this.repos.find(candidate => candidate.key === repoKey)
    if (repo === undefined) return
    const repoPaths = new Set(repo.worktrees.map(worktree => worktree.path))
    const ordered = this.ctx.workspaceRegistry.list()
    const mainIndex = ordered.findIndex(workspace => workspace.id === mainWorkspaceId)
    if (mainIndex < 0) return
    let cursor = mainIndex + 1
    while (cursor < ordered.length) {
      const candidate = ordered[cursor]
      if (candidate === undefined || candidate.id === id || !repoPaths.has(candidate.path)) break
      cursor += 1
    }
    const anchor = ordered[cursor]
    if (anchor?.id === id) return
    try {
      await this.ctx.workspaceRegistry.insertBefore(id, anchor?.id)
    } catch (error) {
      this.ctx.logger.warn(`left-panel: could not reorder ${id}: ${String(error)}`)
    }
  }

  private rememberSelfDelete(id: string): void {
    this.selfDeletes.add(id)
    setTimeout(() => this.selfDeletes.delete(id), SELF_DELETE_TTL_MS).unref()
  }

  private onDomainChanged(change: DomainChanged): void {
    if (change.domain !== 'workspace' || change.table !== 'workspaces') return
    if (change.operation === 'deleted') {
      if (this.selfDeletes.has(change.key)) {
        this.selfDeletes.delete(change.key)
      } else {
        const entry = this.registry.find(workspace => workspace.id === change.key)
        if (entry !== undefined && this.isWorktreePath(entry.path)) {
          this.ctx.logger.info(`left-panel: ${entry.path} removed by the user; not registering it again`)
          void this.store.update(state => state.ignored.includes(entry.path)
            ? state
            : { ...state, ignored: [...state.ignored, entry.path] })
            .catch((error: unknown) => this.ctx.logger.warn(`left-panel: could not persist ignore: ${String(error)}`))
        }
      }
    }
    this.requestSync()
  }

  private isWorktreePath(path: string): boolean {
    if (this.store.current.knownWorktrees[path] !== undefined) return true
    return this.repos.some(repo => repo.worktrees.some(worktree => worktree.path === path))
  }

  private findWorktree(path: string): { repo: ScannedRepo; worktree: ScannedWorktree } | undefined {
    for (const repo of this.repos) {
      const worktree = repo.worktrees.find(candidate => candidate.path === path && !candidate.bare)
      if (worktree !== undefined) return { repo, worktree }
    }
    return undefined
  }

  private async handle(endpoint: string, payload: unknown): Promise<ConnectionRpcResult<unknown>> {
    try {
      switch (endpoint) {
        case 'list':
          return ok(this.snapshot())
        case 'sync':
          await this.syncNow()
          return ok(this.snapshot())
        case 'ignore':
        case 'unignore':
        case 'register': {
          const raw = stringField(payload, 'path')
          if (raw === undefined) return fail('left-panel/bad-request', `${endpoint} requires a path`)
          const found = this.findWorktree(await canonical(raw))
          if (found === undefined) return fail('left-panel/unknown-worktree', `${raw} is not a worktree of a registered repository`, { path: raw })
          const { worktree } = found
          if (endpoint === 'ignore') {
            await this.store.update(state => state.ignored.includes(worktree.path)
              ? state
              : { ...state, ignored: [...state.ignored, worktree.path] })
            const registered = this.registry.find(workspace => workspace.path === worktree.path)
            if (registered !== undefined) {
              this.rememberSelfDelete(registered.id)
              await this.ctx.workspaceRegistry.delete(registered.id as WorkspaceId)
            }
          } else {
            await this.store.update(state => state.ignored.includes(worktree.path)
              ? { ...state, ignored: state.ignored.filter(path => path !== worktree.path) }
              : state)
            if (endpoint === 'register') {
              if (!worktree.exists) return fail('left-panel/missing-directory', `${worktree.path} does not exist`, { path: worktree.path })
              const title = worktreeTitle(worktree)
              const workspace = await this.ctx.workspaceRegistry.create(worktree.path, title)
              await this.store.update(state => ({
                ...state,
                knownWorktrees: { ...state.knownWorktrees, [worktree.path]: found.repo.key },
                autoTitles: { ...state.autoTitles, [worktree.path]: title },
              }))
              const main = found.repo.worktrees.find(candidate => candidate.main)
              const mainWorkspaceId = main === undefined ? undefined : this.registry.find(entry => entry.path === main.path)?.id
              await this.placeAfterRepo(workspace.id, found.repo.key, mainWorkspaceId)
              await this.adoptExistingSessions(workspace, (await this.sessionsByDirectory()).get(worktree.path) ?? [])
            }
          }
          await this.syncNow()
          return ok(this.snapshot())
        }
        case 'setRepoAuto': {
          const repoKey = stringField(payload, 'repoKey')
          const auto = booleanField(payload, 'auto')
          if (repoKey === undefined || auto === undefined) return fail('left-panel/bad-request', 'setRepoAuto requires repoKey and auto')
          if (!this.repos.some(repo => repo.key === repoKey) && !this.failedRepos.has(repoKey)) {
            return fail('left-panel/unknown-repository', `${repoKey} is not a scanned repository`, { repoKey })
          }
          await this.store.update(state => ({ ...state, repoAuto: { ...state.repoAuto, [repoKey]: auto } }))
          await this.syncNow()
          return ok(this.snapshot())
        }
        default:
          return fail('left-panel/unknown-endpoint', `unknown endpoint "${endpoint}"`, { endpoint })
      }
    } catch (error) {
      this.ctx.logger.warn(`left-panel: ${endpoint} failed: ${String(error)}`)
      return fail('left-panel/internal', String(error))
    }
  }

  private scheduleGrace(nextCheckAt: number | undefined): void {
    if (this.graceTimer !== undefined) {
      clearTimeout(this.graceTimer)
      this.graceTimer = undefined
    }
    if (nextCheckAt === undefined || this.disposed) return
    const delay = Math.max(0, nextCheckAt - Date.now()) + 50
    this.graceTimer = setTimeout(() => {
      this.graceTimer = undefined
      this.requestSync()
    }, delay)
  }

  /** Watch each repository's common git dir (HEAD, worktrees/) so checkouts and worktree add/remove reconcile promptly. */
  private updateWatchers(): void {
    const wanted = new Set(this.repos.map(repo => repo.key))
    for (const [key, watchers] of this.watchers) {
      if (wanted.has(key)) continue
      for (const watcher of watchers) watcher.close()
      this.watchers.delete(key)
    }
    for (const key of wanted) {
      if (this.watchers.has(key)) continue
      const watchers: FSWatcher[] = []
      const attach = (target: string, recursive: boolean): void => {
        try {
          const watcher = watch(target, { persistent: false, recursive }, () => this.requestSync())
          watcher.on('error', (error) => {
            this.ctx.logger.warn(`left-panel: watcher on ${target} failed, relying on polling: ${String(error)}`)
            watcher.close()
          })
          watchers.push(watcher)
        } catch (error) {
          this.ctx.logger.warn(`left-panel: cannot watch ${target}: ${String(error)}`)
        }
      }
      attach(key, false)
      attach(join(key, 'worktrees'), true)
      this.watchers.set(key, watchers)
    }
  }

  private dispose(): void {
    this.disposed = true
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer)
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer)
    if (this.graceTimer !== undefined) clearTimeout(this.graceTimer)
    for (const watchers of this.watchers.values()) for (const watcher of watchers) watcher.close()
    this.watchers.clear()
  }
}
