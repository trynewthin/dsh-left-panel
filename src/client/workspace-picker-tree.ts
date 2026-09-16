import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

import type { WorktreeSnapshot } from '../protocol.ts'

export type WorkspacePickerEntry =
  | { readonly kind: 'project'; readonly id: string; readonly name: string }
  | { readonly kind: 'workspace'; readonly workspace: WorkspaceView; readonly nested: boolean }

/** Fold the durable Workspace order into project headings and their worktrees. */
export function workspacePickerEntries(
  workspaces: readonly WorkspaceView[],
  snapshot: WorktreeSnapshot,
): WorkspacePickerEntry[] {
  const repoByKey = new Map(snapshot.repos.map(repo => [repo.key, repo]))
  const emitted = new Set<string>()
  const entries: WorkspacePickerEntry[] = []
  for (const workspace of workspaces) {
    const repoKey = snapshot.workspaceRepo[workspace.workspaceId as string]
    const repo = repoKey === undefined ? undefined : repoByKey.get(repoKey)
    if (repo === undefined) {
      entries.push({ kind: 'workspace', workspace, nested: false })
      continue
    }
    if (emitted.has(repoKey)) continue
    emitted.add(repoKey)
    entries.push({ kind: 'project', id: `repo:${repoKey}`, name: repo.name })
    for (const member of workspaces) {
      if (snapshot.workspaceRepo[member.workspaceId as string] === repoKey) {
        entries.push({ kind: 'workspace', workspace: member, nested: true })
      }
    }
  }
  return entries
}

/** Keep project headings while hiding nested worktrees of folded projects. */
export function visibleWorkspacePickerEntries(
  entries: readonly WorkspacePickerEntry[],
  expandedProjectIds: ReadonlySet<string>,
): WorkspacePickerEntry[] {
  let projectExpanded = true
  const visible: WorkspacePickerEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'project') {
      projectExpanded = expandedProjectIds.has(entry.id)
      visible.push(entry)
      continue
    }
    if (!entry.nested || projectExpanded) visible.push(entry)
  }
  return visible
}
