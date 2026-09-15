import { test } from 'node:test'
import assert from 'node:assert/strict'

import { arrangeSections, planWorkspaceMove, repoGroupKey, type GroupNode } from '../src/client/tree.ts'
import type { RepoInfo, WorktreeInfo, WorktreeSnapshot } from '../src/protocol.ts'

function group(workspaceId: string, label: string, cwd: string, containsCurrent = false): GroupNode {
  return {
    key: workspaceId,
    workspaceId: workspaceId as GroupNode['workspaceId'],
    cwd,
    createdAt: 0,
    label,
    sessionCount: 0,
    expanded: true,
    containsCurrent,
    sessions: [],
  }
}

function worktree(path: string, title: string, workspaceId: string | null, main = false): WorktreeInfo {
  return {
    path, head: 'a'.repeat(40), branch: title, detached: false, main, bare: false,
    locked: false, prunable: false, exists: true, title, workspaceId,
  }
}

function repo(key: string, worktrees: WorktreeInfo[]): RepoInfo {
  return {
    key,
    name: key.split('/').slice(-2, -1)[0] ?? key,
    mainPath: worktrees.find(w => w.main)?.path ?? '',
    worktrees,
  }
}

function snapshot(repos: RepoInfo[]): WorktreeSnapshot {
  const workspaceRepo: Record<string, string> = {}
  for (const entry of repos) {
    for (const worktree of entry.worktrees) {
      if (worktree.workspaceId !== null) workspaceRepo[worktree.workspaceId] = entry.key
    }
  }
  return { repos, workspaceRepo, syncedAt: 1 }
}

test('folds worktree groups under their repository and sorts them main-first', () => {
  const wsA = 'ws-a', wsB = 'ws-b'
  const sections = arrangeSections(
    [group(wsA, 'feat/login', '/wt/login'), group('ws-plain', 'plain', '/plain'), group(wsB, 'fix/sidebar', '/wt/sidebar')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/login', 'feat/login', wsA),
      worktree('/wt/sidebar', 'fix/sidebar', wsB),
    ])]),
    {},
  )
  assert.equal(sections.length, 2)
  const first = sections[0]
  assert.ok(first?.kind === 'repo')
  assert.equal(first.repo.key, '/repo/.git')
  assert.deepEqual(first.groups.map(g => g.label), ['feat/login', 'fix/sidebar'])
  const second = sections[1]
  assert.ok(second?.kind === 'group')
  assert.equal(second.group.label, 'plain')
})

test('a repository shows only registered groups: no row is invented from the snapshot', () => {
  // /repo is registered (ws-main) but its group is absent — for example the
  // Workspace was just deleted and the Workspaces stream has not caught up.
  // The row must vanish rather than be re-synthesized from the worktree list.
  const sections = arrangeSections(
    [group('ws-a', 'feat/a', '/wt/a')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/a', 'feat/a', 'ws-a'),
    ])]),
    {},
  )
  assert.equal(sections.length, 1)
  const section = sections[0]
  assert.ok(section?.kind === 'repo')
  assert.deepEqual(section.groups.map(g => g.label), ['feat/a'])
})

test('repo node placement follows its first workspace, not its own order', () => {
  const sections = arrangeSections(
    [group('ws-plain', 'plain', '/plain'), group('ws-a', 'feat/a', '/wt/a')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/a', 'feat/a', 'ws-a'),
    ])]),
    {},
  )
  assert.equal(sections.length, 2)
  assert.equal(sections[0]?.kind, 'group')
  assert.equal(sections[1]?.kind, 'repo')
})

test('a repository whose every worktree is gone renders no section at all', () => {
  const sections = arrangeSections([], snapshot([repo('/repo/.git', [
    worktree('/repo', 'main', 'ws-main', true),
  ])]), {})
  assert.deepEqual(sections, [])
})

test('containsCurrent rolls up from the worktree groups', () => {
  const snap = snapshot([repo('/repo/.git', [
    worktree('/repo', 'main', 'ws-main', true),
    worktree('/wt/a', 'feat/a', 'ws-a'),
  ])])
  const quiet = arrangeSections(
    [group('ws-main', 'main', '/repo'), group('ws-a', 'feat/a', '/wt/a')],
    snap, {},
  )
  assert.equal(quiet[0]?.kind === 'repo' ? quiet[0].containsCurrent : undefined, false)
  const active = arrangeSections(
    [group('ws-main', 'main', '/repo'), group('ws-a', 'feat/a', '/wt/a', true)],
    snap, {},
  )
  assert.equal(active[0]?.kind === 'repo' ? active[0].containsCurrent : undefined, true)
})

test('repository sections expose their workspace ids in durable order', () => {
  const sections = arrangeSections(
    [group('ws-wt', 'feat/a', '/wt/a'), group('ws-main', 'main', '/repo')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/a', 'feat/a', 'ws-wt'),
    ])]),
    {},
  )
  const section = sections[0]
  assert.ok(section?.kind === 'repo')
  assert.deepEqual(section.workspaceIds, ['ws-wt', 'ws-main'], 'durable order, not display order')
})

test('planWorkspaceMove reorders a single workspace against the durable order', () => {
  const order = ['a', 'b', 'c']
  assert.deepEqual(planWorkspaceMove(order, ['c'], { id: 'a', half: 'before' }), { ids: ['c'], anchor: 'a' })
  assert.deepEqual(planWorkspaceMove(order, ['a'], { id: 'b', half: 'after' }), { ids: ['a'], anchor: 'c' })
  assert.equal(planWorkspaceMove(order, ['a'], { id: 'a', half: 'before' }), undefined, 'dropping on itself')
  assert.equal(planWorkspaceMove(order, ['a'], { id: 'b', half: 'before' }), undefined, 'already there')
  assert.deepEqual(planWorkspaceMove(order, ['a'], { id: 'c', half: 'after' }), { ids: ['a'], anchor: undefined }, 'to the end')
})

test('planWorkspaceMove moves a repository block as one unit, keeping its order', () => {
  const order = ['a1', 'a2', 'b1', 'c1']
  // block a (a1,a2) dropped after the b row: it lands before c1 and keeps a1,a2 order.
  assert.deepEqual(planWorkspaceMove(order, ['a1', 'a2'], { id: 'b1', half: 'after' }), { ids: ['a1', 'a2'], anchor: 'c1' })
  // block c dropped before a: anchor is a's first workspace.
  assert.deepEqual(planWorkspaceMove(order, ['c1'], { id: 'a1', half: 'before' }), { ids: ['c1'], anchor: 'a1' })
  // a block dropped onto one of its own rows never reorders.
  assert.equal(planWorkspaceMove(order, ['a1', 'a2'], { id: 'a2', half: 'before' }), undefined)
  // a block already in front of its target is a no-op.
  assert.equal(planWorkspaceMove(order, ['a1', 'a2'], { id: 'b1', half: 'before' }), undefined)
})
