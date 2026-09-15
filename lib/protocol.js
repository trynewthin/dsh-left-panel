/**
 * Wire contract between the plugin's host half and its browser half. The host
 * answers every endpoint with a fresh {@link WorktreeSnapshot} so the client
 * never has to merge partial updates.
 *
 * Transport: exact Fetch routes on the shared, authenticated `/api` channel
 * (`/api/left-panel/<endpoint>`), speaking the Connection RPC envelope so the
 * browser half can use `connection.rpc.call(CHANNEL, methodOf(endpoint), payload)`.
 *
 * The plugin keeps no per-repository switches: registering a repository's
 * worktrees is its default behaviour, and reconciliation runs on its own
 * (startup, workspace changes, git filesystem events, a slow poll), so the
 * browser only asks for a snapshot or for a refresh.
 */
/** Shared Connection channel the plugin's routes live under. */
export const CHANNEL = '/api';
/** First path segment of every endpoint of this plugin below {@link CHANNEL}. */
export const ENDPOINT_PREFIX = 'left-panel';
export const ENDPOINTS = ['list', 'sync', 'setRepoName'];
/** The method name the browser passes to `connection.rpc.call`; also the route path below {@link CHANNEL}. */
export function methodOf(endpoint) {
    return `${ENDPOINT_PREFIX}/${endpoint}`;
}
//# sourceMappingURL=protocol.js.map