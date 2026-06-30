import fs from 'node:fs'

import { describe, it, expect, beforeAll } from 'vitest'

import type { RunnerScriptExecutionRequest } from '../../src/runner/types'
import { Runner } from '../../src/runner/Runner'

import { save } from 'meshup/src/utils';

//// SETTINGS ////

const MAX = 2; // use for step by step testing - undefined for all

////

const SCRIPTS = fs.readdirSync('./tests/cadscripts/scripts')
                    .filter(f => f.endsWith('.js'))
                    .slice(0,MAX)
const KERNEL = 'mesh' // default kernel for all tests, can be set per test in request


describe('cadscripts - mesh mode', () =>
{
    let runner: Runner

    beforeAll(async () =>
    {
        runner = await new Runner().load()
    })


    // Scripts are modules that can be dynamically loaded
    SCRIPTS.forEach((filename) =>
    {
        it(`runs "${filename}"`, async () =>
        {
            const script = (await import('./scripts/' + filename)).default; // script should export default with code and optionally params

            console.log(script);

            const request: RunnerScriptExecutionRequest = {
                kernel: 'mesh',
                script: script,
                outputs: ['default/model/gltf'],
            }
            
            const result = await runner.execute(request)
            expect(result.status).toBe('success')
            expect(result.outputs[0].path.resolvedPath).toBe('default/model/gltf');

            save('test.' + filename.replace('.js','.gltf'), result.outputs[0].output as Uint8Array);
            
        })
    })
})
