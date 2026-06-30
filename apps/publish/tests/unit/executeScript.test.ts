import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Runner } from '@archiyou/core/src/runner/Runner';
import { Script } from '@archiyou/core/src/execution/Script';
import { Library } from '../../src/Library';

/** A test to execute a specific script from Library directly with a Runner instance */

//// SETUP ////

//const SCRIPT_TEST_PATH = 'archiyou/urhousesketch:0.5.2';
const SCRIPT_TEST_PATH = 'ramon/bankje:0.5.0';
const SCRIPT_TEST_PARAMS = {
    // Leave empty for defaults
    // ENERGY_CALC: true,
}

let runner: Runner;
let library: Library;
let script: Script|null;

beforeAll(() => {
    library = new Library();
});


//// TESTS ////

describe('Should load the script', () => 
{
    it('should load the script from the library', async () => 
    {
        script = await library.getScriptByPath(SCRIPT_TEST_PATH);
        expect(script).toBeDefined();        
    });

    it('should init the Runner instance', async () => 
    {
        runner = new Runner();
        await runner.load();
        expect(runner).toBeDefined();
    });

    it('should execute the script with the runner', async () => 
    {
        if (!script) {
            throw new Error('Script not loaded');
        }

        const req = {
            script: script,
            params: SCRIPT_TEST_PARAMS, // defaults
            outputs: ['default/model/glb']
        };
        const result = await runner.execute(req);

        expect(result).toBeDefined();
        expect(result.status).toBe('success');
        expect(result.errors).toHaveLength(0);      
    });
});