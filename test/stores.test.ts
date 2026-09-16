import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_PROJECT_AREAS, moveProjectAreaOrder, projectAreasOrEmpty, type ProjectArea,
} from '../src/client/project-areas.ts'

test('pre-section persisted views reuse one stable empty project-area value', () => {
  assert.strictEqual(projectAreasOrEmpty(undefined), EMPTY_PROJECT_AREAS)
  assert.strictEqual(projectAreasOrEmpty(undefined), projectAreasOrEmpty(undefined))
})

test('current persisted views retain their project-area identity', () => {
  const areas: readonly ProjectArea[] = [{ id: 'work', name: 'Work', repoKeys: ['repo-a'] }]
  assert.strictEqual(projectAreasOrEmpty(areas), areas)
})

test('moves a whole project area before or after another area', () => {
  assert.deepEqual(moveProjectAreaOrder(['a', 'b', 'c'], 'a', 'c', 'before'), ['b', 'a', 'c'])
  assert.deepEqual(moveProjectAreaOrder(['a', 'b', 'c'], 'a', 'c', 'after'), ['b', 'c', 'a'])
  assert.deepEqual(moveProjectAreaOrder(['a', 'b'], 'a', 'a', 'after'), ['a', 'b'])
})
