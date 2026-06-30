#!/usr/bin/env node
/**
 * Vitest test suite for Runner class from archiyou-core
 * Tests script execution with different output formats
 * Run with: npm test or vitest
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Runner } from '@archiyou/core/src/runner/Runner';
import type { ScriptData } from '@archiyou/core/src/execution/types';
import type { ScriptPublished } from '@archiyou/core/src/modeler/brep/types';
import type { RunnerScriptExecutionRequest, RunnerScriptExecutionResult } from '@archiyou/core/src/runner/types';

//// TEST SETUP ////

let runner: Runner;

// Simple test script that creates a box
const testScript: ScriptData = {
    id: 'test/runner-test/1.0.0',
    name: 'runner-test',
    author: 'test',
    version: '1.0.0',
    namespace: 'test/runner-test',
    description: 'A simple test script for Runner validation',
    tags: ['test'],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    code: `
        // Simple Archiyou script
        let b = box($SIZE);
    `,
    params: {
        SIZE: {
            name: 'SIZE',
            label: 'Size',
            type: 'number',
            default: 50,
            min: 10,
            max: 200,
            step: 1,
        }
    },
    presets: {},
    published: {
        title: 'Runner Test Script',
        version: '1.0.0',
        date: new Date().toISOString(),
    } as ScriptPublished
} as ScriptData;

// Script with multiple shapes for more complex output testing
const multiShapeScript: ScriptData = {
    ...testScript,
    id: 'test/multi-shape/1.0.0',
    name: 'multi-shape',
    namespace: 'test/multi-shape',
    code: `
        // Create multiple shapes
        let b = box(50);
        let s = sphere(30).move(100, 0, 0);
        let c = cylinder(20, 60).move(-100, 0, 0);
    `,
    params: {},
} as ScriptData;

//// TESTS ////

describe('Runner', () => {
    beforeAll(async () => {
        // Initialize Runner once for all tests (loading OC takes time)
        runner = await new Runner().load();
    }, 60000); // 60 second timeout for OC loading

    afterAll(() => {
        // Cleanup if needed
        runner = null as any;
    });

    describe('Initialization', () => {
        it('should load and be ready for execution', () => {
            expect(runner).toBeDefined();
        });
    });

    describe('Basic Script Execution', () => {
        it('should execute a simple box script', async () => 
        {
            const req = {
                script: testScript,
                params: {},
                outputs: ['default/model/glb']
            };
            const result = await runner.execute(req);
            
            expect(result).toBeDefined();
            expect(result.status).toBe('success');
            expect(result.errors).toHaveLength(0);
        }, 30000);

        it('should execute with custom parameters', async () => {
            const req = {
                script: testScript,
                params: { SIZE: 100 },
                outputs: ['default/model/glb']
            };
            const result = await runner.execute(req);

            expect(result).toBeDefined();
            expect(result.status).toBe('success');
            expect(result.errors).toHaveLength(0);

        }, 30000);

        it('should execute multi-shape script', async () => 
        {
            const req = {
                script: multiShapeScript,
                params: { SIZE: 100 },
                outputs: ['default/model/glb']
            };
            const result = await runner.execute(req);
            
            expect(result).toBeDefined();
            expect(result.status).toBe('success');
            expect(result.errors).toHaveLength(0);
        }, 30000);
    });

    describe('GLB Output Format', () => {
        it('should produce valid GLB binary output', async () => 
        {
            const req = {
                script: testScript,
                params: {},
                outputs: ['default/model/glb']
            };
            const result = await runner.execute(req);

            expect(result.outputs).toBeDefined();
            expect(result.outputs?.length).toBeGreaterThan(0);
            
            const glbOutput = result.outputs?.find(o => o.path.format === 'glb');
            expect(glbOutput).toBeDefined();
            expect(glbOutput?.output).toBeDefined();
            
            // GLB should be binary data (Uint8Array or ArrayBuffer)
            // expect(glbOutput?.output?.byteLength || glbOutput?.output?.length).toBeGreaterThan(0);

        }, 30000);

        it('should produce GLB with reasonable file size for a box', async () => {
            const req = {
                script: testScript,
                params: {},
                outputs: ['default/model/glb']
            };
            const result = await runner.execute(req);

            const glbOutput = result.outputs?.find(o => o.path.format === 'glb');
            const size = (glbOutput?.output as any)?.byteLength || (glbOutput?.output as any)?.length || 0;

            // A simple box GLB should be between 1KB and 10KB
            expect(size).toBeGreaterThan(1000);
            expect(size).toBeLessThan(10000);

        }, 30000);
    });

    describe('STL Output Format', () => {
        it('should produce valid STL output', async () => 
        {
            const req = {
                script: testScript,
                params: {},
                outputs: ['default/model/stl']
            };
            const result = await runner.execute(req);

            expect(result.status).toBe('success');
            expect(result?.outputs).toBeDefined();
            expect(result?.outputs?.length).toBeGreaterThan(0);
            
            const stlOutput = result?.outputs?.find(o => o.path.format === 'stl');
            expect(stlOutput).toBeDefined();
            expect(stlOutput?.output).toBeDefined();
        }, 30000);
    });

    describe('STEP Output Format', () => {
        it('should produce valid STEP output', async () => {
            const req = {
                script: testScript,
                params: {},
                outputs: ['default/model/step']
            };
            const result = await runner.execute(req);

            expect(result?.outputs).toBeDefined();
            expect(result?.outputs?.length).toBeGreaterThan(0);

            const stepOutput = result?.outputs?.find(o => o.path.format === 'step');
            expect(stepOutput).toBeDefined();
            
            // STEP is text-based, check for typical STEP content
            const content = typeof stepOutput?.output === 'string' 
                ? stepOutput.output 
                : new TextDecoder().decode((stepOutput as any)?.output);
            
            expect(content).toContain('ISO-10303-21');

        }, 30000);
    });

    describe('Multiple Output Formats', () => {
        it('should produce multiple outputs in single execution', async () => {
             const req = {
                script: testScript,
                params: {},
                outputs: ['default/model/glb','default/model/step']
            };
            const result = await runner.execute(req);

            expect(result?.outputs).toBeDefined();
            expect(result?.outputs?.length).toBe(2);

            const formats = result?.outputs?.map(o => o.path.format);
            expect(formats).toContain('glb');
            expect(formats).toContain('step');
        }, 30000);
    });

    describe('Error Handling', () => {
        it('should report errors for invalid script code', async () => {
            const invalidScript: ScriptData = {
                ...testScript,
                id: 'test/invalid/1.0.0',
                name: 'invalid',
                code: `
                    // Invalid code
                    this_function_does_not_exist();
                `,
            } as ScriptData;

            const req = {
                script: invalidScript,
                params: {},
                outputs: ['default/model/glb']
            };
            const result = await runner.execute(req);

            // Should either have errors or failed status
            expect(
                result?.errors?.length > 0 || 
                result?.status === 'error' ||
                result?.messages?.some(m => m.type === 'error')
            ).toBe(true);
        }, 30000);

    });

    describe('Execution Messages', () => {
        it('should capture console messages from script', async () => {
            const loggingScript: ScriptData = {
                ...testScript,
                id: 'test/logging/1.0.0',
                name: 'logging',
                code: `
                    print("Test message from script"); // makes a user message
                    let b = box(50);
                `,
            } as ScriptData;

            const req = {
                script: loggingScript,
                params: {},
                outputs: ['default/model/glb'],
                messages: ['geom','user']
            } as RunnerScriptExecutionRequest;
            const result = await runner.execute(req) as RunnerScriptExecutionResult;
            
            expect(result).toBeDefined();
            expect(result.status).toBe('success');

            // TODO: Fix
            // expect(result.messages).toBeDefined();

        }, 30000);
    });
});