import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

import type { WorktreeSnapshot } from '../protocol.ts'

interface WorkspacePickerBranch {
  readonly name: string
  readonly workspaceId: WorkspaceId
  readonly main: boolean
}

interface WorkspacePickerProject {
  readonly kind: 'project'
  readonly id: string
  readonly name: string
  readonly branches: WorkspacePickerBranch[]
}

export type WorkspacePickerEntry =
  | WorkspacePickerProject
  | { readonly kind: 'workspace'; readonly workspace: WorkspaceView }

/** Offer registered, checked-out branches in Workspace order. */
export function workspacePickerEntries(
  workspaces: readonly WorkspaceView[],
  snapshot: WorktreeSnapshot,
): WorkspacePickerEntry[] {
  const repositories = new Map(snapshot.repos.map(repo => [repo.key, repo]))
  const projects = new Map<string, WorkspacePickerProject>()
  const entries: WorkspacePickerEntry[] = []
  for (const workspace of workspaces) {
    const repoKey = snapshot.workspaceRepo[workspace.workspaceId]
    const repo = repoKey === undefined ? undefined : repositories.get(repoKey)
    if (repo === undefined) {
      entries.push({ kind: 'workspace', workspace })
      continue
    }
    let project = projects.get(repo.key)
    if (project === undefined) {
      project = { kind: 'project', id: `repo:${repo.key}`, name: repo.name, branches: [] }
      projects.set(repo.key, project)
      entries.push(project)
    }
    const checkout = repo.worktrees.find(worktree => worktree.workspaceId === workspace.workspaceId)
    if (checkout?.branch && checkout.exists && !checkout.bare && !checkout.prunable && !checkout.detached) {
      project.branches.push({ name: checkout.branch, workspaceId: workspace.workspaceId, main: checkout.main })
    }
  }
  return entries
}
