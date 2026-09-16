import { useCallback, useEffect, useState } from 'react'
import {
  Button, IconBranchOutline16, IconFolderClose16, IconPlusOutline16,
  IconTriangleRightFill14, Menu, Modal,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'

import type { GroupedWorkspacePickerProps } from './contract/slots.ts'
import { visibleWorkspacePickerEntries, workspacePickerEntries } from './workspace-picker-tree.ts'
import css from './GroupedWorkspacePicker.module.css'

const ADD_WORKSPACE = '::add-workspace'
const TOGGLE_PROJECT = '::toggle-project:'

/** Repository-aware replacement for the New Session Workspace picker. */
export function GroupedWorkspacePicker({
  open, anchorRef, useWorkspaces, useWorktrees, selectedId, onPick, onClose,
  createWorkspace, pickDirectory, t,
}: GroupedWorkspacePickerProps) {
  const workspaceSnapshot = useWorkspaces(state => state)
  const workspaces = workspaceSnapshot.items
  const snapshot = useWorktrees(state => state)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<ReadonlySet<string>>(() => new Set())
  const getAnchorRect = useCallback(() => anchorRef?.current?.getBoundingClientRect() ?? null, [anchorRef])
  const allEntries = workspacePickerEntries(workspaces, snapshot)
  const selectedRepoKey = selectedId === undefined ? undefined : snapshot.workspaceRepo[selectedId as string]
  const selectedProjectId = selectedRepoKey === undefined ? undefined : `repo:${selectedRepoKey}`
  useEffect(() => {
    if (!open || selectedProjectId === undefined) return
    setExpandedProjects((current) => {
      if (current.has(selectedProjectId)) return current
      return new Set([...current, selectedProjectId])
    })
  }, [open, selectedProjectId])
  const visibleEntries = visibleWorkspacePickerEntries(allEntries, expandedProjects)
  const entries: MenuEntry[] = snapshot.syncedAt === 0
    ? [{ type: 'label', id: '::loading', text: t('picker.loading') }]
    : visibleEntries.map((entry) => {
    if (entry.kind === 'project') {
      const expanded = expandedProjects.has(entry.id)
      return {
        id: `${TOGGLE_PROJECT}${entry.id}`,
        label: (
          <span className={css.projectLabel}>
            <span className={css.projectName}>{entry.name}</span>
            <IconTriangleRightFill14 className={expanded ? css.projectArrowExpanded : css.projectArrow} />
          </span>
        ),
      }
    }
    return {
      id: entry.workspace.workspaceId as string,
      label: entry.nested
        ? <span className={css.nestedLabel}>{entry.workspace.title}</span>
        : entry.workspace.title,
      icon: entry.nested ? <IconBranchOutline16 size={16} /> : <IconFolderClose16 size={16} />,
      disabled: busy,
    }
    })
  const addEntries: MenuEntry[] = [{
    id: ADD_WORKSPACE,
    label: t('picker.addWorkspace'),
    icon: <IconPlusOutline16 size={16} />,
    disabled: busy,
  }]
  const chooseDirectory = (): void => {
    onClose()
    setBusy(true)
    setError(null)
    pickDirectory().then((path) => {
      if (path === null) return undefined
      return createWorkspace({ path }).then(workspace => { onPick(workspace.workspaceId) })
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(false) })
  }
  return (
    <>
      <Menu
        open={open}
        anchor={null}
        items={entries.length === 0 ? addEntries : entries}
        {...entries.length === 0 ? {} : { footer: addEntries }}
        selectedId={selectedId}
        onSelect={(id) => {
          if (id.startsWith(TOGGLE_PROJECT)) {
            const projectId = id.slice(TOGGLE_PROJECT.length)
            setExpandedProjects((current) => {
              const next = new Set(current)
              if (next.has(projectId)) next.delete(projectId)
              else next.add(projectId)
              return next
            })
          } else if (id === ADD_WORKSPACE) chooseDirectory()
          else onPick(id as WorkspaceId)
        }}
        onClose={onClose}
        side="bottom"
        portal
        getAnchorRect={getAnchorRect}
      />
      <Modal
        open={error !== null}
        onClose={() => { setError(null) }}
        closeLabel={t('close')}
        title={t('folderError.title')}
        footer={(
          <>
            <Button variant="outline" className={css.modalAction} onClick={() => { setError(null) }}>
              {t('cancel')}
            </Button>
            <Button variant="primary" className={css.modalAction} onClick={chooseDirectory}>
              {t('folderError.retry')}
            </Button>
          </>
        )}
      >
        <div className={css.modalError} role="alert">{error}</div>
      </Modal>
    </>
  )
}
