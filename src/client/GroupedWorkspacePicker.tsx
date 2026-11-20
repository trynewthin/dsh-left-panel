import { useMemo, useState } from 'react'
import {
  Button, IconBranchOutlineRegular, IconChevronDownOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular, Menu, Modal,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'

import type { GroupedWorkspacePickerProps } from './contract/slots.ts'
import { workspacePickerEntries } from './workspace-picker-tree.ts'
import css from './GroupedWorkspacePicker.module.css'

const ADD_WORKSPACE = '::add-workspace'

/** Repository-aware replacement for the New Session Workspace picker. */
export function GroupedWorkspacePicker({
  open, useWorkspaces, useWorktrees, selectedId, onPick, onClose,
  createWorkspace, pickDirectory, t,
}: GroupedWorkspacePickerProps) {
  const workspaces = useWorkspaces(state => state.items)
  const snapshot = useWorktrees(state => state)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<'project' | 'branch' | null>(null)
  const options = useMemo(() => snapshot.syncedAt === 0 ? [] : workspacePickerEntries(workspaces, snapshot), [workspaces, snapshot])
  const projects = options.filter(entry => entry.kind === 'project')
  const directories = options.filter(entry => entry.kind === 'workspace')
  const repoKey = selectedId === undefined ? undefined : snapshot.workspaceRepo[selectedId]
  const project = repoKey === undefined ? undefined : projects.find(entry => entry.id === `repo:${repoKey}`)
  const directory = directories.find(entry => entry.workspace.workspaceId === selectedId)
  const branch = project?.branches.find(entry => entry.workspaceId === selectedId)
  const scopeName = project?.name ?? directory?.workspace.title
  const projectMenuOpen = menu === 'project' || (open && menu !== 'branch')
  const branchMenuOpen = menu === 'branch' && project !== undefined

  const closeProjectMenu = (): void => {
    setMenu(current => current === 'project' ? null : current)
    if (open) onClose()
  }
  const closeBranchMenu = (): void => {
    setMenu(current => current === 'branch' ? null : current)
  }
  const entries: MenuEntry[] = snapshot.syncedAt === 0
    ? [{ type: 'label', id: '::loading', text: t('picker.loading') }]
    : [
        ...(projects.length === 0 ? [] : [
          { type: 'label' as const, id: '::projects', text: t('picker.project') },
          ...projects.map(entry => ({
            id: entry.id,
            label: entry.name,
            icon: <IconFolderCloseRegular size={16} />,
            disabled: busy || entry.branches.length === 0,
          })),
        ]),
        ...(directories.length === 0 ? [] : [
          { type: 'label' as const, id: '::directories', text: t('picker.directories') },
          ...directories.map(({ workspace }) => ({
            id: workspace.workspaceId,
            label: workspace.title,
            icon: <IconFolderCloseRegular size={16} />,
            disabled: busy,
          })),
        ]),
      ]
  const addEntries: MenuEntry[] = [{
    id: ADD_WORKSPACE,
    label: t('picker.addWorkspace'),
    icon: <IconPlusOutlineRegular size={16} />,
    disabled: busy,
  }]
  const chooseDirectory = (): void => {
    closeProjectMenu()
    setBusy(true)
    setError(null)
    pickDirectory().then((path) => {
      if (path === null) return undefined
      return createWorkspace({ path }).then(workspace => { onPick(workspace.workspaceId) })
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(false) })
  }
  const pickProject = (id: string): void => {
    if (id === ADD_WORKSPACE) {
      chooseDirectory()
      return
    }
    closeProjectMenu()
    const target = projects.find(entry => entry.id === id)
    if (target === undefined) {
      onPick(id as WorkspaceId)
    } else if (target.id !== project?.id) {
      const defaultBranch = target.branches.find(entry => entry.main) ?? target.branches[0]
      if (defaultBranch !== undefined) onPick(defaultBranch.workspaceId)
    }
  }
  return (
    <>
      <div className={css.pickerControls}>
        <Menu
          open={projectMenuOpen}
          anchor={(
            <Button
              type="button" size="sm" className={css.pickerButton}
              icon={<IconFolderCloseRegular size={16} />}
              aria-label={scopeName === undefined ? t('picker.project') : t('picker.project.selected', { name: scopeName })}
              aria-haspopup="menu" aria-expanded={projectMenuOpen}
              onClick={() => {
                if (projectMenuOpen) closeProjectMenu()
                else setMenu('project')
              }}
            >
              <span className={css.entryName}>{scopeName ?? t('picker.project')}</span>
              <IconChevronDownOutlineRegular className={css.chevron} size={12} />
            </Button>
          )}
          items={entries.length === 0 ? addEntries : entries}
          {...entries.length === 0 ? {} : { footer: addEntries }}
          selectedId={project?.id ?? selectedId}
          onSelect={pickProject}
          onClose={closeProjectMenu}
          portal
        />
        {project !== undefined && (
          <Menu
            open={branchMenuOpen}
            anchor={(
              <Button
                type="button" size="sm" className={css.pickerButton}
                icon={<IconBranchOutlineRegular size={16} />}
                aria-label={branch === undefined ? t('picker.branch') : t('picker.branch.selected', { name: branch.name })}
                aria-haspopup="menu" aria-expanded={branchMenuOpen}
                onClick={() => {
                  if (branchMenuOpen) closeBranchMenu()
                  else {
                    closeProjectMenu()
                    setMenu('branch')
                  }
                }}
              >
                <span className={css.entryName}>{branch?.name ?? t('picker.branch')}</span>
                <IconChevronDownOutlineRegular className={css.chevron} size={12} />
              </Button>
            )}
            items={project.branches.length === 0
              ? [{ type: 'label', id: '::no-branches', text: t('picker.branches.empty') }]
              : project.branches.map(entry => ({
                id: entry.workspaceId,
                label: entry.name,
                icon: <IconBranchOutlineRegular size={16} />,
              }))}
            selectedId={selectedId}
            onSelect={(id) => {
              closeBranchMenu()
              if (id !== selectedId) onPick(id as WorkspaceId)
            }}
            onClose={closeBranchMenu}
            portal
          />
        )}
      </div>
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
