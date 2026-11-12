/**
 * Drives the browser schedule catalog against a fake client context: the
 * observable owns one Remote read at a time and must not let a read from a
 * previous host generation, or one that settles after disposal, publish rows.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'

import { createScheduleCatalogClient, EMPTY_SCHEDULE_CATALOG } from '../src/client/schedules.ts'
import { activeScheduleSessionIds } from '../src/client/tree.ts'

type Listener = () => void

type CatalogResult =
  | { readonly ok: true; readonly value: ScheduleCatalogEntry[] }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

interface FakeCatalog {
  readonly ctx: Context
  readonly reads: readonly ((result: CatalogResult) => void)[]
  readonly changedListeners: ReadonlySet<Listener>
  readonly resetListeners: ReadonlySet<Listener>
  resolveRead(index: number, result: CatalogResult): void
  changed(): void
  reset(): void
}

/** One active reminder delivering to `sessionId`; branding is irrelevant to the source. */
function entry(sessionId: string): ScheduleCatalogEntry {
  return {
    id: `id-${sessionId}`,
    kind: 'after',
    title: sessionId,
    prompt: sessionId,
    afterSeconds: 60,
    scheduledAt: '2026-01-01T00:00:00Z',
    target: { kind: 'session', sessionId },
    involvedSessionIds: [sessionId],
    status: 'active',
  } as unknown as ScheduleCatalogEntry
}

function active(entries: readonly ScheduleCatalogEntry[]): CatalogResult {
  return { ok: true, value: [...entries] }
}

/**
 * Drain the source's then/catch/finally chain without a wall-clock wait: each
 * turn releases the next microtask the chain queued.
 */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve()
}

/** The ES2024 static this package's ES2022 lib omits; Node 24 provides it at runtime. */
interface PromiseResolvers {
  withResolvers<U>(): { promise: Promise<U>; resolve: (value: U) => void }
}

const promiseStatics = Promise as unknown as PromiseResolvers

/** Typed `Promise.withResolvers` for the test's deferred catalog reads. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  return promiseStatics.withResolvers<T>()
}

function fakeCatalog(): FakeCatalog {
  const reads: ((result: CatalogResult) => void)[] = []
  const changedListeners = new Set<Listener>()
  const resetListeners = new Set<Listener>()
  const ctx = {
    remote: {
      schedule: {
        catalog: () => {
          const read = deferred<CatalogResult>()
          reads.push(read.resolve)
          return read.promise
        },
      },
      $on: (_event: string, listener: Listener) => {
        changedListeners.add(listener)
        return () => { changedListeners.delete(listener) }
      },
    },
    on: (_event: string, listener: Listener) => {
      resetListeners.add(listener)
      return () => { resetListeners.delete(listener) }
    },
  } as unknown as Context
  return {
    ctx,
    reads,
    changedListeners,
    resetListeners,
    resolveRead(index, result) {
      const resolve = reads[index]
      if (resolve === undefined) throw new Error(`no catalog read at index ${index}`)
      resolve(result)
    },
    changed() {
      for (const listener of changedListeners) listener()
    },
    reset() {
      for (const listener of resetListeners) listener()
    },
  }
}

test('a connection reset discards the previous host read still in flight', async () => {
  const fake = fakeCatalog()
  const client = createScheduleCatalogClient(fake.ctx)
  const stop = client.start()
  const unsubscribe = client.source.subscribe(() => {})
  assert.equal(fake.reads.length, 1)

  fake.reset()
  assert.equal(fake.reads.length, 2, 'a reset starts a fresh read')
  fake.resolveRead(1, active([entry('new-host')]))
  await flush()
  assert.deepEqual(client.source.getSnapshot().map(item => item.target.kind === 'new' ? 'new' : item.target.sessionId), ['new-host'])

  fake.resolveRead(0, active([entry('old-host')]))
  await flush()
  assert.deepEqual(client.source.getSnapshot().map(item => item.target.kind === 'new' ? 'new' : item.target.sessionId), ['new-host'], 'stale generation never publishes')

  unsubscribe()
  stop()
})

test('a catalog change arriving during a read queues exactly one follow-up read', async () => {
  const fake = fakeCatalog()
  const client = createScheduleCatalogClient(fake.ctx)
  const stop = client.start()
  const unsubscribe = client.source.subscribe(() => {})
  assert.equal(fake.reads.length, 1)

  fake.changed()
  fake.changed()
  assert.equal(fake.reads.length, 1, 'coalesced while the read is in flight')

  fake.resolveRead(0, active([entry('first')]))
  await flush()
  assert.equal(fake.reads.length, 2, 'the queued change starts one follow-up read')

  fake.resolveRead(1, active([entry('second')]))
  await flush()
  assert.deepEqual(client.source.getSnapshot().map(item => item.target.kind === 'new' ? 'new' : item.target.sessionId), ['second'])

  unsubscribe()
  stop()
})

test('a failed refresh keeps the last successful rows instead of blanking the marks', async () => {
  const fake = fakeCatalog()
  const client = createScheduleCatalogClient(fake.ctx)
  const stop = client.start()
  const unsubscribe = client.source.subscribe(() => {})

  fake.resolveRead(0, active([entry('kept')]))
  await flush()
  assert.equal(client.source.getSnapshot().length, 1)

  fake.changed()
  fake.resolveRead(1, { ok: false, error: { code: 'internal', message: 'offline' } })
  await flush()
  assert.deepEqual(client.source.getSnapshot().map(item => item.target.kind === 'new' ? 'new' : item.target.sessionId), ['kept'])

  unsubscribe()
  stop()
})

test('disposal releases both listeners and suppresses a late read', async () => {
  const fake = fakeCatalog()
  const client = createScheduleCatalogClient(fake.ctx)
  const stop = client.start()
  const unsubscribe = client.source.subscribe(() => {})
  assert.equal(fake.reads.length, 1)

  stop()
  assert.equal(fake.changedListeners.size, 0)
  assert.equal(fake.resetListeners.size, 0)

  fake.resolveRead(0, active([entry('late')]))
  await flush()
  assert.equal(client.source.getSnapshot(), EMPTY_SCHEDULE_CATALOG)

  unsubscribe()
})

test('only active tasks mark their delivery session', () => {
  const running = entry('active')
  const paused = { ...running, status: 'paused' as const }
  const ended = { ...running, status: 'ended' as const }
  const created = { ...running, target: { kind: 'new', create: {} } as const }
  assert.deepEqual(
    [...activeScheduleSessionIds([running, { ...running, id: entry('duplicate').id }, paused, ended, created])],
    ['active'],
  )
})
