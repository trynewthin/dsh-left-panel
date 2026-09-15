/**
 * Host entry. Requires the Workspace registry and the Web connection; in a
 * profile without a browser connection (headless) the plugin stays inactive.
 * `webServer` is listed because the connection's channel registry mounts the
 * physical route through the registering fiber's own context.
 */
import type { Context } from '@deepseek-ai/cordis'

import { WorktreeSyncService } from './service.ts'

export const name = 'left-panel'
export const inject = ['workspaceRegistry', 'connection', 'webServer', 'sessionPersistence']

export async function apply(ctx: Context): Promise<void> {
  const service = new WorktreeSyncService(ctx)
  await service.start()
}
