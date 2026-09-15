/**
 * Executes the built browser bundle the way the DSH web runtime does: a
 * window.__ModuleLoader__ capture, a require that answers the loader module
 * table from the package's own dsh.client declaration, then a factory run.
 * Skipped when the bundle has not been built yet (`pnpm build` first).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'lib', 'client.js')

test('built browser bundle loads through __ModuleLoader__ and exports the plugin shape', async (t) => {
  if (!existsSync(bundle)) {
    t.skip('lib/client.js not built — run pnpm build first')
    return
  }
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dsh?: { client?: { external?: string[] } }
  }
  const external = new Set(manifest.dsh?.client?.external ?? [])

  const loaded: Array<{ id: string }> = []
  const window_ = {
    __ModuleLoader__: {
      load: (row: { id: string }): void => { loaded.push(row) },
    },
  } as unknown as typeof globalThis
  const savedWindow = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = window_
  t.after(() => {
    ;(globalThis as { window?: unknown }).window = savedWindow
  })

  const require = (spec: string): unknown => {
    // The platform seeds (react, cordis) and the plugin's own declared
    // externals all arrive materialized before a dynamic bundle runs.
    if (spec === 'react' || spec === 'react/jsx-runtime' || external.has(spec)) return { stub: spec }
    throw new Error(`require("${spec}") missed the module table — not a platform seed word and not declared in dsh.client.external`)
  }

  // The bundle is an ESM file whose only side effect is the load() call; a
  // data-URL import keeps it out of the module cache between runs.
  const code = readFileSync(bundle, 'utf8')
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

  assert.equal(loaded.length, 1)
  assert.equal(loaded[0]?.id, 'dsh-left-panel')
  const factory = (code.match(/factory: \(require\) => \{/)?.length ?? 0) > 0
  assert.equal(factory, true, 'bundle wraps itself in the ModuleLoader factory form')

  // Execute the captured factory: strip the load(...) wrapper head, the
  // factory's own closing brace and the wrapper tail, then run the body.
  const head = /factory: \(require\) => \{\n/
  const tail = /\n\t\}\n\}\);\s*\n*(?:\/\/# sourceMappingURL=[^\n]*)?\s*$/
  const headMatch = head.exec(code)
  assert.ok(headMatch, 'factory head found')
  const tailIndex = code.search(tail)
  assert.ok(tailIndex > 0, 'factory tail found')
  const body = code.slice((headMatch.index ?? 0) + headMatch[0].length, tailIndex)
  assert.equal(body.includes('window.__ModuleLoader__'), false, 'wrapper head stripped')
  // The factory closes with its own "return module.exports;" (the banner's
  // intro declares the module vars); its return value is the plugin half.
  const fn = new Function('require', body)
  const plugin = fn(require) as { name?: unknown; inject?: unknown; apply?: unknown }
  assert.equal(plugin.name, 'left-panel')
  assert.ok(Array.isArray(plugin.inject))
  assert.equal(typeof plugin.apply, 'function')
})
