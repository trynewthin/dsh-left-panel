/**
 * Plugin-owned durable memory: ignored worktree paths, repository display
 * names, and the worktree associations and titles the plugin assigned. Stored as one JSON document written atomically (temp file + rename).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
export const EMPTY_STATE = {
    version: 1,
    ignored: [],
    knownWorktrees: {},
    autoTitles: {},
    repoNames: {},
};
/** Default location next to DSH's own storages; DSH_HOME overrides the base directory. */
export function defaultStateFile(env = process.env) {
    const base = env.DSH_HOME !== undefined && env.DSH_HOME !== '' ? env.DSH_HOME : join(homedir(), '.dsh');
    return join(base, 'storages', 'dsh-left-panel.json');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stringRecord(value) {
    const out = {};
    if (!isRecord(value))
        return out;
    for (const [key, entry] of Object.entries(value))
        if (typeof entry === 'string')
            out[key] = entry;
    return out;
}
/** Coerce an arbitrary parsed document into a valid state, dropping malformed fields. */
export function normalizeState(value) {
    if (!isRecord(value))
        return EMPTY_STATE;
    const ignored = Array.isArray(value.ignored) ? value.ignored.filter((entry) => typeof entry === 'string') : [];
    return {
        version: 1,
        ignored: [...new Set(ignored)],
        knownWorktrees: stringRecord(value.knownWorktrees),
        autoTitles: stringRecord(value.autoTitles),
        repoNames: stringRecord(value.repoNames),
    };
}
export async function loadState(file) {
    let text;
    try {
        text = await readFile(file, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { state: EMPTY_STATE };
        return { state: EMPTY_STATE, error: String(error) };
    }
    try {
        return { state: normalizeState(JSON.parse(text)) };
    }
    catch (error) {
        return { state: EMPTY_STATE, error: `invalid JSON: ${String(error)}` };
    }
}
export async function saveState(file, state) {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temp, file);
}
/** Serialized read-modify-write access to the state file. */
export class StateStore {
    file;
    state = EMPTY_STATE;
    tail = Promise.resolve();
    constructor(file) {
        this.file = file;
    }
    get current() {
        return this.state;
    }
    /** Read the file once; a corrupt file yields an empty state and the error. */
    async load() {
        const loaded = await loadState(this.file);
        this.state = loaded.state;
        return loaded.error;
    }
    /** Apply one mutation and persist it; mutations are applied in call order. */
    update(mutate) {
        const run = this.tail.then(async () => {
            const next = mutate(this.state);
            if (next === this.state)
                return;
            await saveState(this.file, next);
            this.state = next;
        });
        this.tail = run.catch(() => undefined);
        return run;
    }
}
//# sourceMappingURL=state.js.map