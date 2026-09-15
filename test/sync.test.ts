import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  REMOVAL_GRACE_MS, planSync, worktreeTitle,
  type RegisteredWorkspace, type ScannedRepo, type ScannedWorktree, type SyncMemory,
} from '../src/sync.ts'

const REPO = '/repo/.git'

function worktree(path: string, overrides: Partial<ScannedWorktree> = {}): ScannedWorktree {
  return {
    path, head: 'a'.repeat(40), branch: path.split('/').pop() ?? path,
    detached: false, bare: false, locked: false, prunable: false, exists: true, main: false,
    ...overrides,
  } as ScannedWorktree
}

function repo(worktrees: ScannedWorktree[]): ScannedRepo {
  return { key: REPO, mainPath: '/repo', worktrees }
}

function memory(overrides: Partial<SyncMemory> = {}): SyncMemory {
  return {
    ignored: new Set(),
    repoAuto: new Map(),
    knownWorktrees: new Map(),
    autoTitles: new Map(),
    pendingRemoval: new Map(),
    ...overrides,
  }
}

const MAIN: RegisteredWorkspace = { id: 'ws-main', path: '/repo', title: 'repo' }
const NOW = 1_000_000

test('creates a Workspace for each present unregistered worktree with the branch as title', () => {
  const plan = planSync([MAIN], [repo([
    worktree('/repo', { main: true, branch: 'main' }),
    worktree('/wt/feat', { branch: 'feat/x' }),
  ])], memory(), NOW)
  assert.deepEqual(plan.actions, [
    { type: 'create', repoKey: REPO, path: '/wt/feat', title: 'feat/x', mainWorkspaceId: 'ws-main' },
  ])
})

test('skips ignored, bare and missing worktrees and repositories with automation off', () => {
  const scanned = repo([
    worktree('/repo', { main: true }),
    worktree('/wt/ignored'),
    worktree('/bare.git', { bare: true }),
    worktree('/wt/missing', { exists: false }),
  ])
  const ignoredPlan = planSync([MAIN], [scanned], memory({ ignored: new Set(['/wt/ignored']) }), NOW)
  assert.deepEqual(ignoredPlan.actions, [])
  const manualPlan = planSync([MAIN], [repo([worktree('/repo', { main: true }), worktree('/wt/new')])],
    memory({ repoAuto: new Map([[REPO, false]]) }), NOW)
  assert.deepEqual(manualPlan.actions, [])
})

test('retitles a worktree Workspace only while it still carries the plugin-assigned title', () => {
  const registry = [MAIN,
    { id: 'ws-a', path: '/wt/a', title: 'old-branch' },
    { id: 'ws-b', path: '/wt/b', title: 'My custom name' },
  ]
  const scanned = repo([
    worktree('/repo', { main: true }),
    worktree('/wt/a', { branch: 'new-branch' }),
    worktree('/wt/b', { branch: 'renamed-too' }),
  ])
  const plan = planSync(registry, [scanned], memory({
    autoTitles: new Map([['/wt/a', 'old-branch'], ['/wt/b', 'b']]),
  }), NOW)
  assert.deepEqual(plan.actions, [{ type: 'retitle', path: '/wt/a', workspaceId: 'ws-a', title: 'new-branch' }])
  assert.equal(plan.knownWorktrees.get('/wt/a'), REPO)
})

test('deletes a linked worktree that git no longer lists only after the grace period', () => {
  const registry = [MAIN, { id: 'ws-gone', path: '/wt/gone', title: 'gone' }]
  const scanned = repo([worktree('/repo', { main: true })])
  const first = planSync(registry, [scanned], memory({ knownWorktrees: new Map([['/wt/gone', REPO]]) }), NOW)
  assert.deepEqual(first.actions, [])
  assert.equal(first.pendingRemoval.get('/wt/gone'), NOW)
  assert.equal(first.nextCheckAt, NOW + REMOVAL_GRACE_MS)

  const second = planSync(registry, [scanned], memory({
    knownWorktrees: new Map([['/wt/gone', REPO]]),
    pendingRemoval: first.pendingRemoval,
  }), NOW + REMOVAL_GRACE_MS)
  assert.deepEqual(second.actions, [
    { type: 'delete', repoKey: REPO, path: '/wt/gone', workspaceId: 'ws-gone', reason: 'worktree-gone' },
  ])
  assert.equal(second.knownWorktrees.has('/wt/gone'), false)
})

test('deletes a registered worktree whose directory vanished but never the main worktree', () => {
  const registry = [MAIN, { id: 'ws-x', path: '/wt/x', title: 'x' }]
  const scanned = repo([
    worktree('/repo', { main: true, exists: false }),
    worktree('/wt/x', { exists: false, prunable: true }),
  ])
  const pending = new Map([['/wt/x', NOW - REMOVAL_GRACE_MS], ['/repo', NOW - REMOVAL_GRACE_MS]])
  const plan = planSync(registry, [scanned], memory({ pendingRemoval: pending }), NOW)
  assert.deepEqual(plan.actions, [
    { type: 'delete', repoKey: REPO, path: '/wt/x', workspaceId: 'ws-x', reason: 'directory-missing' },
  ])
})

test('a pending removal is cancelled when the worktree comes back', () => {
  const registry = [MAIN, { id: 'ws-x', path: '/wt/x', title: 'x' }]
  const scanned = repo([worktree('/repo', { main: true }), worktree('/wt/x')])
  const plan = planSync(registry, [scanned], memory({ pendingRemoval: new Map([['/wt/x', NOW - 1000]]) }), NOW)
  assert.deepEqual(plan.actions, [])
  assert.equal(plan.pendingRemoval.size, 0)
  assert.equal(plan.nextCheckAt, undefined)
})

test('releases ignored paths whose worktree disappeared from git and forgets stale associations', () => {
  const scanned = repo([worktree('/repo', { main: true }), worktree('/wt/kept')])
  const plan = planSync([MAIN], [scanned], memory({
    ignored: new Set(['/wt/kept', '/wt/removed']),
    knownWorktrees: new Map([['/wt/unregistered', REPO]]),
  }), NOW)
  assert.deepEqual(plan.releaseIgnored, ['/wt/removed'])
  assert.equal(plan.knownWorktrees.has('/wt/unregistered'), false)
  assert.deepEqual(plan.actions, [])
})

test('plain Workspaces outside any repository are never touched', () => {
  const plain: RegisteredWorkspace = { id: 'ws-plain', path: '/docs', title: 'docs' }
  const plan = planSync([plain], [], memory({ knownWorktrees: new Map([['/docs', '/elsewhere/.git']]) }), NOW)
  assert.deepEqual(plan.actions, [])
})

test('worktreeTitle prefers the branch, then the short hash, then the directory name', () => {
  assert.equal(worktreeTitle(worktree('/wt/a', { branch: 'feat/a' })), 'feat/a')
  assert.equal(worktreeTitle(worktree('/wt/a', { branch: null, head: '0123456789abcdef' })), '0123456')
  assert.equal(worktreeTitle(worktree('/wt/name', { branch: null, head: '' })), 'name')
})
