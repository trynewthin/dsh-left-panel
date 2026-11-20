import type { PickOutcome } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isAbsoluteWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorktreeInfo, WorktreeSnapshot } from '../protocol.ts'

export const PROJECT_REFERENCE_SOURCE = 'left-panel-projects'

interface ProjectReferenceCandidate {
  name: string
  value: string
  description: string
  section: string
  icon: 'folder'
  drill?: true
}

/** The subset of the DSH input-trigger source contract used by this provider. */
interface ProjectReferenceSource {
  trigger: '@'
  name: string
  order: number
  showGroupTitle: false
  candidates(session: unknown, request: {
    query: string
    drilled: boolean
    signal: AbortSignal
  }): Promise<ProjectReferenceCandidate[]>
  onPick(input: { candidate: ProjectReferenceCandidate; action: 'pick' | 'drill' }): PickOutcome
  codec: {
    clipboardText(ref: string): string
    serialize(ref: string): Promise<string>
  }
}

export interface ProjectReferenceTriggers {
  registerSource(source: ProjectReferenceSource): () => void
}

function availableWorktree(worktree: WorktreeInfo): boolean {
  return worktree.exists && !worktree.bare && !worktree.prunable && isAbsoluteWorkspacePath(worktree.path)
}

/** A quoted @ query can contain spaces, but a literal quote would end it. */
function directoryQuery(path: string): string {
  const normalized = path.startsWith('/') ? path : path.replaceAll('\\', '/')
  const escaped = normalized.replace(/[%"\u0000-\u001f\u007f-\u009f]/gu, value => encodeURIComponent(value))
  return `${escaped.replace(/\/+$/u, '')}/`
}

function matchesQuery(query: string, name: string, path: string): boolean {
  return name.toLowerCase().includes(query) || path.toLowerCase().includes(query)
}

/** Join the existing @ menu after its native file and directory suggestions. */
export function createProjectReferenceSource(
  getSnapshot: () => WorktreeSnapshot,
  labels: { projects: () => string; worktrees: (name: string) => string },
): ProjectReferenceSource {
  return {
    trigger: '@',
    name: PROJECT_REFERENCE_SOURCE,
    order: 10,
    showGroupTitle: false,
    async candidates(_session, { query, drilled, signal }) {
      if (signal.aborted) return []
      const projects = getSnapshot().repos.flatMap((repo) => {
        const worktrees = repo.worktrees.filter(availableWorktree)
        const main = worktrees.find(worktree => worktree.main)
        return main === undefined ? [] : [{ repo, main, worktrees, directory: directoryQuery(main.path) }]
      })
      if (drilled && query !== '') {
        // Prefer the innermost project if one main worktree lives inside another.
        const project = projects.filter(entry => query.startsWith(entry.directory))
          .sort((a, b) => b.directory.length - a.directory.length)[0]
        if (project === undefined) return []
        const filter = query.slice(project.directory.length).toLowerCase()
        return project.worktrees.filter(worktree => matchesQuery(filter, worktree.title, worktree.path)).map(worktree => ({
          name: worktree.title,
          value: worktree.path,
          description: worktree.path,
          section: labels.worktrees(project.repo.name),
          icon: 'folder',
        }))
      }
      const filter = query.toLowerCase()
      return projects.filter(({ repo, main }) => matchesQuery(filter, repo.name, main.path)).map(({ repo, main }) => ({
        name: repo.name,
        value: main.path,
        description: main.path,
        section: labels.projects(),
        icon: 'folder',
        drill: true,
      }))
    },
    onPick({ candidate, action }) {
      if (!isAbsoluteWorkspacePath(candidate.value)) return undefined
      if (action === 'drill' && candidate.drill === true) {
        return { text: `@"${directoryQuery(candidate.value)}`, continue: true }
      }
      return {
        insert: {
          source: PROJECT_REFERENCE_SOURCE,
          ref: candidate.value,
          label: candidate.name,
          appearance: 'folder',
          clipboardText: candidate.value,
        },
      }
    },
    codec: {
      clipboardText: ref => ref,
      serialize: async ref => ref,
    },
  }
}
