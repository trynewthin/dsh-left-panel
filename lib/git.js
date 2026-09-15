/**
 * Read-only git access: a scrubbed, time-limited spawn plus pure parsers for
 * the porcelain output the plugin relies on. Nothing here writes to a repository.
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
//# sourceMappingURL=git.js.map