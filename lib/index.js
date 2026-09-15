import { WorktreeSyncService } from "./service.js";
export const name = 'left-panel';
export const inject = ['workspaceRegistry', 'connection', 'webServer', 'sessionPersistence'];
export async function apply(ctx) {
    const service = new WorktreeSyncService(ctx);
    await service.start();
}
//# sourceMappingURL=index.js.map