/**
 * Host entry. Requires the Workspace registry, the carrier-neutral Connection
 * registries, and Session persistence; in a profile without Connection the
 * plugin stays inactive.
 *
 * `webServer` is deliberately absent: every endpoint registers into
 * `ctx.connection.fetch`, which exists independently of any physical carrier.
 * Connection mounts the `/api` browser transport (and applies the Host/Origin
 * fence) whenever a Web server is present, so a Web profile keeps serving
 * these routes while a carrier-neutral deployment is no longer blocked from
 * loading the plugin.
 */
import type { Context } from '@deepseek-ai/cordis'

import { WorktreeSyncService } from './service.ts'

export const name = 'left-panel'
export const inject = ['workspaceRegistry', 'connection', 'sessionPersistence']

export async function apply(ctx: Context): Promise<void> {
  const service = new WorktreeSyncService(ctx)
  await service.start()
}
