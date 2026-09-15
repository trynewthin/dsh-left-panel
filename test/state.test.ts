import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EMPTY_STATE, StateStore, defaultStateFile, loadState, normalizeState, saveState } from '../src/state.ts'

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'left-panel-state-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('missing file loads as the empty state', async () => {
  await withTempDir(async (dir) => {
    const loaded = await loadState(join(dir, 'nested', 'state.json'))
    assert.deepEqual(loaded, { state: EMPTY_STATE })
  })
})

test('save then load round-trips and creates parent directories', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'a', 'b', 'state.json')
    const state = {
      version: 1 as const,
      ignored: ['/wt/x'],
      knownWorktrees: { '/wt/y': '/repo/.git' },
      autoTitles: { '/wt/y': 'feat/y' },
      repoNames: { '/repo/.git': '项目别名' },
    }
    await saveState(file, state)
    const loaded = await loadState(file)
    assert.deepEqual(loaded.state, state)
    assert.equal(loaded.error, undefined)
    assert.equal((await readFile(file, 'utf8')).endsWith('\n'), true)
  })
})

test('a corrupt file yields the empty state plus an error', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'state.json')
    await writeFile(file, '{ not json')
    const loaded = await loadState(file)
    assert.deepEqual(loaded.state, EMPTY_STATE)
    assert.match(loaded.error ?? '', /invalid JSON/)
  })
})

test('normalizeState drops malformed fields and duplicate ignores', () => {
  const state = normalizeState({
    ignored: ['/a', '/a', 3, '/b'],
    knownWorktrees: { '/wt': '/repo', broken: 1 },
    autoTitles: null,
    repoNames: { ok: 'alias', bad: 7 },
  })
  assert.deepEqual(state, {
    version: 1,
    ignored: ['/a', '/b'],
    knownWorktrees: { '/wt': '/repo' },
    autoTitles: {},
    repoNames: { ok: 'alias' },
  })
  assert.deepEqual(normalizeState('nope'), EMPTY_STATE)
})

test('StateStore applies updates in order and persists each one', async () => {
  await withTempDir(async (dir) => {
    const store = new StateStore(join(dir, 'state.json'))
    assert.equal(await store.load(), undefined)
    await Promise.all([
      store.update(state => ({ ...state, ignored: [...state.ignored, '/one'] })),
      store.update(state => ({ ...state, ignored: [...state.ignored, '/two'] })),
    ])
    assert.deepEqual(store.current.ignored, ['/one', '/two'])
    const reloaded = new StateStore(join(dir, 'state.json'))
    await reloaded.load()
    assert.deepEqual(reloaded.current.ignored, ['/one', '/two'])
  })
})

test('defaultStateFile honours DSH_HOME', () => {
  assert.equal(defaultStateFile({ DSH_HOME: '/custom' }), '/custom/storages/dsh-left-panel.json')
  assert.match(defaultStateFile({}), /\.dsh\/storages\/dsh-left-panel\.json$/)
})
