import { describe, expect, it } from 'vitest'

import { Script } from '../../../src/execution/Script'
import { ScriptParam } from '../../../src/execution/ScriptParam'

describe('Execution Script Schemas', () =>
{
    it('loads nested object and list params through ScriptParam.fromData()', () =>
    {
        const param = ScriptParam.fromData({
            name: 'settings',
            label: 'Settings',
            schema: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean', default: true },
                    points:  {
                        type:  'array',
                        items: {
                            type:       'object',
                            properties: {
                                x: { type: 'number', minimum: 0, maximum: 10, default: 0 },
                                y: { type: 'number', minimum: 0, maximum: 10, default: 0 },
                            },
                        },
                    },
                },
            },
        })

        expect(param.name).toBe('SETTINGS')
        expect(param.validateValue({
            enabled: true,
            points: [
                { x: 1, y: 2 },
                { x: 3, y: 4 },
            ],
        })).toBe(true)
        expect(param.validateValue({
            enabled: true,
            points: [
                { x: 1, y: 12 },  // y: 12 exceeds maximum 10
            ],
        })).toBe(false)
    })

    it('validates published params with the param schema', () =>
    {
        const script = Script.fromData({
            name:   'demo',
            author: 'tester',
            code:   'box(1,1,1)',
            published: {
                version: '1.2.3',
                params: {
                    CONFIG: {
                        name:  'config',
                        label: 'Config',
                        schema: {
                            type:       'object',
                            properties: {
                                items: {
                                    type:  'array',
                                    items: { type: 'string', maxLength: 32, default: 'a' },
                                },
                            },
                        },
                    },
                },
            },
        })

        expect(script).toBeTruthy()
        expect((script as Script).published?.params?.CONFIG.schema).toBeDefined()
    })

    it('rejects invalid semver versions in published scripts', () =>
    {
        const script = Script.fromData({
            name:   'demo',
            author: 'tester',
            code:   'box(1,1,1)',
            published: { version: 'not-a-version' },
        })

        expect(script).toBeNull()
    })

    it('rejects params missing the required schema field', () =>
    {
        const script = Script.fromData({
            name:   'demo',
            author: 'tester',
            code:   'box(1,1,1)',
            published: {
                version: '1.0.0',
                params: {
                    BAD: {
                        name:  'bad',
                        label: 'Bad',
                        // missing required 'schema' field
                    } as any,
                },
            },
        })

        expect(script).toBeNull()
    })
})