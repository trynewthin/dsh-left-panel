/**
 * Git access: a scrubbed, time-limited spawn plus pure parsers for the
 * porcelain output the plugin relies on. Everything is read-only except
 * {@link addWorktree}, {@link removeWorktree}, {@link deleteBranch} and
 * {@link renameCurrentBranch} — the plugin's only writes into a repository.
 */
import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
const DEFAULT_TIMEOUT_MS = 15_000;
const SECRET_ENV = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i;
/** Copy the ambient environment without credential-looking variables and without interactive prompts. */
export function scrubbedEnv(source = process.env) {
    const env = {};
    for (const [name, value] of Object.entries(source)) {
        if (SECRET_ENV.test(name))
            continue;
        env[name] = value;
    }
    env.GIT_TERMINAL_PROMPT = '0';
    env.GIT_OPTIONAL_LOCKS = '0';
    env.LC_ALL = 'C';
    return env;
}
/**
 * Run one git command with a fixed argv (never a shell) and a hard timeout.
 * A nonzero exit is a normal result; only spawn failures and timeouts reject.
 */
export function runGit(args, cwd, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolvePromise, reject) => {
        const child = spawn('git', args, { cwd, env: scrubbedEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGKILL');
            reject(new Error(`git ${args.join(' ')} timed out after ${timeoutMs}ms in ${cwd}`));
        }, timeoutMs);
        child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolvePromise({ code, stdout, stderr });
        });
    });
}
const BRANCH_PREFIX = 'refs/heads/';
/**
 * Parse porcelain worktree output. Entries are blank-line separated blocks
 * whose first line is `worktree <path>`; the first block is the main worktree.
 */
export function parseWorktreePorcelain(text) {
    const entries = [];
    let current = null;
    const flush = () => {
        if (current !== null)
            entries.push(current);
        current = null;
    };
    for (const rawLine of text.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        if (line === '') {
            flush();
            continue;
        }
        if (line.startsWith('worktree ')) {
            flush();
            current = { path: line.slice('worktree '.length), head: '', branch: null, detached: false, bare: false, locked: false, prunable: false };
            continue;
        }
        if (current === null)
            continue;
        if (line.startsWith('HEAD '))
            current.head = line.slice('HEAD '.length);
        else if (line.startsWith('branch ')) {
            const ref = line.slice('branch '.length);
            current.branch = ref.startsWith(BRANCH_PREFIX) ? ref.slice(BRANCH_PREFIX.length) : ref;
        }
        else if (line === 'detached')
            current.detached = true;
        else if (line === 'bare')
            current.bare = true;
        else if (line === 'locked' || line.startsWith('locked '))
            current.locked = true;
        else if (line === 'prunable' || line.startsWith('prunable '))
            current.prunable = true;
    }
    flush();
    return entries;
}
/** Canonicalize a path when it exists; otherwise return it unchanged. */
export async function canonical(path) {
    try {
        return await realpath(path);
    }
    catch {
        return path;
    }
}
/** True when `path` names an existing directory. */
export async function isDirectory(path) {
    try {
        return (await stat(path)).isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * Locate `path` inside git. Returns null for directories outside any
 * repository (or when git itself is unavailable).
 */
export async function locate(path, options) {
    let result;
    try {
        result = await runGit(['rev-parse', '--show-toplevel', '--git-common-dir'], path, options);
    }
    catch {
        return null;
    }
    if (result.code !== 0)
        return null;
    const [toplevelLine, commonLine] = result.stdout.split('\n');
    if (toplevelLine === undefined || commonLine === undefined || toplevelLine === '' || commonLine === '')
        return null;
    const toplevel = await canonical(toplevelLine);
    const commonDir = await canonical(isAbsolute(commonLine) ? commonLine : resolve(path, commonLine));
    const here = await canonical(path);
    return { toplevel, commonDir, isRoot: here === toplevel };
}
/** List every worktree of the repository containing `cwd`. */
export async function listWorktrees(cwd, options) {
    const result = await runGit(['worktree', 'list', '--porcelain'], cwd, options);
    if (result.code !== 0)
        throw new Error(result.stderr.trim() || `git worktree list exited with ${result.code}`);
    return parseWorktreePorcelain(result.stdout);
}
/** Every local branch name of the repository containing `cwd`, short form. */
export async function listBranches(cwd, options) {
    const result = await runGit(['branch', '--list', '--format=%(refname:short)'], cwd, options);
    if (result.code !== 0)
        throw new Error(result.stderr.trim() || `git branch exited with ${result.code}`);
    return result.stdout.split('\n').map(line => line.trim()).filter(line => line !== '');
}
/** True when `name` is legal as a new branch name; blank input is invalid. */
export async function isValidBranchName(cwd, name, options) {
    if (name.trim() === '')
        return false;
    const result = await runGit(['check-ref-format', '--branch', name], cwd, options);
    return result.code === 0;
}
/**
 * The plugin's single write into a repository. `cwd` should be the main
 * worktree so an omitted `base` resolves to its HEAD. A nonzero exit is a
 * normal result: git itself refuses a branch another worktree already holds,
 * and that stderr is the user-facing error.
 */
export async function addWorktree(cwd, request, options) {
    const args = request.create
        ? ['worktree', 'add', '-b', request.branch, request.path, ...(request.base === undefined ? [] : [request.base])]
        : ['worktree', 'add', request.path, request.branch];
    return runGit(args, cwd, options);
}
/** True when the worktree at `cwd` has uncommitted changes (tracked or untracked). */
export async function isDirty(cwd, options) {
    const result = await runGit(['status', '--porcelain'], cwd, options);
    if (result.code !== 0)
        throw new Error(result.stderr.trim() || `git status exited with ${result.code}`);
    return result.stdout.trim() !== '';
}
/**
 * True when `tip` is fully contained in `base`, i.e. every commit it names is
 * already reachable from `base`. Exit code 1 is "not merged"; anything worse
 * (unknown refs included) throws.
 */
export async function isMerged(cwd, tip, base, options) {
    const result = await runGit(['merge-base', '--is-ancestor', tip, base], cwd, options);
    if (result.code === 0)
        return true;
    if (result.code === 1)
        return false;
    throw new Error(result.stderr.trim() || `git merge-base exited with ${result.code}`);
}
/** `git worktree remove`; `force` also drops a dirty worktree. */
export async function removeWorktree(cwd, path, force, options) {
    return runGit(['worktree', 'remove', ...(force ? ['--force'] : []), path], cwd, options);
}
/** `git branch -d` (merged only) or `-D` (drop regardless): remove a local branch no worktree holds. */
export async function deleteBranch(cwd, branch, force, options) {
    return runGit(['branch', force ? '-D' : '-d', branch], cwd, options);
}
/** Rename the branch checked out in the worktree at `cwd` (`git branch -m`). */
export async function renameCurrentBranch(cwd, name, options) {
    return runGit(['branch', '-m', name], cwd, options);
}
//# sourceMappingURL=git.js.map