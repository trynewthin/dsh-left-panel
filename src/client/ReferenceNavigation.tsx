import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  IconBranchOutlineRegular, IconChevronRightOutlineRegular, IconFlatListOutlineRegular, IconFolderOpenOutlineRegular,
  IconPanelLeftOutlineRegular, MenuSurface, ReferenceIconRegular, useAnchoredMaxHeight,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  referenceCategories, referenceMenuSections, type ReferenceCategory, type ReferenceMenuController,
  type ReferenceMenuRow, type ReferenceMenuState,
} from './reference-menu.ts'
import css from './ReferenceNavigation.module.css'

const LAYOUT_KEY = 'dsh-left-panel.reference-layout'

function readPaged(): boolean {
  try { return localStorage.getItem(LAYOUT_KEY) === 'paged' } catch { return false }
}

const categoryIcons = {
  files: IconFolderOpenOutlineRegular,
  projects: IconBranchOutlineRegular,
  sessions: () => <ReferenceIconRegular kind="session" size={18} />,
}

type ReferenceNavigationProps = PropsRuntime<'conversation.input.overlay'> & PropsLocale<'left-panel'> & {
  controller: ReferenceMenuController | undefined
}
type Translate = ReferenceNavigationProps['t']

function samePosition(row: ReferenceMenuRow, highlight: ReferenceMenuState['highlight']): boolean {
  return row.source === highlight?.source && row.index === highlight.index
}

function ReferenceCandidateIcon({ icon }: { icon: ReferenceMenuRow['item']['icon'] }) {
  if (typeof icon !== 'string') {
    const Icon = icon
    return Icon === undefined ? null : <Icon size={15} />
  }
  const kind = icon === 'folder' || icon === 'file' ? icon : 'session'
  return <ReferenceIconRegular kind={kind} size={15} />
}

