#!/usr/bin/env node
/**
 * Vitest integration test suite for ExecutionWorker class
 * Uses real Redis container via testcontainers
 * Run with: npm test or vitest
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { ExecutionWorker } from '../../src/ExecutionWorker';
import { ExecutionBroker } from '../../src/ExecutionBroker';
import { connectToRedis } from '../../src/utils';
import { Library } from '../../src/Library';

import { startContainers, stopContainers, getRedisConfig } from './setup';

//// TEST SETUP ////

let worker: ExecutionWorker;

beforeAll(async () => {
        // Start Redis container
        await startContainers(['redis']);
    }, 60000); // 60 second timeout for container startup

afterAll(async () => {
    // Stop Redis container
    await stopContainers();
}, 30000);


//// TESTS ////

describe.sequential('ExecutionWorker Tests', () => 
{
    it('should create an ExecutionWorker instance with default config', () => 
    {
            const redisConfig = getRedisConfig();
            worker = new ExecutionWorker(redisConfig);
            expect(worker).toBeDefined();
            expect(worker).toBeInstanceOf(ExecutionWorker);
    });

    it('should create an ExecutionWorker instance with custom Redis config', () => 
    {
            const redisConfig = getRedisConfig();
            worker = new ExecutionWorker({
                ...redisConfig,
                password: undefined,
            });
            expect(worker).toBeDefined();
            expect(worker).toBeInstanceOf(ExecutionWorker);
    });

    it('should be able to connect to local redis', async () => 
    {
        const redisConfig = getRedisConfig();
        const isConnected = await connectToRedis(redisConfig, true); // NOTE: close to not bug other tests
        expect(isConnected).toBe(true);
    });

    it('should initialize the worker and return itself', async () => 
    {
            const redisConfig = getRedisConfig();
            worker = new ExecutionWorker(redisConfig);
            const result = await worker.init();
            expect(result).toBe(worker);
    }, 120000); // 2 minute timeout for OC loading
    
    it('should pass health check with valid GLB output', async () => 
    {
        const result = await worker.checkHealth();
        expect(result).toBe(true);

    }, 120000);

    it('should execute a local script', async() => 
    {
        // only redis needs to be available
        const SCRIPT_AUTHOR = 'test';
        const SCRIPT_NAME =  'testbox'; 

        const redisConfig = getRedisConfig();
        const broker = await new ExecutionBroker(redisConfig).init(); // default Redis config is used
        const worker = await new ExecutionWorker(redisConfig).init();

        expect(broker).toBeDefined();
        expect(worker).toBeDefined();

        const library = new Library(); // by default searches in ./scripts
        expect(library).toBeDefined();

        const script = await library.getLatestScriptVersion(SCRIPT_AUTHOR, SCRIPT_NAME); 
        expect(script).toBeDefined();

        const task = {
            script: script,
            params: { SIZE: 15 },
            outputs: [ 
                // NOTE: for dev some example outputs
                'default/model/glb',  // default output (default pipeline, model in glb format)
                //'default/model/glb?data=false&pointAndLines=false&shapesAsPointAndLines=false', 
                //'default/docs/report/pdf',
                //'extra/model/glb', // pipeline defined output
                //'default/model/dae' // NOTE:text-based
                //'techdraw/model/svg' // NOTE:text-based
                //'techdraw/model/dxf' // NOTE:text-based
                //'default/model/dae'
                //'default/model/obj'
                //'offer/tables/*/gsheets' // TODO: Make more robust - now it still checks tables
                // 'extra/model/glb'
                //'techdraw/model/dxf'
            ],
            cache: false // for testing always false
        }

        const taskResult = await broker.submitTask(task);

        expect(taskResult).toBeDefined();
        expect(taskResult.result).toBeDefined();
        expect(taskResult.result.outputs).toBeDefined();
        expect(Array.isArray(taskResult.result.outputs)).toBe(true);
        
        // Output for developement
        taskResult.result.outputs.forEach((output,i) => 
        {            
            console.info(`Output: ${output.path.resolvedPath} -> ${output.output.length} `);

            const realOutput = output.path.resolvedPath;
            expect(task.outputs[i]).toEqual(realOutput);

            /* DEBUG

                const ext = output.path.resolvedPath.split('/').pop();
                const fileName = script.name + '_' + output.path.resolvedPath.replace(/\//g, '_') + '.' + ext;
                console.log(`File will be saved as: ${fileName}`); 

                // text based output
                let data;
                if(typeof output.output === 'string')
                {
                    // Raw string
                    data = output.output;
                }
                else 
                {  
                    // Binary / ArrayBuffer
                    // NOTE: If by any change the output is originally a string this works too (happens with conversion)
                    data = Buffer.from(output.output.data as string, 'base64');
                }
                
                fs.writeFileSync(fileName, data);

            */

        });
    });

});
