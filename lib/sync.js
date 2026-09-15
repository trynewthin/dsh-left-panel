/** How long a worktree must stay gone before its Workspace registration is dropped. */
export const REMOVAL_GRACE_MS = 5_000;
/** Branch name, or the short hash while detached. */
export function worktreeTitle(entry) {
    if (entry.branch !== null && entry.branch !== '')
        return entry.branch;
    if (entry.head !== '')
        return entry.head.slice(0, 7);
    return entry.path.split(/[\\/]/).filter(segment => segment !== '').pop() ?? entry.path;
}
export function planSync(registry, repos, memory, now, graceMs = REMOVAL_GRACE_MS) {
    const byPath = new Map(registry.map(workspace => [workspace.path, workspace]));
    const actions = [];
    const pendingRemoval = new Map();
    const knownWorktrees = new Map(memory.knownWorktrees);
    const listedPaths = new Set();
    const consider = (path, repoKey, workspaceId, reason) => {
        const since = memory.pendingRemoval.get(path) ?? now;
        if (now - since >= graceMs) {
            actions.push({ type: 'delete', repoKey, path, workspaceId, reason });
            knownWorktrees.delete(path);
            return;
        }
        pendingRemoval.set(path, since);
    };
    for (const repo of repos) {
        const main = repo.worktrees.find(worktree => worktree.main);
        const mainWorkspaceId = main === undefined ? undefined : byPath.get(main.path)?.id;
        const repoPaths = new Set();
        for (const worktree of repo.worktrees) {
            if (worktree.bare)
                continue;
            repoPaths.add(worktree.path);
            listedPaths.add(worktree.path);
            const registered = byPath.get(worktree.path);
            const present = worktree.exists && !worktree.prunable;
            if (registered !== undefined) {
                knownWorktrees.set(worktree.path, repo.key);
                if (!present) {
                    if (!worktree.main)
                        consider(worktree.path, repo.key, registered.id, 'directory-missing');
                    continue;
                }
                const title = worktreeTitle(worktree);
                const assigned = memory.autoTitles.get(worktree.path);
                if (assigned !== undefined && registered.title === assigned && title !== assigned) {
                    actions.push({ type: 'retitle', path: worktree.path, workspaceId: registered.id, title });
                }
                continue;
            }
            if (!present || memory.ignored.has(worktree.path))
                continue;
            actions.push({ type: 'create', repoKey: repo.key, path: worktree.path, title: worktreeTitle(worktree), mainWorkspaceId });
        }
        for (const [path, key] of memory.knownWorktrees) {
            if (key !== repo.key || repoPaths.has(path))
                continue;
            const registered = byPath.get(path);
            if (registered === undefined) {
                knownWorktrees.delete(path);
                continue;
            }
            if (path === repo.mainPath)
                continue;
            consider(path, repo.key, registered.id, 'worktree-gone');
        }
    }
    const releaseIgnored = [...memory.ignored].filter(path => !listedPaths.has(path));
    let nextCheckAt;
    for (const since of pendingRemoval.values()) {
        const due = since + graceMs;
        if (nextCheckAt === undefined || due < nextCheckAt)
            nextCheckAt = due;
    }
    return { actions, pendingRemoval, knownWorktrees, releaseIgnored, nextCheckAt };
}
//# sourceMappingURL=sync.js.map