/**
 * Browser-side view of the Host's reminder catalog. DSH 0.2 dropped the
 * per-Session `schedule` projection, so the Host catalog
 * (`schedule/catalog`) is the authoritative source for every Session's
 * active reminders. One observable serves the whole sidebar: it reads on the
 * first subscriber and refreshes on `schedule/changed`, while a connection
 * reset clears the old host's rows before the new host answers.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

/** Catalog value before the first successful read: no Session is marked. */
export const EMPTY_SCHEDULE_CATALOG: readonly ScheduleCatalogEntry[] = []

export interface ScheduleCatalogClient {
  readonly source: HostObservable<readonly ScheduleCatalogEntry[]>
  /** Follow catalog invalidations; the returned disposer releases them. */
  start(): () => void
}

export function createScheduleCatalogClient(ctx: Context): ScheduleCatalogClient {
  let snapshot = EMPTY_SCHEDULE_CATALOG
  const listeners = new Set<() => void>()
  let reading = false
  let queued = false
  // Bumped on every invalidation and once on disposal: a read that started in
  // an older generation must never publish its rows over the current host.
  let generation = 0
  let disposed = false

  const publish = (next: readonly ScheduleCatalogEntry[]): void => {
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  const refresh = (): void => {
    if (disposed) return
    const schedule = ctx.remote.schedule
    if (reading) {
      queued = true
      return
    }
    reading = true
    const current = generation
    schedule.catalog().then((result) => {
      if (disposed || current !== generation) return
      if (result.ok) {
        publish(result.value)
        return
      }
      // Keep the last successful rows (the shipped catalog does the same);
      // surface the failed refresh instead of leaving it silent.
      console.warn('left-panel: schedule catalog read failed:', result.error.message)
    }).catch((reason: unknown) => {
      if (disposed || current !== generation) return
      console.warn('left-panel: schedule catalog read failed:', reason)
    }).finally(() => {
      if (disposed || current !== generation) return
      reading = false
      if (queued) {
        queued = false
        refresh()
      }
    })
  }

  const invalidate = (): void => {
    generation += 1
    reading = false
    queued = false
    publish(EMPTY_SCHEDULE_CATALOG)
    refresh()
  }

  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        if (listeners.size === 1) refresh()
        return () => { listeners.delete(listener) }
      },
    },
    start() {
      const changed = ctx.remote.$on('schedule/changed', refresh)
      const reset = ctx.on('connection/reset', invalidate)
      return () => {
        disposed = true
        generation += 1
        changed()
        reset()
      }
    },
  }
}
