import type { ComponentType } from 'react'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { PROJECT_REFERENCE_SOURCE } from './project-references.ts'

export const referenceCategories = ['files', 'projects', 'sessions'] as const
export type ReferenceCategory = typeof referenceCategories[number]

interface ReferenceCandidate {
  readonly name: string
  readonly label?: string
  readonly description?: string
  readonly icon?: string | ComponentType<{ size: number }>
  readonly drill?: boolean
}

interface CandidatePosition {
  readonly source: string
  readonly index: number
}

interface ReferenceCrumb {
  readonly label: string
  readonly value: string
  readonly current?: boolean
}

export interface ReferenceMenuState {
  readonly open: boolean
  readonly hit: { readonly trigger: '@' | '/' } | null
  readonly groups: readonly {
    readonly source: string
    readonly status: 'pending' | 'ready' | 'failed'
    readonly items: readonly ReferenceCandidate[]
  }[]
  readonly highlight: CandidatePosition | null
}

/** DSH owns candidate activation, directory navigation, and editor mutations. */
export interface ReferenceMenuController {
  readonly menu: HostObservable<ReferenceMenuState>
  readonly headers: HostObservable<ReadonlyMap<string, readonly ReferenceCrumb[]>>
  pick(source: string, index: number, action?: 'pick' | 'drill'): void
  hover(source: string, index: number): void
  pickCrumb(source: string, index: number): void
  dismiss(): void
}

export interface ReferenceMenuRow extends CandidatePosition {
  readonly item: ReferenceCandidate
}

export function referenceMenuSections(groups: ReferenceMenuState['groups']): Record<ReferenceCategory, ReferenceMenuRow[]> {
  const sections: Record<ReferenceCategory, ReferenceMenuRow[]> = { files: [], projects: [], sessions: [] }
  for (const { source, status, items } of groups) {
    if (status !== 'ready') continue
    items.forEach((item, index) => {
      const category = source === PROJECT_REFERENCE_SOURCE
        ? 'projects'
        : item.icon === 'file' || item.icon === 'folder' ? 'files' : 'sessions'
      sections[category].push({ source, index, item })
    })
  }
  return sections
}
