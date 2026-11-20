import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProjectReferenceSource, PROJECT_REFERENCE_SOURCE } from '../src/client/project-references.ts'
import { referenceCategories, referenceMenuSections } from '../src/client/reference-menu.ts'
import type { RepoInfo, WorktreeInfo, WorktreeSnapshot } from '../src/protocol.ts'

function checkout(path: string, branch: string, flags: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    path, title: branch, branch, head: 'abc1234', main: false, detached: false,
    exists: true, bare: false, locked: false, prunable: false, workspaceId: null, ...flags,
  }
}

function sourceFor(repos: RepoInfo[]) {
  const snapshot: WorktreeSnapshot = { repos, workspaceRepo: {}, syncedAt: 1 }
  return createProjectReferenceSource(() => snapshot, {
    projects: () => 'Projects', worktrees: name => `Worktrees in ${name}`,
  })
}

const signal = new AbortController().signal

test('a project pick serializes the available main worktree path even when a linked worktree is listed first', async () => {
  const main = checkout('/fixtures/Project Atlas', 'main', { main: true })
  const linked = checkout('/fixtures/atlas-search', 'feature/search')
  const source = sourceFor([{ key: 'atlas', name: 'Atlas', mainPath: main.path, worktrees: [linked, main] }])
  const [project] = await source.candidates(undefined, { query: 'atl', drilled: false, signal })
  assert.ok(project)
  assert.equal(project.name, 'Atlas')
  assert.equal(project.section, 'Projects')
  assert.equal(project.drill, true)
  const result = source.onPick({ candidate: project, action: 'pick' })
  assert.ok(result && typeof result !== 'string' && 'insert' in result)
  assert.equal(result.insert.label, 'Atlas')
  assert.equal(result.insert.clipboardText, main.path)
  assert.equal(await source.codec.serialize(result.insert.ref), main.path)
})

test('drilling shows only available worktrees from the chosen project and resolves their own paths', async () => {
  const main = checkout('/fixtures/Atlas "primary"', 'main', { main: true })
  const linked = checkout('/fixtures/atlas-search', 'feature/search')
  const missing = checkout('/fixtures/atlas-missing', 'feature/missing', { exists: false })
  const other = checkout('/fixtures/orbit', 'main', { main: true })
  const source = sourceFor([
    { key: 'atlas', name: 'Atlas', mainPath: main.path, worktrees: [main, linked, missing] },
    { key: 'orbit', name: 'Orbit', mainPath: other.path, worktrees: [other] },
  ])
  const [project] = await source.candidates(undefined, { query: 'Atlas', drilled: false, signal })
  assert.ok(project)
  const outcome = source.onPick({ candidate: project, action: 'drill' })
  assert.ok(outcome && typeof outcome !== 'string' && 'text' in outcome && outcome.continue)
  const query = outcome.text.slice(2)
  assert.match(query, /%22primary%22\/$/u)
  const worktrees = await source.candidates(undefined, { query, drilled: true, signal })
  assert.deepEqual(worktrees.map(item => item.name), ['main', 'feature/search'])
  const [search] = await source.candidates(undefined, { query: query + 'search', drilled: true, signal })
  assert.equal(search?.section, 'Worktrees in Atlas')
  assert.ok(search)
  const result = source.onPick({ candidate: search, action: 'pick' })
  assert.ok(result && typeof result !== 'string' && 'insert' in result)
  assert.equal(await source.codec.serialize(result.insert.ref), linked.path)
})

test('reference navigation orders sections while retaining the original controller positions', () => {
  const sections = referenceMenuSections([
    { source: 'reference', status: 'ready', items: [
      { name: 'README.md', icon: 'file' }, { name: 'Conversation', icon: 'session' },
      { name: 'src', icon: 'folder' },
    ] },
    { source: 'messages', status: 'ready', items: [{ name: 'Previous message' }] },
    { source: PROJECT_REFERENCE_SOURCE, status: 'ready', items: [{ name: 'Atlas', icon: 'folder', drill: true }] },
    { source: 'pending', status: 'pending', items: [{ name: 'Stale candidate' }] },
  ])
  const ordered = referenceCategories.flatMap(category => sections[category])
  assert.deepEqual(ordered.map(row => [row.item.name, row.source, row.index]), [
    ['README.md', 'reference', 0], ['src', 'reference', 2], ['Atlas', PROJECT_REFERENCE_SOURCE, 0],
    ['Conversation', 'reference', 1], ['Previous message', 'messages', 0],
  ])
})
