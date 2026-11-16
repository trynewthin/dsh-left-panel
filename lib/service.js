/**
 * Host half of the plugin: keeps the Workspace registry in step with the git
 * worktrees of every registered repository and answers the browser half.
 *
 * Triggers for a reconcile: startup, `domain/changed` on the workspace domain,
 * filesystem events under each repository's common git dir, a slow poll, the
 * removal grace timer, and explicit client requests. Reconciles are
 * serialized; triggers that arrive mid-run coalesce into one follow-up run.
 */
import { watch } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { addWorktree, canonical, deleteBranch, isDirty, isDirectory, isMerged, isValidBranchName, listBranches, listWorktrees, locate, removeWorktree, renameCurrentBranch, } from "./git.js";
import { CHANNEL, ENDPOINTS, methodOf, } from "./protocol.js";
import { StateStore, defaultStateFile } from "./state.js";
import { planSync, worktreeTitle, } from "./sync.js";
const DEFAULT_POLL_MS = 30_000;
const DEFAULT_DEBOUNCE_MS = 400;
/** How long a self-issued delete stays recognizable in the change stream. */
const SELF_DELETE_TTL_MS = 5_000;
/** Upper bound on a user-given repository display name. */
const REPO_NAME_MAX = 120;
function ok(value) {
    return { ok: true, value };
}
function fail(code, message, details = {}) {
    return { ok: false, error: { code, message, details } };
}
function stringField(payload, key) {
    if (typeof payload !== 'object' || payload === null)
        return undefined;
    const value = payload[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
}
function sameState(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
function parseEnvelope(body) {
    if (typeof body !== 'object' || body === null)
        return undefined;
    const record = body;
    if (record.type !== 'client-request' || typeof record.rpcId !== 'string' || typeof record.method !== 'string')
        return undefined;
    return { rpcId: record.rpcId, method: record.method, payload: record.payload };
}
/** The Connection RPC response envelope the browser's `rpc.call` parses. */
function respond(rpcId, result) {
    return Response.json({ type: 'server-response', rpcId, result });
}
export class WorktreeSyncService {
    ctx;
    store;
    pollMs;
    debounceMs;
    removalGraceMs;
    registry = [];
    repos = [];
    failedRepos = new Map();
    pendingRemoval = new Map();
    syncedAt = 0;
    dirty = false;
    running;
    watchers = new Map();
    selfDeletes = new Set();
    /**
     * Worktree paths whose explicit removal is still running, with the number of
     * routes holding them. Their tombstones must never be lifted as a "native
     * re-add" while the Workspace record happens to still exist.
     */
    deletePending = new Map();
    /**
     * Tombstones that apply immediately, before their durable write lands: a
     * deletion the user just performed must not render as "not registered" for
     * the moment between the registry change and the state-file write.
     */
    ignoring = new Set();
    debounceTimer;
    graceTimer;
    pollTimer;
    disposed = false;
    constructor(ctx, options = {}) {
        this.ctx = ctx;
        this.store = new StateStore(options.stateFile ?? defaultStateFile());
        this.pollMs = options.pollMs ?? DEFAULT_POLL_MS;
        this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
        this.removalGraceMs = options.removalGraceMs;
    }
    /** Load memory, attach to the registry and the connection, and kick off the first reconcile. */
    async start() {
        const loadError = await this.store.load();
        if (loadError !== undefined)
            this.ctx.logger.warn(`left-panel: state file unreadable, starting empty: ${loadError}`);
        this.ctx.effect(() => this.ctx.on('domain/changed', change => this.onDomainChanged(change)), 'left-panel: workspace changes');
        // Exact Fetch routes on the shared, authenticated /api channel: the
        // connection applies its Host/Origin fence and browser authentication
        // before dispatching, and registering them touches nothing but the
        // connection's own route table.
        for (const endpoint of ENDPOINTS) {
            const method = methodOf(endpoint);
            const route = {
                path: `${CHANNEL}/${method}`,
                methods: ['POST'],
                requestBody: 'buffered',
                fetch: request => this.serve(endpoint, method, request),
            };
            this.ctx.effect(() => this.ctx.connection.fetch.register(route), `left-panel: ${route.path}`);
        }
        this.ctx.effect(() => () => this.dispose(), 'left-panel: worktree sync');
        this.pollTimer = setInterval(() => this.requestSync(), this.pollMs);
        this.pollTimer.unref();
        this.requestSync();
    }
    /** Decode one RPC envelope, dispatch it, and answer in the envelope the browser expects. */
    async serve(endpoint, method, request) {
        const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
        if (contentType !== 'application/json')
            return new Response('content type must be application/json', { status: 415 });
        let body;
        try {
            body = await request.json();
        }
        catch {
            return new Response('body is not JSON', { status: 400 });
        }
        const envelope = parseEnvelope(body);
        if (envelope === undefined)
            return respond('invalid-request', fail('gateway/bad-request', 'invalid client-request message'));
        if (envelope.method !== method) {
            return respond(envelope.rpcId, fail('gateway/bad-request', `method ${JSON.stringify(envelope.method)} does not match endpoint ${JSON.stringify(method)}`));
        }
        return respond(envelope.rpcId, await this.handle(endpoint, envelope.payload));
    }
    /** Current view for the browser half; never touches git. */
    snapshot() {
        const state = this.store.current;
        const byPath = new Map(this.registry.map(workspace => [workspace.path, workspace]));
        const workspaceRepo = {};
        const repos = this.repos.map((repo) => {
            const worktrees = [];
            for (const worktree of repo.worktrees) {
                if (worktree.bare)
                    continue;
                const workspaceId = byPath.get(worktree.path)?.id ?? null;
                if (workspaceId !== null)
                    workspaceRepo[workspaceId] = repo.key;
                worktrees.push({
                    path: worktree.path,
                    head: worktree.head,
                    branch: worktree.branch,
                    detached: worktree.detached,
                    main: worktree.main,
                    bare: false,
                    locked: worktree.locked,
                    prunable: worktree.prunable,
                    exists: worktree.exists,
                    title: worktreeTitle(worktree),
                    workspaceId,
                });
            }
            return {
                key: repo.key,
                name: state.repoNames[repo.key] ?? (basename(repo.mainPath) || repo.mainPath),
                mainPath: repo.mainPath,
                worktrees,
                deletedWorktrees: state.deletedWorktrees
                    .filter(entry => entry.repoKey === repo.key)
                    .map(({ path, branch, title }) => ({ path, branch, title })),
            };
        });
        for (const [key, failed] of this.failedRepos) {
            repos.push({
                key,
                name: state.repoNames[key] ?? (basename(failed.mainPath) || failed.mainPath),
                mainPath: failed.mainPath,
                worktrees: [],
                deletedWorktrees: state.deletedWorktrees
                    .filter(entry => entry.repoKey === key)
                    .map(({ path, branch, title }) => ({ path, branch, title })),
                error: failed.error,
            });
        }
        return { repos, workspaceRepo, syncedAt: this.syncedAt };
    }
    /** Schedule a reconcile shortly; repeated requests collapse into one run. */
    requestSync() {
        if (this.disposed)
            return;
        this.dirty = true;
        if (this.debounceTimer !== undefined)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            void this.run();
        }, this.debounceMs);
    }
    /** Reconcile now and wait for it. */
    async syncNow() {
        if (this.disposed)
            return;
        this.dirty = true;
        await this.run();
    }
    run() {
        if (this.running !== undefined)
            return this.running;
        this.running = (async () => {
            while (this.dirty && !this.disposed) {
                this.dirty = false;
                try {
                    await this.reconcileOnce();
                }
                catch (error) {
                    this.ctx.logger.warn(`left-panel: reconcile failed: ${String(error)}`);
                }
            }
        })().finally(() => { this.running = undefined; });
        return this.running;
    }
    /** The union of durable tombstones and the ones applied this instant. */
    ignoredPaths() {
        return new Set([...this.store.current.ignored, ...this.ignoring]);
    }
    async reconcileOnce() {
        await this.scan();
        const state = this.store.current;
        const memory = {
            ignored: this.ignoredPaths(),
            knownWorktrees: new Map(Object.entries(state.knownWorktrees)),
            autoTitles: new Map(Object.entries(state.autoTitles)),
            pendingRemoval: this.pendingRemoval,
        };
        const plan = planSync(this.registry, this.repos, memory, Date.now(), this.removalGraceMs);
        await this.apply(plan, state);
        this.pendingRemoval = plan.pendingRemoval;
        this.scheduleGrace(plan.nextCheckAt);
        this.updateWatchers();
        this.syncedAt = Date.now();
    }
    /** Read the registry and ask git about every worktree-root Workspace, grouped by repository. */
    async scan() {
        const registry = [];
        const members = new Map();
        for (const workspace of this.ctx.workspaceRegistry.list()) {
            registry.push({ id: workspace.id, path: workspace.path, title: workspace.title });
            if (!(await isDirectory(workspace.path)))
                continue;
            const location = await locate(workspace.path);
            if (location === null || !location.isRoot)
                continue;
            const list = members.get(location.commonDir);
            if (list === undefined)
                members.set(location.commonDir, [workspace.path]);
            else
                list.push(workspace.path);
        }
        const repos = [];
        const failed = new Map();
        for (const [key, paths] of members) {
            const cwd = paths[0];
            if (cwd === undefined)
                continue;
            try {
                const entries = await listWorktrees(cwd);
                const worktrees = [];
                for (const [index, entry] of entries.entries()) {
                    const path = await canonical(entry.path);
                    worktrees.push({ ...entry, path, exists: await isDirectory(path), main: index === 0 });
                }
                const mainPath = worktrees.find(worktree => worktree.main)?.path ?? cwd;
                repos.push({ key, mainPath, worktrees });
            }
            catch (error) {
                failed.set(key, { mainPath: cwd, error: String(error) });
                this.ctx.logger.warn(`left-panel: git worktree list failed in ${cwd}: ${String(error)}`);
            }
        }
        this.registry = registry;
        this.repos = repos;
        this.failedRepos = failed;
    }
    async apply(plan, state) {
        const known = new Map(plan.knownWorktrees);
        const titles = { ...state.autoTitles };
        const released = new Set(plan.releaseIgnored);
        // Sessions that were created by naming a directory rather than a Workspace
        // (another tool's launch, an explicit cwd) never entered any ledger, so
        // they sit under Ungrouped even though a Workspace now covers their
        // directory. Re-adopt them per registered worktree; attachSession
        // re-validates the canonical cwd, so this can never move a session into the
        // wrong directory. Running on every reconcile makes the grouping self-healing.
        const storedSessions = await this.sessionsByDirectory();
        for (const [path, workspaceId] of this.registeredWorktreePaths()) {
            const candidates = storedSessions.get(path);
            if (candidates === undefined)
                continue;
            const workspace = this.ctx.workspaceRegistry.get(workspaceId);
            if (workspace !== undefined)
                await this.adoptExistingSessions(workspace, candidates);
        }
        for (const action of plan.actions) {
            switch (action.type) {
                case 'create': {
                    // The plan was computed from an earlier scan; a delete that landed in
                    // the meantime must win over registering the worktree again.
                    if (this.ignoredPaths().has(action.path)) {
                        this.ctx.logger.info(`left-panel: not registering ${action.path}; it was removed explicitly`);
                        break;
                    }
                    try {
                        const workspace = await this.ctx.workspaceRegistry.create(action.path, action.title);
                        known.set(action.path, action.repoKey);
                        titles[action.path] = action.title;
                        await this.placeAfterRepo(workspace.id, action.repoKey, action.mainWorkspaceId);
                        this.ctx.logger.info(`left-panel: registered worktree ${action.path} as "${action.title}"`);
                        await this.adoptExistingSessions(workspace, storedSessions.get(action.path) ?? []);
                    }
                    catch (error) {
                        this.ctx.logger.warn(`left-panel: could not register ${action.path}: ${String(error)}`);
                    }
                    break;
                }
                case 'delete': {
                    this.rememberSelfDelete(action.workspaceId);
                    try {
                        await this.ctx.workspaceRegistry.delete(action.workspaceId);
                        this.ctx.logger.info(`left-panel: unregistered ${action.path} (${action.reason})`);
                    }
                    catch (error) {
                        this.ctx.logger.warn(`left-panel: could not unregister ${action.path}: ${String(error)}`);
                    }
                    known.delete(action.path);
                    delete titles[action.path];
                    break;
                }
                case 'retitle': {
                    const workspace = this.ctx.workspaceRegistry.get(action.workspaceId);
                    if (workspace === undefined)
                        break;
                    try {
                        await workspace.setTitle(action.title);
                        titles[action.path] = action.title;
                    }
                    catch (error) {
                        this.ctx.logger.warn(`left-panel: could not retitle ${action.path}: ${String(error)}`);
                    }
                    break;
                }
            }
        }
        const registeredPaths = new Set(this.registry.map(workspace => workspace.path));
        // A tombstoned path that carries a registration again was re-added by the
        // user: the plugin never recreates one. Drop every memory of that removal —
        // otherwise the restored path would still show up as "removed" beside its
        // active Worktree. Other removed worktrees keep their tombstones.
        const tombstoned = new Set([...state.ignored, ...state.deletedWorktrees.map(entry => entry.path)]);
        const reAdded = new Set([...tombstoned].filter(path => registeredPaths.has(path)
            && !this.deletePending.has(path)));
        for (const path of reAdded)
            this.ignoring.delete(path);
        for (const path of Object.keys(titles))
            if (!known.has(path))
                delete titles[path];
        // The plan was built from a state snapshot; another route (an explicit
        // delete) may have written a tombstone since. Merge into the state that is
        // current when this mutation actually runs, and never release a path that is
        // tombstoned there.
        await this.store.update((current) => {
            const currentDeleted = new Set(current.deletedWorktrees.map(entry => entry.path));
            const next = {
                ...current,
                ignored: current.ignored.filter(path => !reAdded.has(path)
                    && (!released.has(path) || currentDeleted.has(path))),
                deletedWorktrees: current.deletedWorktrees.filter(entry => !reAdded.has(entry.path)),
                knownWorktrees: Object.fromEntries(known),
                autoTitles: titles,
            };
            return sameState(current, next) ? current : next;
        });
    }
    /** Registered Workspace id per scanned worktree path, for adoption and placement. */
    registeredWorktreePaths() {
        const byPath = new Map(this.registry.map(workspace => [workspace.path, workspace.id]));
        const registered = new Map();
        for (const repo of this.repos) {
            for (const worktree of repo.worktrees) {
                if (worktree.bare)
                    continue;
                const id = byPath.get(worktree.path);
                if (id !== undefined)
                    registered.set(worktree.path, id);
            }
        }
        return registered;
    }
    /** Stored sessions grouped by canonical cwd, for adopting orphans into a new worktree Workspace. */
    async sessionsByDirectory() {
        const byPath = new Map();
        try {
            for (const snapshot of await this.ctx.sessionPersistence.list()) {
                const cwd = snapshot.header.cwd;
                if (typeof cwd !== 'string' || cwd === '')
                    continue;
                const path = await canonical(cwd);
                const ids = byPath.get(path);
                if (ids === undefined)
                    byPath.set(path, [snapshot.header.id]);
                else
                    ids.push(snapshot.header.id);
            }
        }
        catch (error) {
            this.ctx.logger.warn(`left-panel: could not list stored sessions: ${String(error)}`);
        }
        return byPath;
    }
    /** Attach sessions whose immutable cwd is this worktree; attachSession rejects any mismatch. */
    async adoptExistingSessions(workspace, candidates) {
        let adopted = 0;
        for (const sessionId of candidates) {
            if (workspace.sessionIds.includes(sessionId))
                continue;
            try {
                await workspace.attachSession(sessionId);
                adopted += 1;
            }
            catch (error) {
                this.ctx.logger.warn(`left-panel: could not attach ${sessionId} to ${workspace.path}: ${String(error)}`);
            }
        }
        if (adopted > 0) {
            this.ctx.logger.info(`left-panel: adopted ${adopted} pre-existing session(s) into ${workspace.path}`);
        }
    }
    /** Keep a repository's worktree Workspaces adjacent in the durable order: right after the last one already placed. */
    async placeAfterRepo(id, repoKey, mainWorkspaceId) {
        if (mainWorkspaceId === undefined)
            return;
        const repo = this.repos.find(candidate => candidate.key === repoKey);
        if (repo === undefined)
            return;
        const repoPaths = new Set(repo.worktrees.map(worktree => worktree.path));
        const ordered = this.ctx.workspaceRegistry.list();
        const mainIndex = ordered.findIndex(workspace => workspace.id === mainWorkspaceId);
        if (mainIndex < 0)
            return;
        let cursor = mainIndex + 1;
        while (cursor < ordered.length) {
            const candidate = ordered[cursor];
            if (candidate === undefined || candidate.id === id || !repoPaths.has(candidate.path))
                break;
            cursor += 1;
        }
        const anchor = ordered[cursor];
        if (anchor?.id === id)
            return;
        try {
            await this.ctx.workspaceRegistry.insertBefore(id, anchor?.id);
        }
        catch (error) {
            this.ctx.logger.warn(`left-panel: could not reorder ${id}: ${String(error)}`);
        }
    }
    rememberSelfDelete(id) {
        this.selfDeletes.add(id);
        setTimeout(() => this.selfDeletes.delete(id), SELF_DELETE_TTL_MS).unref();
    }
    onDomainChanged(change) {
        if (change.domain !== 'workspace' || change.table !== 'workspaces')
            return;
        if (change.operation === 'deleted') {
            if (this.selfDeletes.has(change.key)) {
                this.selfDeletes.delete(change.key);
            }
            else {
                const entry = this.registry.find(workspace => workspace.id === change.key);
                if (entry !== undefined && this.isWorktreePath(entry.path)) {
                    this.ctx.logger.info(`left-panel: ${entry.path} removed by the user; not registering it again`);
                    this.ignoring.add(entry.path);
                    void this.store.update(state => state.ignored.includes(entry.path)
                        ? state
                        : { ...state, ignored: [...state.ignored, entry.path] })
                        .catch((error) => this.ctx.logger.warn(`left-panel: could not persist ignore: ${String(error)}`));
                }
            }
        }
        this.requestSync();
    }
    isWorktreePath(path) {
        if (this.store.current.knownWorktrees[path] !== undefined)
            return true;
        return this.repos.some(repo => repo.worktrees.some(worktree => worktree.path === path));
    }
    /** Hold (and later release) the re-add lift for paths an explicit delete owns right now. */
    holdDelete(paths) {
        for (const path of paths)
            this.deletePending.set(path, (this.deletePending.get(path) ?? 0) + 1);
    }
    releaseDelete(paths) {
        for (const path of paths) {
            const held = this.deletePending.get(path);
            if (held === undefined)
                continue;
            if (held <= 1)
                this.deletePending.delete(path);
            else
                this.deletePending.set(path, held - 1);
        }
    }
    /**
     * Persist deletion memory before any registry change. Every path is ignored
     * at once — in memory first, then on disk — so a reconcile that is already
     * running cannot recreate it, and each one stays listed as restorable.
     */
    async tombstone(deleted) {
        if (deleted.length === 0)
            return;
        for (const entry of deleted)
            this.ignoring.add(entry.path);
        const restorable = new Set(deleted.map(entry => entry.path));
        await this.store.update((state) => {
            const ignored = [...state.ignored];
            for (const path of restorable)
                if (!ignored.includes(path))
                    ignored.push(path);
            return {
                ...state,
                ignored,
                deletedWorktrees: [...state.deletedWorktrees.filter(entry => !restorable.has(entry.path)), ...deleted],
            };
        });
    }
    async handle(endpoint, payload) {
        try {
            switch (endpoint) {
                case 'list':
                    return ok(this.snapshot());
                case 'sync':
                    await this.syncNow();
                    return ok(this.snapshot());
                case 'setRepoName': {
                    const repoKey = stringField(payload, 'repoKey');
                    if (repoKey === undefined)
                        return fail('left-panel/bad-request', 'setRepoName requires repoKey');
                    if (!this.repos.some(repo => repo.key === repoKey) && !this.failedRepos.has(repoKey)) {
                        return fail('left-panel/unknown-repository', `${repoKey} is not a scanned repository`, { repoKey });
                    }
                    const raw = typeof payload?.name === 'string'
                        ? payload.name
                        : undefined;
                    if (raw === undefined)
                        return fail('left-panel/bad-request', 'setRepoName requires name');
                    const name = raw.trim().slice(0, REPO_NAME_MAX);
                    await this.store.update(state => {
                        const repoNames = { ...state.repoNames };
                        // An empty name restores the derived default rather than storing one.
                        if (name === '')
                            delete repoNames[repoKey];
                        else
                            repoNames[repoKey] = name;
                        return { ...state, repoNames };
                    });
                    return ok(this.snapshot());
                }
                case 'setWorkspaceTitle': {
                    const workspaceId = stringField(payload, 'workspaceId');
                    if (workspaceId === undefined)
                        return fail('left-panel/bad-request', 'setWorkspaceTitle requires workspaceId');
                    const raw = typeof payload?.title === 'string'
                        ? payload.title
                        : undefined;
                    const title = raw?.trim();
                    if (title === undefined || title === '')
                        return fail('left-panel/bad-request', 'setWorkspaceTitle requires a non-blank title');
                    const workspace = this.ctx.workspaceRegistry.get(workspaceId);
                    if (workspace === undefined)
                        return fail('left-panel/unknown-workspace', `${workspaceId} is not a registered Workspace`, { workspaceId });
                    const repo = this.repos.find(candidate => candidate.worktrees.some(worktree => worktree.path === workspace.path));
                    if (repo === undefined)
                        return fail('left-panel/not-worktree', `${workspaceId} is not part of a scanned repository`, { workspaceId });
                    const repoPaths = new Set(repo.worktrees.map(worktree => worktree.path));
                    const duplicate = this.ctx.workspaceRegistry.list().some(candidate => candidate.id !== workspace.id
                        && repoPaths.has(candidate.path) && candidate.title === title);
                    if (duplicate)
                        return fail('left-panel/name-conflict', `Workspace name '${title}' is already in use in this repository`, { title, repoKey: repo.key });
                    if (title !== workspace.title)
                        await workspace.setTitle(title);
                    return ok(this.snapshot());
                }
                case 'deleteWorkspace': {
                    const workspaceId = stringField(payload, 'workspaceId');
                    if (workspaceId === undefined)
                        return fail('left-panel/bad-request', 'deleteWorkspace requires workspaceId');
                    const workspace = this.ctx.workspaceRegistry.get(workspaceId);
                    if (workspace === undefined)
                        return fail('left-panel/unknown-workspace', `${workspaceId} is not a registered Workspace`, { workspaceId });
                    // Any Workspace record may go — except the repository's main
                    // worktree, which can never be removed or unregistered from here.
                    const repo = this.repos.find(candidate => candidate.worktrees.some(worktree => worktree.path === workspace.path));
                    const worktree = repo?.worktrees.find(candidate => candidate.path === workspace.path);
                    if (worktree?.main === true) {
                        return fail('left-panel/main-worktree', 'the main worktree cannot be deleted', { workspaceId });
                    }
                    const repoKey = repo?.key ?? this.store.current.knownWorktrees[workspace.path];
                    const record = payload;
                    const dropFiles = record?.deleteBranch === true;
                    if (dropFiles) {
                        // "Also delete the branch": the directory goes too — unregistering
                        // alone would leave a checkout behind, so the checkbox means a full
                        // removal, and there is no tombstone to restore afterwards.
                        const main = repo?.worktrees.find(candidate => candidate.main);
                        if (repo === undefined || main === undefined || worktree === undefined
                            || worktree.branch === null || worktree.main || worktree.bare) {
                            return fail('left-panel/bad-request', 'deleteBranch applies only to a non-main worktree on a branch', { workspaceId });
                        }
                        const dirty = await isDirty(worktree.path);
                        const merged = await isMerged(main.path, worktree.branch, main.branch ?? 'HEAD');
                        if ((dirty || !merged) && record?.force !== true) {
                            return fail('left-panel/unsafe-delete', `the worktree ${dirty ? 'has uncommitted changes' : 'has unmerged commits'}: ${worktree.path}`, { path: worktree.path });
                        }
                        const removed = await removeWorktree(main.path, worktree.path, dirty);
                        if (removed.code !== 0) {
                            return fail('left-panel/git-error', removed.stderr.trim() || `git worktree remove exited with ${removed.code}`, { path: worktree.path });
                        }
                        const dropped = await deleteBranch(main.path, worktree.branch, !merged);
                        if (dropped.code !== 0) {
                            return fail('left-panel/git-error', dropped.stderr.trim() || `git branch -d exited with ${dropped.code}`, { branch: worktree.branch });
                        }
                        this.holdDelete([workspace.path]);
                        try {
                            this.rememberSelfDelete(workspaceId);
                            await this.ctx.workspaceRegistry.delete(workspaceId);
                            await this.syncNow();
                        }
                        finally {
                            this.releaseDelete([workspace.path]);
                        }
                        return ok(this.snapshot());
                    }
                    this.holdDelete([workspace.path]);
                    try {
                        if (repoKey !== undefined) {
                            await this.tombstone([{
                                    repoKey,
                                    path: workspace.path,
                                    branch: worktree?.branch ?? null,
                                    title: workspace.title,
                                }]);
                        }
                        this.rememberSelfDelete(workspaceId);
                        await this.ctx.workspaceRegistry.delete(workspaceId);
                        await this.syncNow();
                    }
                    finally {
                        this.releaseDelete([workspace.path]);
                    }
                    return ok(this.snapshot());
                }
                case 'renameBranch': {
                    const workspaceId = stringField(payload, 'workspaceId');
                    const name = stringField(payload, 'branch')?.trim();
                    if (workspaceId === undefined || name === undefined || name === '') {
                        return fail('left-panel/bad-request', 'renameBranch requires workspaceId and a non-blank branch');
                    }
                    const workspace = this.ctx.workspaceRegistry.get(workspaceId);
                    if (workspace === undefined)
                        return fail('left-panel/unknown-workspace', `${workspaceId} is not a registered Workspace`, { workspaceId });
                    const repo = this.repos.find(candidate => candidate.worktrees.some(worktree => worktree.path === workspace.path));
                    const worktree = repo?.worktrees.find(candidate => candidate.path === workspace.path);
                    if (repo === undefined || worktree === undefined || worktree.branch === null) {
                        return fail('left-panel/not-branch', `${workspaceId} is not a worktree on a branch`, { workspaceId });
                    }
                    if (name === worktree.branch)
                        return ok(this.snapshot());
                    if (!(await isValidBranchName(worktree.path, name))) {
                        return fail('left-panel/invalid-branch', `'${name}' is not a valid branch name`, { branch: name });
                    }
                    if ((await listBranches(worktree.path)).includes(name)) {
                        return fail('left-panel/branch-exists', `a branch named '${name}' already exists`, { branch: name });
                    }
                    const renamed = await renameCurrentBranch(worktree.path, name);
                    if (renamed.code !== 0) {
                        return fail('left-panel/git-error', renamed.stderr.trim() || `git branch -m exited with ${renamed.code}`, { branch: name });
                    }
                    // Display name and branch name are decoupled: renaming the branch
                    // never touches the workspace title (the rename dialog can reset
                    // the title back to the branch name explicitly).
                    await this.syncNow();
                    return ok(this.snapshot());
                }
                case 'deleteRepository': {
                    const repoKey = stringField(payload, 'repoKey');
                    if (repoKey === undefined)
                        return fail('left-panel/bad-request', 'deleteRepository requires repoKey');
                    const repo = this.repos.find(candidate => candidate.key === repoKey);
                    const failed = this.failedRepos.get(repoKey);
                    if (repo === undefined && failed === undefined) {
                        return fail('left-panel/unknown-repository', `${repoKey} is not a scanned repository`, { repoKey });
                    }
                    // Everything git lists, plus every path the plugin has ever seen in
                    // this repository (a Worktree that vanished a moment ago can still own
                    // a Workspace record), and a failed scan's main path.
                    const scanned = new Map();
                    for (const worktree of repo?.worktrees ?? [])
                        if (!worktree.bare)
                            scanned.set(worktree.path, worktree);
                    const paths = new Set(scanned.keys());
                    for (const [path, key] of Object.entries(this.store.current.knownWorktrees)) {
                        if (key === repoKey)
                            paths.add(path);
                    }
                    if (failed !== undefined)
                        paths.add(failed.mainPath);
                    const members = this.ctx.workspaceRegistry.list().filter(workspace => paths.has(workspace.path));
                    const workspaceByPath = new Map(members.map(workspace => [workspace.path, workspace]));
                    const state = this.store.current;
                    const deleted = [...paths].map((path) => {
                        const worktree = scanned.get(path);
                        const workspace = workspaceByPath.get(path);
                        const existing = state.deletedWorktrees.find(entry => entry.path === path);
                        return {
                            repoKey,
                            path,
                            branch: worktree?.branch ?? existing?.branch ?? null,
                            title: workspace?.title
                                ?? existing?.title
                                ?? (worktree === undefined ? basename(path) || path : worktreeTitle(worktree)),
                        };
                    });
                    this.holdDelete(paths);
                    try {
                        await this.tombstone(deleted);
                        const removeMembers = async () => {
                            const targets = this.ctx.workspaceRegistry.list().filter(workspace => paths.has(workspace.path));
                            // Mark first: the domain listener must not mistake these clears for
                            // the user deleting a Worktree by hand.
                            for (const workspace of targets)
                                this.rememberSelfDelete(workspace.id);
                            for (const workspace of targets) {
                                try {
                                    await this.ctx.workspaceRegistry.delete(workspace.id);
                                    this.ctx.logger.info(`left-panel: unregistered ${workspace.path} (repository removed)`);
                                }
                                catch (error) {
                                    this.ctx.logger.warn(`left-panel: could not unregister ${workspace.path}: ${String(error)}`);
                                }
                            }
                        };
                        await removeMembers();
                        // Drain reconciles already in flight; their creates see the tombstones
                        // and are skipped, but one that had already called the registry can
                        // still land, so sweep what is left and drain once more.
                        await this.syncNow();
                        if (this.ctx.workspaceRegistry.list().some(workspace => paths.has(workspace.path))) {
                            await removeMembers();
                            await this.syncNow();
                        }
                        const remaining = this.ctx.workspaceRegistry.list().filter(workspace => paths.has(workspace.path));
                        if (remaining.length > 0) {
                            return fail('left-panel/internal', `could not remove every Worktree of ${repoKey}`, {
                                repoKey,
                                workspaceIds: remaining.map(workspace => workspace.id),
                            });
                        }
                        return ok(this.snapshot());
                    }
                    finally {
                        this.releaseDelete(paths);
                    }
                }
                case 'restoreWorkspace': {
                    const path = stringField(payload, 'path');
                    if (path === undefined)
                        return fail('left-panel/bad-request', 'restoreWorkspace requires path');
                    const deleted = this.store.current.deletedWorktrees.find(entry => entry.path === path);
                    if (deleted === undefined)
                        return fail('left-panel/unknown-deleted-worktree', `${path} is not a deleted worktree`, { path });
                    const worktree = this.repos
                        .find(repo => repo.key === deleted.repoKey)?.worktrees
                        .find(candidate => candidate.path === deleted.path && candidate.exists && !candidate.prunable);
                    if (worktree === undefined) {
                        return fail('left-panel/worktree-missing', `The worktree directory no longer exists: ${path}`, { path });
                    }
                    this.ignoring.delete(deleted.path);
                    await this.store.update(state => ({
                        ...state,
                        ignored: state.ignored.filter(candidate => candidate !== deleted.path),
                        deletedWorktrees: state.deletedWorktrees.filter(entry => entry.path !== deleted.path),
                    }));
                    await this.syncNow();
                    const workspace = await this.ctx.workspaceRegistry.resolveByPath(deleted.path);
                    if (workspace !== undefined && workspace.title !== deleted.title)
                        await workspace.setTitle(deleted.title);
                    await this.syncNow();
                    return ok(this.snapshot());
                }
                case 'branchOptions': {
                    const repoKey = stringField(payload, 'repoKey');
                    if (repoKey === undefined)
                        return fail('left-panel/bad-request', 'branchOptions requires repoKey');
                    const repo = this.repos.find(candidate => candidate.key === repoKey);
                    const main = repo?.worktrees.find(worktree => worktree.main);
                    if (repo === undefined || main === undefined) {
                        return fail('left-panel/unknown-repository', `${repoKey} is not a scanned repository`, { repoKey });
                    }
                    const checkedOut = new Set(repo.worktrees.flatMap(worktree => worktree.branch === null ? [] : [worktree.branch]));
                    const parents = [];
                    for (const worktree of repo.worktrees) {
                        if (worktree.bare)
                            continue;
                        const parent = dirname(worktree.path);
                        if (!parents.includes(parent))
                            parents.push(parent);
                    }
                    return ok({
                        repoKey,
                        availableBranches: (await listBranches(main.path)).filter(branch => !checkedOut.has(branch)),
                        base: main.branch ?? (main.head === '' ? main.path : main.head.slice(0, 7)),
                        parents,
                        dirName: basename(main.path) || main.path,
                    });
                }
                case 'createWorktree': {
                    const repoKey = stringField(payload, 'repoKey');
                    const branch = stringField(payload, 'branch')?.trim();
                    const rawPath = stringField(payload, 'path');
                    if (repoKey === undefined || branch === undefined || rawPath === undefined) {
                        return fail('left-panel/bad-request', 'createWorktree requires repoKey, branch and path');
                    }
                    const repo = this.repos.find(candidate => candidate.key === repoKey);
                    const main = repo?.worktrees.find(worktree => worktree.main);
                    if (repo === undefined || main === undefined) {
                        return fail('left-panel/unknown-repository', `${repoKey} is not a scanned repository`, { repoKey });
                    }
                    const target = rawPath.trim();
                    if (!isAbsolute(target)) {
                        return fail('left-panel/bad-request', 'the worktree path must be absolute', { path: target });
                    }
                    const created = await canonical(target);
                    if (repo.worktrees.some(worktree => worktree.path === created)) {
                        return fail('left-panel/path-conflict', `${target} is already a worktree of this repository`, { path: target });
                    }
                    // git worktree add refuses an existing directory in some versions and
                    // silently reuses an empty one in others; rejecting it keeps the
                    // "create" semantics identical on every host.
                    if (await isDirectory(target)) {
                        return fail('left-panel/path-exists', `directory already exists: ${target}`, { path: target });
                    }
                    const create = !(await listBranches(main.path)).includes(branch);
                    if (create && !(await isValidBranchName(main.path, branch))) {
                        return fail('left-panel/invalid-branch', `'${branch}' is not a valid branch name`, { branch });
                    }
                    const base = stringField(payload, 'base');
                    const added = await addWorktree(main.path, { path: target, branch, create, base });
                    if (added.code !== 0) {
                        return fail('left-panel/git-error', added.stderr.trim() || `git worktree add exited with ${added.code}`, { branch, path: target });
                    }
                    // An explicit creation at a tombstoned path is a native re-add: lift
                    // the removal memory so reconciliation can register it again.
                    this.ignoring.delete(created);
                    await this.store.update(state => ({
                        ...state,
                        ignored: state.ignored.filter(candidate => candidate !== created),
                        deletedWorktrees: state.deletedWorktrees.filter(entry => entry.path !== created),
                    }));
                    // The worktree registers through the same pipeline a manual
                    // `git worktree add` takes — title, grouping and placement included.
                    await this.syncNow();
                    return ok(this.snapshot());
                }
                default:
                    return fail('left-panel/unknown-endpoint', `unknown endpoint "${endpoint}"`, { endpoint });
            }
        }
        catch (error) {
            this.ctx.logger.warn(`left-panel: ${endpoint} failed: ${String(error)}`);
            return fail('left-panel/internal', String(error));
        }
    }
    scheduleGrace(nextCheckAt) {
        if (this.graceTimer !== undefined) {
            clearTimeout(this.graceTimer);
            this.graceTimer = undefined;
        }
        if (nextCheckAt === undefined || this.disposed)
            return;
        const delay = Math.max(0, nextCheckAt - Date.now()) + 50;
        this.graceTimer = setTimeout(() => {
            this.graceTimer = undefined;
            this.requestSync();
        }, delay);
    }
    /** Watch each repository's common git dir (HEAD, worktrees/) so checkouts and worktree add/remove reconcile promptly. */
    updateWatchers() {
        const wanted = new Set(this.repos.map(repo => repo.key));
        for (const [key, watchers] of this.watchers) {
            if (wanted.has(key))
                continue;
            for (const watcher of watchers)
                watcher.close();
            this.watchers.delete(key);
        }
        for (const key of wanted) {
            if (this.watchers.has(key))
                continue;
            const watchers = [];
            const attach = (target, recursive) => {
                try {
                    const watcher = watch(target, { persistent: false, recursive }, () => this.requestSync());
                    watcher.on('error', (error) => {
                        this.ctx.logger.warn(`left-panel: watcher on ${target} failed, relying on polling: ${String(error)}`);
                        watcher.close();
                    });
                    watchers.push(watcher);
                }
                catch (error) {
                    this.ctx.logger.warn(`left-panel: cannot watch ${target}: ${String(error)}`);
                }
            };
            attach(key, false);
            attach(join(key, 'worktrees'), true);
            this.watchers.set(key, watchers);
        }
    }
    dispose() {
        this.disposed = true;
        if (this.pollTimer !== undefined)
            clearInterval(this.pollTimer);
        if (this.debounceTimer !== undefined)
            clearTimeout(this.debounceTimer);
        if (this.graceTimer !== undefined)
            clearTimeout(this.graceTimer);
        for (const watchers of this.watchers.values())
            for (const watcher of watchers)
                watcher.close();
        this.watchers.clear();
    }
}
//# sourceMappingURL=service.js.map