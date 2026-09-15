import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseWorktreePorcelain, scrubbedEnv } from '../src/git.ts'

const SAMPLE = [
  'worktree /repo',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /repo-wt/feature',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/feat/left-panel',
  'locked reason: in use',
  '',
  'worktree /repo-wt/detached',
  'HEAD 3333333333333333333333333333333333333333',
  'detached',
  '',
  'worktree /repo-wt/gone',
  'HEAD 4444444444444444444444444444444444444444',
  'branch refs/heads/old',
  'prunable gitdir file points to non-existent location',
  '',
].join('\n')

test('parses main, linked, detached, locked and prunable worktrees', () => {
  const entries = parseWorktreePorcelain(SAMPLE)
  assert.equal(entries.length, 4)
  assert.deepEqual(entries[0], {
    path: '/repo', head: '1111111111111111111111111111111111111111', branch: 'main',
    detached: false, bare: false, locked: false, prunable: false,
  })
  assert.equal(entries[1]?.branch, 'feat/left-panel')
  assert.equal(entries[1]?.locked, true)
  assert.equal(entries[2]?.detached, true)
  assert.equal(entries[2]?.branch, null)
  assert.equal(entries[3]?.prunable, true)
})

test('parses a bare repository entry and CRLF line endings', () => {
  const entries = parseWorktreePorcelain('worktree /bare.git\r\nbare\r\n\r\nworktree /wt\r\nHEAD abc\r\nbranch refs/heads/x\r\n')
  assert.equal(entries[0]?.bare, true)
  assert.equal(entries[0]?.head, '')
  assert.equal(entries[1]?.branch, 'x')
})

test('tolerates missing trailing blank line and empty input', () => {
  assert.deepEqual(parseWorktreePorcelain(''), [])
  const entries = parseWorktreePorcelain('worktree /only\nHEAD deadbeef\nbranch refs/heads/main')
  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.branch, 'main')
})

test('scrubbed environment drops credential-looking variables and disables prompts', () => {
  const env = scrubbedEnv({ PATH: '/usr/bin', GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y', OPENAI_API_KEY: 'z', HOME: '/home/u' })
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.HOME, '/home/u')
  assert.equal('GITHUB_TOKEN' in env, false)
  assert.equal('AWS_SECRET_ACCESS_KEY' in env, false)
  assert.equal('OPENAI_API_KEY' in env, false)
  assert.equal(env.GIT_TERMINAL_PROMPT, '0')
})
