import { describe, it, expect, vi, afterEach } from 'vitest'

import { Runner } from '../../../src/runner/Runner'

/**
 * The published-configurator path for $component('./name').
 *
 * A visitor holds no copy of the author's workspace, so nothing is linked in via
 * linkComponentScripts(). The Runner then falls back to the author's SHARED library —
 * which is why publishing auto-shares a script's components (see the editor's
 * component-sharing service).
 *
 * fetch() is stubbed: these tests are about the resolution/caching decisions, not HTTP.
 */

const SHARED_COMPONENT = {
    success: true,
    data: {
        name: 'timberwall',
        author: 'archiyou',
        version: '0.3',
        code: `timberwall = box(100, 20, 250).color('brown');`,
    },
}

function stubFetch(impl: (url: string) => { status?: number; body?: unknown })
{
    const spy = vi.fn(async (url: string) =>
    {
        const { status = 200, body = {} } = impl(url)
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
        } as unknown as Response
    })
    vi.stubGlobal('fetch', spy)
    return spy
}

afterEach(() => { vi.unstubAllGlobals() })

describe('Runner: $component("./name") from the author\'s shared library', () =>
{
    it('fetches the component from the shared library of the script author', async () =>
    {
        const runner = await new Runner().load()
        const fetchSpy = stubFetch(() => ({ body: SHARED_COMPONENT }))

        await runner._prefetchComponentScripts({
            kernel: 'mesh',
            script: { author: 'archiyou', name: 'housetest', code: `$component('./timberwall').model();` },
            componentLibraryUrl: '/api',
        } as any)

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fetchSpy.mock.calls[0][0]).toBe('/api/scripts/shared/archiyou/timberwall')

        const cached = runner.getComponentScriptFromCache('./timberwall')
        expect(cached).not.toBeNull()
        expect(cached!.code).toBe(SHARED_COMPONENT.data.code)
    })

    it('prefers a linked script over the library (the editor keeps resolving locally)', async () =>
    {
        const runner = await new Runner().load()
        const fetchSpy = stubFetch(() => ({ body: SHARED_COMPONENT }))

        const local = (await import('../../../src/Script')).Script.fromData({
            name: 'timberwall',
            code: `timberwall = box(1, 1, 1);`, // the author's UNSAVED working copy
        })!
        runner.linkComponentScripts([local])

        await runner._prefetchComponentScripts({
            kernel: 'mesh',
            script: { author: 'archiyou', name: 'housetest', code: `$component('./timberwall').model();` },
            componentLibraryUrl: '/api',
        } as any)

        expect(fetchSpy).not.toHaveBeenCalled()
        expect(runner.getComponentScriptFromCache('./timberwall')!.code).toBe(`timberwall = box(1, 1, 1);`)
    })

    it('fetches once for a component referenced many times', async () =>
    {
        const runner = await new Runner().load()
        const fetchSpy = stubFetch(() => ({ body: SHARED_COMPONENT }))

        const code = `
            a = $component('./timberwall', { W: 1 }).model();
            b = $component('./timberwall', { W: 2 }).model();
            c = $component('./timberwall', { W: 3 }).model();
        `
        const request = {
            kernel: 'mesh',
            script: { author: 'archiyou', name: 'housetest', code },
            componentLibraryUrl: '/api',
        } as any

        await runner._prefetchComponentScripts(request)
        await runner._prefetchComponentScripts(request) // execute() prefetches twice

        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('reports the component as missing when it was never shared (404)', async () =>
    {
        const runner = await new Runner().load()
        stubFetch(() => ({ status: 404, body: { success: false } }))

        const { missing } = await runner._prefetchComponentScripts({
            kernel: 'mesh',
            script: { author: 'archiyou', name: 'housetest', code: `$component('./timberwall').model();` },
            componentLibraryUrl: '/api',
        } as any)

        expect(missing).toEqual(['./timberwall'])
        expect(runner.getComponentScriptFromCache('./timberwall')).toBeNull()
    })

    it('does not call out at all when the request carries no library url', async () =>
    {
        const runner = await new Runner().load()
        const fetchSpy = stubFetch(() => ({ body: SHARED_COMPONENT }))

        await runner._prefetchComponentScripts({
            kernel: 'mesh',
            script: { author: 'archiyou', name: 'housetest', code: `$component('./timberwall').model();` },
        } as any)

        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('does not call out when the script has no author to look up', async () =>
    {
        const runner = await new Runner().load()
        const fetchSpy = stubFetch(() => ({ body: SHARED_COMPONENT }))

        await runner._prefetchComponentScripts({
            kernel: 'mesh',
            script: { name: 'housetest', code: `$component('./timberwall').model();` },
            componentLibraryUrl: '/api',
        } as any)

        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('resolves a nested component against the same author', async () =>
    {
        const runner = await new Runner().load()
        const fetchSpy = stubFetch((url) => url.endsWith('/wall')
            ? { body: { success: true, data: { name: 'wall', author: 'archiyou', code: `$component('./stud').model();` } } }
            : { body: { success: true, data: { name: 'stud', author: 'archiyou', code: `stud = box(5,5,100);` } } })

        await runner._prefetchComponentScripts({
            kernel: 'mesh',
            script: { author: 'archiyou', name: 'housetest', code: `$component('./wall').model();` },
            componentLibraryUrl: '/api',
        } as any)

        // The nested prefetch is fire-and-forget inside the Runner; give it a tick.
        await new Promise(r => setTimeout(r, 0))

        expect(fetchSpy.mock.calls.map(c => c[0])).toEqual([
            '/api/scripts/shared/archiyou/wall',
            '/api/scripts/shared/archiyou/stud',
        ])
    })

    it('runs a script whose only component comes from the shared library', async () =>
    {
        const runner = await new Runner().load()
        stubFetch(() => ({ body: SHARED_COMPONENT }))

        const result = await runner.execute({
            kernel: 'mesh',
            script: {
                author: 'archiyou',
                name: 'housetest',
                code: `wall = $component('./timberwall').model();`,
            },
            componentLibraryUrl: '/api',
            outputs: ['default/model/glb'],
        } as any)

        expect(result.status).toBe('success')
    })
})
