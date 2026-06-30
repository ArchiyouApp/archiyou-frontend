
import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import { config as dotenvConfig } from 'dotenv';
import { Library } from '../../src/Library';
import { ExecutionManager } from '../../src/ExecutionManager';
import { Script } from '@archiyou/core/src/execution/Script'
//import { Script } from '../../lib/archiyou-core/src/internal';

import { startContainers, stopContainers } from './setup';


//// SETTINGS ////
const SKIP_SCRIPTS = ['test/'] // any scripts that match these pattern for {author}/{name} will be skipped

dotenvConfig();

const libraryPath = process.env.LIBRARY_PATH || './scripts'; // from main folder
let library:Library;
let executionManager:ExecutionManager;
let allScripts:Array<Script>;

let broker;
let worker;

//// SETUP ////

beforeEach(async () => 
{
    // make sure redis is running
    await startContainers(['redis']);
});

afterAll(async () => 
{
    // stop containers
    await stopContainers();
});

//// TESTS ////

describe.sequential('Library Integration Tests', () => {

    it('should load all script from local library at', async () => 
    {
        library = new Library(libraryPath);
        allScripts = await library.getAllScripts();
        expect(allScripts).toBeInstanceOf(Array);
        expect(allScripts.length).toBeGreaterThan(0);
        console.info(`Loaded ${allScripts.length} scripts from library at: ${libraryPath}`);
    });

    /*
    it('should initiate broker and worker', async () => 
    {
        // Load Broker and Worker classes
        const ExecutionBrokerClass = (await import('../../src/ExecutionBroker')).ExecutionBroker;
        const ExecutionWorkerClass = (await import('../../src/ExecutionWorker')).ExecutionWorker;

        // Initiate broker and worker
        broker = await new ExecutionBrokerClass().init();
        worker = await new ExecutionWorkerClass().init();

        // Wait for broker/worker to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        expect(broker).toBeDefined();
        expect(worker).toBeDefined();
    });
    
    it('should initiate an ExecutionManager', async () => 
    {
        // Load ExecutionManager class and initiate
        const ExecutionManager = (await import('../../src/ExecutionManager')).ExecutionManager;
        executionManager = await new ExecutionManager().init();
    });

    it('Should execute all scripts in the library', async () => {
        for (const script of allScripts)
        {
            if(SKIP_SCRIPTS.some(pattern => script.namespace().startsWith(pattern)))
            {
                console.warn(`==== ⏭️  Skipping script: ${script.name} by ${script.author} (v${script.published.version}): See SKIP_SCRIPTS: ${SKIP_SCRIPTS.join(", ")} ====` );
                continue;
            }

            console.info(`==== 🚀 Executing script: ${script.name} by ${script.author} (v${script.published.version}) ====`);
            const r = await executionManager.execute({
                script: script,
                // default params
                outputs: ['default/model/glb'],
                cache: false,
                forceFileResponse: false
            }) as ApiExecutionResponse;
            expect(r).toBeDefined();
            console.log('Result from execution:', r);
            expect(r.success).toBe(true);
            console.info(`✅ Successfully executed script: ${script.name}/${script.author} (v${script.published.version}): Took ${r?.data?.duration}ms`);
        }
    });it('should pass health check with valid GLB output', async () => {
        const redisConfig = getRedisConfig();
        worker = new ExecutionWorker(redisConfig);
        await worker.init();
        
        const result = await worker.checkHealth();
        
        expect(result).toBe(true);
    }, 120000);
    */
});
