#!/usr/bin/env node
/**
 * Vitest test suite for Library class
 * Run with: npm test or vitest
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { Library } from '../../src/Library';
import { Script } from '@archiyou/core/src/execution/Script';
import type { ScriptData } from '@archiyou/core/src/execution/types';
import type { ScriptPublished } from '@archiyou/core/src/modeler/brep/types';
//import { Script, ScriptData, ScriptPublished } from '../../lib/archiyou-core/src/internal';

//// TEST ENVIRONMENT SETUP ////

let testDir: string;
let testScript: ScriptData;

function writeTestScript(name, version:string, testDir:string): ScriptData
{
   const testScript = {
        id: name, // not really used
        name: name,
        author: 'testuser',
        version: version,
        namespace: `testuser/${name}`,
        description: 'A test script for validation',
        tags: ['test'],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        code: 'b = box();',
        params: {},
        presets: {},
        published: {
            title: 'Test Script',
            version: version,
            date: new Date().toISOString(),
        } as ScriptPublished
    } as ScriptData;

    // Create test directory structure
    const scriptPath = path.join(testDir, 'testuser', name, version);
    fs.mkdirSync(scriptPath, { recursive: true });

    // IMPORTANT: Save as script.js, not as json
    fs.writeFileSync(
        path.join(scriptPath, 'script.js'), 
        Script.fromData(testScript).toModuleString()
    );
    return testScript;   
}

beforeEach(() => 
{
    testDir = './test-scripts';
    testScript = writeTestScript('test-script', '1.0.0', testDir);
    // Set test environment
    process.env.LIBRARY_PATH = testDir;
});

afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir))
    {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
});

//// TESTS ////

describe('Library', () => {
    describe('Constructor', () => {
        it('should create a Library instance', () => {
            const library = new Library(testDir);
            expect(library).toBeDefined();
            expect(library).toBeInstanceOf(Library);
        });
    });

    describe('Load All Scripts', () => {
        it('should load all scripts from the test directory', async () => {
            const library = new Library();
            const scripts = await library.getAllScripts();
            
            expect(scripts).toHaveLength(1);
            expect(scripts[0].name).toBe(testScript.name);
            expect(scripts[0].author).toBe(testScript.author);
        });
    });

    describe('Get Scripts By Author', () => {
        it('should return scripts for a specific author', async () => {
            const library = new Library(testDir);
            const scripts = await library.getScriptsByAuthor('testuser');
            
            expect(scripts).toHaveLength(1);
            expect(scripts[0].author).toBe('testuser');
        });

        it('should return empty array for non-existent author', async () => {
            const library = new Library();
            const scripts = await library.getScriptsByAuthor('nonexistent');
            
            expect(scripts).toHaveLength(0);
        });
    });

    describe('Get Specific Script', () => {
        it('should find a specific script by author, name, and version', async () => {
            const library = new Library();
            const script = await library.getScript('testuser', 'test-script', '1.0.0');
            
            expect(script).toBeDefined();
            expect(script?.name).toBe('test-script');
            expect(script?.author).toBe('testuser');
            expect(script?.published?.version).toBe('1.0.0');
        });

        it('should return null for non-existent script', async () => {
            const library = new Library();
            const script = await library.getScript('testuser', 'nonexistent', '1.0.0');
            
            expect(script).toBeNull();
        });
    });

    describe('Get Latest Script Version', () => {
        it('should find the latest version of a script', async () => {
            const library = new Library();
            const latestScript = await library.getLatestScriptVersion('testuser', 'test-script');
            
            expect(latestScript).toBeDefined();
            expect(latestScript?.name).toBe('test-script');
            expect(latestScript?.author).toBe('testuser');
        });

        it('should return null for non-existent script', async () => {
            const library = new Library();
            const latestScript = await library.getLatestScriptVersion('testuser', 'nonexistent');
            
            expect(latestScript).toBeNull();
        });
    });

    describe('Multiple Versions', () => {
        beforeEach(() => 
        {
            // Add a second version for testing
            writeTestScript('test-script', '2.0.0', testDir);
        });

        it('should return the latest version when multiple versions exist', async () => {
            const library = new Library();
            const latestScript = await library.getLatestScriptVersion('testuser', 'test-script');
            
            expect(latestScript).toBeDefined();
            expect(latestScript?.published?.version).toBe('2.0.0');
        });

        it('should return all versions when getting scripts by author', async () => {
            const library = new Library();
            const scripts = await library.getScriptsByAuthor('testuser');
            
            expect(scripts).toHaveLength(2);
            const versions = scripts.map(s => s.published?.version).sort();
            expect(versions).toEqual(['1.0.0', '2.0.0']);
        });
    });
});