function ReferencePanel({ controller, state, category, setCategory, t }: {
  controller: ReferenceMenuController
  state: ReferenceMenuState
  category: ReferenceCategory
  setCategory: (key: ReferenceCategory) => void
  t: Translate
}) {
  const headers = useSyncExternalStore(listener => controller.headers.subscribe(listener), () => controller.headers.getSnapshot())
  const panel = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [paged, setPaged] = useState(readPaged)
  const maxHeight = useAnchoredMaxHeight(panel, 400, state, 84)
  const sections = useMemo(() => referenceMenuSections(state.groups), [state.groups])
  const rows = useMemo(() => paged ? sections[category] : referenceCategories.flatMap(key => sections[key]), [paged, sections, category])
  const highlighted = rows.find(row => samePosition(row, state.highlight))
  const activeCategory = paged ? category : referenceCategories.find(key => sections[key].some(row => row === highlighted)) ?? category
  const rowId = (row: ReferenceMenuRow): string => `${listId}-${row.source}-${row.index}`

  const jumpTo = (key: ReferenceCategory): void => {
    setCategory(key)
    const list = viewport.current
    if (list !== null) {
      const section = list.querySelector(`[data-reference-section="${key}"]`)
      list.scrollTop = paged || section === null ? 0 : list.scrollTop + section.getBoundingClientRect().top - list.getBoundingClientRect().top
    }
    const first = sections[key][0]
    if (first !== undefined) controller.hover(first.source, first.index)
  }

  const toggleLayout = (): void => {
    setCategory(activeCategory)
    setPaged(!paged)
    try { localStorage.setItem(LAYOUT_KEY, paged ? 'continuous' : 'paged') } catch { /* keep the in-memory selection */ }
  }

  useLayoutEffect(() => {
    const first = rows[0]
    if (paged && highlighted === undefined && first !== undefined) controller.hover(first.source, first.index)
  }, [controller, highlighted, paged, rows])

  useLayoutEffect(() => {
    const id = highlighted === undefined ? undefined : rowId(highlighted)
    const list = viewport.current
    const option = id === undefined ? null : document.getElementById(id)
    if (list === null || option === null) return
    const bounds = list.getBoundingClientRect()
    const item = option.getBoundingClientRect()
    if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom
    else if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top
  }, [highlighted, listId, maxHeight])

  // The composer handles selection, Escape, and drill Tab. Route only the
  // vertical steps here so keyboard order matches the visible reference list.
  useEffect(() => {
    const composer = panel.current?.closest('[data-composer-card]')
    if (composer === null || composer === undefined) return
    const navigate = (event: Event): void => {
      if (!(event instanceof KeyboardEvent) || event.isComposing || event.keyCode === 229
        || event.altKey || event.ctrlKey || event.metaKey || !(event.target instanceof HTMLElement)
        || event.target.closest('[contenteditable="true"]') === null) return
      const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (direction !== 0 && !event.shiftKey && rows.length > 0) {
        const current = controller.menu.getSnapshot().highlight
        const at = rows.findIndex(row => samePosition(row, current))
        const index = at === -1 ? (direction > 0 ? 0 : rows.length - 1) : (at + direction + rows.length) % rows.length
        const target = rows[index]
        if (target === undefined) return
        event.preventDefault()
        event.stopPropagation()
        controller.hover(target.source, target.index)
      } else if (paged && rows.length === 0 && !event.shiftKey && (event.key === 'Enter' || event.key === 'Tab')
        && controller.menu.getSnapshot().highlight !== null) {
        event.preventDefault()
        event.stopPropagation()
        controller.dismiss()
      }
    }
    composer.addEventListener('keydown', navigate, true)
    return () => { composer.removeEventListener('keydown', navigate, true) }
  }, [controller, paged, rows])

  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      const host = panel.current?.closest('[data-composer-card]')
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !host?.contains(event.target)) controller.dismiss()
    }
    document.addEventListener('pointerdown', closeOutside, true)
    return () => { document.removeEventListener('pointerdown', closeOutside, true) }
  }, [controller])

  const visibleSections = paged ? [category] : referenceCategories.filter(key => sections[key].length > 0)
  const loading = state.groups.some(group => group.status === 'pending')
  return (
    <MenuSurface ref={panel} className={css.panel} style={{ maxHeight }} data-trigger-menu="">
      <nav className={css.navigation} aria-label={t('reference.navigation')}>
        {referenceCategories.map((key) => {
          const Icon = categoryIcons[key]
          return (
            <button
              key={key} type="button" className={css.navigationButton} aria-controls={listId}
              aria-current={activeCategory === key ? 'location' : undefined}
              disabled={!paged && sections[key].length === 0}
              onMouseDown={event => event.preventDefault()} onClick={() => jumpTo(key)}
            >
              <Icon size={18} />
              <span>{t(`reference.${key}`)}</span>
            </button>
          )
        })}
        <button
          type="button" className={css.layoutButton} aria-pressed={paged}
          aria-label={t('reference.paged')} title={t(paged ? 'reference.continuous' : 'reference.paged')}
          onMouseDown={event => event.preventDefault()} onClick={toggleLayout}
        >
          {paged ? <IconFlatListOutlineRegular size={16} /> : <IconPanelLeftOutlineRegular size={16} />}
          <span>{t(paged ? 'reference.continuous' : 'reference.paged')}</span>
        </button>
      </nav>
      <div className={css.body}>
        {[...headers].map(([source, crumbs]) => (
          <nav key={source} className={css.crumbs} aria-label={t('reference.crumbs')}>
            {crumbs.map((crumb, index) => (
              <Fragment key={`${index}:${crumb.value}`}>
                {index !== 0 && <IconChevronRightOutlineRegular size={12} />}
                <button
                  type="button" disabled={crumb.current} aria-current={crumb.current ? 'location' : undefined}
                  onMouseDown={event => event.preventDefault()} onClick={() => controller.pickCrumb(source, index)}
                >{crumb.label}</button>
              </Fragment>
            ))}
          </nav>
        ))}
        <div
          id={listId} className={css.viewport} ref={viewport} role="listbox" aria-label={t('reference.navigation')}
          aria-activedescendant={highlighted === undefined ? undefined : rowId(highlighted)}
        >
          {visibleSections.map(key => (
            <section key={key} role="group" data-reference-section={key} aria-label={t(`reference.${key}`)} className={css.section}>
              {sections[key].map((row) => {
                const { item, source } = row
                return (
                  <div
                    key={rowId(row)} id={rowId(row)} role="option" aria-selected={row === highlighted} className={css.option}
                    onMouseMove={() => { if (row !== highlighted) controller.hover(source, row.index) }}
                  >
                    <button
                      type="button" tabIndex={-1} className={css.choice} onMouseDown={event => event.preventDefault()}
                      onClick={() => controller.pick(source, row.index)}
                    >
                      <span className={css.icon} aria-hidden="true"><ReferenceCandidateIcon icon={item.icon} /></span>
                      <span className={css.itemName}>{item.label ?? item.name}</span>
                      {item.description !== undefined && <span className={css.description}>{item.description}</span>}
                    </button>
                    {item.drill === true && (
                      <button
                        type="button" tabIndex={-1} className={css.drill} aria-label={t('reference.drill')}
                        title={t('reference.drill')} onMouseDown={event => event.preventDefault()}
                        onClick={() => controller.pick(source, row.index, 'drill')}
                      ><IconChevronRightOutlineRegular size={14} /></button>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
          {rows.length === 0 && <div className={css.empty} role="status">{t(loading ? 'reference.loading' : 'reference.empty')}</div>}
        </div>
      </div>
    </MenuSurface>
  )
}

function ActiveReferenceNavigation({ controller, t }: { controller: ReferenceMenuController; t: Translate }) {
  const state = useSyncExternalStore(listener => controller.menu.subscribe(listener), () => controller.menu.getSnapshot())
  const [category, setCategory] = useState<ReferenceCategory>('files')
  // Drilling can briefly close the menu while DSH replaces the draft token.
  return state.open && state.hit?.trigger === '@'
    ? <ReferencePanel controller={controller} state={state} category={category} setCategory={setCategory} t={t} />
    : null
}

export function ReferenceNavigation({ controller, t }: ReferenceNavigationProps) {
  return controller === undefined ? null : <ActiveReferenceNavigation controller={controller} t={t} />
}
