import { test } from 'node:test'
import assert from 'node:assert/strict'

import { EMPTY_PROJECT_AREAS, projectAreasOrEmpty, type ProjectArea } from '../src/client/project-areas.ts'

test('pre-section persisted views reuse one stable empty project-area value', () => {
  assert.strictEqual(projectAreasOrEmpty(undefined), EMPTY_PROJECT_AREAS)
  assert.strictEqual(projectAreasOrEmpty(undefined), projectAreasOrEmpty(undefined))
})

test('current persisted views retain their project-area identity', () => {
  const areas: readonly ProjectArea[] = [{ id: 'work', name: 'Work', repoKeys: ['repo-a'] }]
  assert.strictEqual(projectAreasOrEmpty(areas), areas)
})
