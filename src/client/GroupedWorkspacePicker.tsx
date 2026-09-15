import { useCallback, useState } from 'react'
import {
  Button, IconBranchOutline16, IconFolderClose16, IconPlusOutline16, Menu, Modal,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'

import type { GroupedWorkspacePickerProps } from './contract/slots.ts'
import { workspacePickerEntries } from './workspace-picker-tree.ts'
import css from './GroupedWorkspacePicker.module.css'

const ADD_WORKSPACE = '::add-workspace'

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
  const getAnchorRect = useCallback(() => anchorRef?.current?.getBoundingClientRect() ?? null, [anchorRef])
  const entries: MenuEntry[] = snapshot.syncedAt === 0
    ? [{ type: 'label', id: '::loading', text: t('picker.loading') }]
    : workspacePickerEntries(workspaces, snapshot).map((entry) => {
    if (entry.kind === 'project') return { type: 'label', id: entry.id, text: entry.name }
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
          if (id === ADD_WORKSPACE) chooseDirectory()
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
