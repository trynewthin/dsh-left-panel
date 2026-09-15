import { test } from 'node:test'
import assert from 'node:assert/strict'

import { arrangeSections, repoGroupKey, type GroupNode } from '../src/client/tree.ts'
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

function worktree(path: string, title: string, workspaceId: string | null, main = false, ignored = false): WorktreeInfo {
  return {
    path, head: 'a'.repeat(40), branch: title, detached: false, main, bare: false,
    locked: false, prunable: false, exists: true, title, workspaceId, ignored,
  }
}

function repo(key: string, worktrees: WorktreeInfo[]): RepoInfo {
  return {
    key,
    name: key.split('/').slice(-2, -1)[0] ?? key,
    mainPath: worktrees.find(w => w.main)?.path ?? '',
    auto: true,
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
  return { repos, workspaceRepo, syncedAt: 1, syncing: false }
}

test('folds worktree groups under their repository in host order and sorts them main-first', () => {
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
  assert.deepEqual(first.groups.map(g => g.label), ['main', 'feat/login', 'fix/sidebar'])
  assert.equal(first.ghosts.length, 0)
  const second = sections[1]
  assert.ok(second?.kind === 'group')
  assert.equal(second.group.label, 'plain')
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

test('ghost worktrees collect unregistered entries; a collapsed repo hides its children', () => {
  const snap = snapshot([repo('/repo/.git', [
    worktree('/repo', 'main', 'ws-main', true),
    worktree('/wt/gone', 'gone', null),
    worktree('/wt/ignored', 'ignored', null, false, true),
  ])])
  const sections = arrangeSections([group('ws-main', 'main', '/repo')], snap, {})
  const repoSection = sections[0]
  assert.ok(repoSection?.kind === 'repo')
  assert.deepEqual(repoSection.ghosts.map(g => g.title), ['gone', 'ignored'])
  assert.equal(repoSection.expanded, true)

  const collapsed = arrangeSections([group('ws-main', 'main', '/repo')], snap, { [repoGroupKey('/repo/.git')]: false })
  const hidden = collapsed[0]
  assert.ok(hidden?.kind === 'repo')
  assert.equal(hidden.expanded, false)
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
