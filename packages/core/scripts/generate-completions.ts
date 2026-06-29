/**
 * generate-completions.ts
 *
 * Build-time script that reads the archiyou-core-next TypeScript source and
 * generates `completions-data.generated.ts` consumed by the web editor's
 * CodeMirror autocomplete system.
 *
 * Run from the archiyou-core-next package root:
 *   pnpm run generate:completions
 *
 * Sources read:
 *   src/modeler/Modeler.ts            → modelerFunctions
 *   src/modeler/SmartMixin.ts         → shapeCommonMembers (mixin methods)
 *   src/modeler/SmartShapes.ts        → per-class own methods
 *   src/modeler/SmartShapeCollection.ts → SmartShapeCollection members
 *   devlibs/meshup/src/Shape.ts       → shared transform/info methods
 *   devlibs/meshup/src/Mesh.ts        → SmartMesh kernel methods
 *   devlibs/meshup/src/Curve.ts       → SmartCurve kernel methods
 *   devlibs/meshup/src/Point.ts       → Point members
 *   devlibs/meshup/src/Vector.ts      → Vector members
 *   devlibs/meshup/src/Bbox.ts        → Bbox members
 *   devlibs/meshup/src/OBbox.ts       → OBbox members
 *   src/modeler/brep/Solid.ts         → SmartSolid kernel methods (brep)
 *   src/modeler/brep/Edge.ts          → SmartEdge kernel methods
 *   src/modeler/brep/Wire.ts          → SmartWire kernel methods
 *   src/modeler/brep/Face.ts          → SmartFace kernel methods
 */

import { Project, SyntaxKind, Scope, type ClassDeclaration, type MethodDeclaration, type GetAccessorDeclaration } from 'ts-morph'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface MethodInfo
{
    label: string
    detail: string
    info?: string
    type: 'function' | 'property'
}

interface ShapeClassInfo
{
    label: string
    detail: string
    statics?: MethodInfo[]
    members: MethodInfo[]
}

/* ------------------------------------------------------------------ */
/*  ts-morph project setup                                              */
/* ------------------------------------------------------------------ */

const project = new Project({
    tsConfigFilePath: join(ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false, // include all files from tsconfig
})

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Symbols that exist on all JS objects — exclude these from completions. */
const OBJECT_PROTOTYPE_METHODS = new Set([
    'constructor', 'toString', 'toLocaleString', 'valueOf', 'hasOwnProperty',
    'isPrototypeOf', 'propertyIsEnumerable', '__defineGetter__', '__defineSetter__',
    '__lookupGetter__', '__lookupSetter__', '__proto__',
])

/** Known internal/private names to exclude even without underscore prefix. */
const INTERNAL_NAMES = new Set([
    'inner', 'type', 'subtype', 'isShape', 'isShapeCollection', 'dispose',
    'id', 'csgrs', 'style', 'metadata',
    // duck-type guards
    'isShapeClass',
    // low-level kernel bridges not useful in user scripts
    'rotateQuaternion', 'update', 'addAnnotations',
    // brep internals
    'oc', 'ocShape', 'ocVertex', 'ocEdge', 'ocWire', 'ocFace', 'ocShell', 'ocSolid',
    'applyTransform', 'fromOcShape', 'toOcShape', 'boundingBox',
])

function isPublic(method: MethodDeclaration | GetAccessorDeclaration): boolean
{
    const name = method.getName()
    if (name.startsWith('_')) return false
    if (OBJECT_PROTOTYPE_METHODS.has(name)) return false
    if (INTERNAL_NAMES.has(name)) return false
    const scope = method.getScope()
    return scope !== Scope.Private && scope !== Scope.Protected
}

function formatMethodSignature(method: MethodDeclaration): string
{
    const params = method.getParameters().map(p =>
    {
        const opt = p.isOptional() || p.isRestParameter() ? '?' : ''
        const rest = p.isRestParameter() ? '...' : ''
        const typeNode = p.getTypeNode()
        const typeText = typeNode ? typeNode.getText() : 'any'
        return `${rest}${p.getName()}${opt}: ${typeText}`
    }).join(', ')

    const returnNode = method.getReturnTypeNode()
    const returnText = returnNode ? returnNode.getText() : 'any'

    return `(${params}): ${returnText}`
}

function getJsDoc(method: MethodDeclaration): string | undefined
{
    return method.getJsDocs()[0]?.getDescription()?.trim() || undefined
}

/** Extract all public instance methods from a class, excluding Object prototype methods. */
function extractPublicMethods(cls: ClassDeclaration, excludeNames?: Set<string>): MethodInfo[]
{
    const results: MethodInfo[] = []
    const seen = new Set<string>()

    for (const method of cls.getInstanceMethods())
    {
        if (!isPublic(method)) continue
        const name = method.getName()
        if (excludeNames?.has(name)) continue
        if (seen.has(name)) continue
        seen.add(name)

        results.push({
            label: name,
            detail: formatMethodSignature(method),
            info: getJsDoc(method),
            type: 'function',
        })
    }

    return results
}

/** Get a class from a source file by class name, throwing if not found. */
function getClass(relativeFilePath: string, className: string): ClassDeclaration
{
    const absPath = join(ROOT, relativeFilePath)
    const file = project.getSourceFile(absPath) ?? project.addSourceFileAtPath(absPath)
    const cls = file.getClass(className)
    if (!cls) throw new Error(`Class '${className}' not found in ${relativeFilePath}`)
    return cls
}

/** Merge MethodInfo arrays, keeping first occurrence only (dedup by label). */
function mergeMembers(...arrays: MethodInfo[][]): MethodInfo[]
{
    const seen = new Set<string>()
    const result: MethodInfo[] = []
    for (const arr of arrays)
    {
        for (const m of arr)
        {
            if (!seen.has(m.label))
            {
                seen.add(m.label)
                result.push(m)
            }
        }
    }
    return result
}

/* ------------------------------------------------------------------ */
/*  Extract: Modeler global functions                                   */
/* ------------------------------------------------------------------ */

// Read MODELER_METHODS_INTO_GLOBAL directly from constants.ts via ts-morph
const constantsFile = project.getSourceFileOrThrow(join(ROOT, 'src/constants.ts'))
const modelerMethodsDecl = constantsFile.getVariableDeclarationOrThrow('MODELER_METHODS_INTO_GLOBAL')
const modelerMethodsInit = modelerMethodsDecl.getInitializerOrThrow()
const globalMethodNames = new Set(
    modelerMethodsInit
        .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
        .getElements()
        .map(e => e.getText().replace(/['"]/g, '')),
)

const modelerClass = getClass('src/modeler/Modeler.ts', 'Modeler')
const modelerFunctions: MethodInfo[] = []

for (const method of modelerClass.getInstanceMethods())
{
    const name = method.getName()
    if (!globalMethodNames.has(name)) continue
    if (name.startsWith('_')) continue
    if (method.getScope() === Scope.Private || method.getScope() === Scope.Protected) continue

    modelerFunctions.push({
        label: name,
        detail: formatMethodSignature(method),
        info: getJsDoc(method),
        type: 'function',
    })
}

// Sort to match MODELER_METHODS_INTO_GLOBAL insertion order
modelerFunctions.sort((a, b) =>
{
    const ia = [...globalMethodNames].indexOf(a.label)
    const ib = [...globalMethodNames].indexOf(b.label)
    return ia - ib
})

/* ------------------------------------------------------------------ */
/*  Extract: SmartMixin public methods                                  */
/* ------------------------------------------------------------------ */

// withSmartShape() contains `const Mixed = class extends Base { ... }`.
// Grab the ClassExpression (SyntaxKind.ClassExpression) inside it.
const mixinFile = project.getSourceFileOrThrow(join(ROOT, 'src/modeler/SmartMixin.ts'))
const mixinFn = mixinFile.getFunctionOrThrow('withSmartShape')
const mixinClassExprs = mixinFn
    .getBody()!
    .getDescendantsOfKind(SyntaxKind.ClassExpression)

const mixinMethods: MethodInfo[] = []
if (mixinClassExprs.length > 0)
{
    const mixedExpr = mixinClassExprs[0]
    const seen = new Set<string>()
    for (const method of mixedExpr.getInstanceMethods())
    {
        const name = method.getName()
        if (name.startsWith('_')) continue
        if (OBJECT_PROTOTYPE_METHODS.has(name)) continue
        if (seen.has(name)) continue
        seen.add(name)
        mixinMethods.push({
            label: name,
            detail: formatMethodSignature(method),
            info: getJsDoc(method),
            type: 'function',
        })
    }
}

/* ------------------------------------------------------------------ */
/*  Extract: Kernel shape methods from meshup                           */
/* ------------------------------------------------------------------ */

const meshupShapeMethods = extractPublicMethods(getClass('devlibs/meshup/src/Shape.ts', 'Shape'))
const meshupMeshMethods  = extractPublicMethods(getClass('devlibs/meshup/src/Mesh.ts',  'Mesh'),  new Set(['type', 'constructor']))
const meshupCurveMethods = extractPublicMethods(getClass('devlibs/meshup/src/Curve.ts', 'Curve'), new Set(['type', 'constructor']))

/* ------------------------------------------------------------------ */
/*  Extract: Kernel shape methods from brep                             */
/* ------------------------------------------------------------------ */

let brepSolidMethods: MethodInfo[] = []
let brepEdgeMethods:  MethodInfo[] = []
let brepWireMethods:  MethodInfo[] = []
let brepFaceMethods:  MethodInfo[] = []

try { brepSolidMethods = extractPublicMethods(getClass('src/modeler/brep/Solid.ts', 'Solid')) } catch { /* brep may not have TS declarations */ }
try { brepEdgeMethods  = extractPublicMethods(getClass('src/modeler/brep/Edge.ts',  'Edge'))  } catch { /* skip */ }
try { brepWireMethods  = extractPublicMethods(getClass('src/modeler/brep/Wire.ts',  'Wire'))  } catch { /* skip */ }
try { brepFaceMethods  = extractPublicMethods(getClass('src/modeler/brep/Face.ts',  'Face'))  } catch { /* skip */ }

/* ------------------------------------------------------------------ */
/*  Extract: SmartShapes own methods per class                          */
/* ------------------------------------------------------------------ */

const smartShapesFile = project.getSourceFileOrThrow(join(ROOT, 'src/modeler/SmartShapes.ts'))

function smartOwnMethods(className: string): MethodInfo[]
{
    const cls = smartShapesFile.getClass(className)
    if (!cls) return []
    return extractPublicMethods(cls, new Set(['from', 'mode']))
}

const smartMeshOwnMethods      = smartOwnMethods('SmartMesh')
const smartMeshCurveOwnMethods = smartOwnMethods('SmartMeshCurve')
const smartBrepSolidOwnMethods = smartOwnMethods('SmartBrepSolid')
const smartBrepEdgeOwnMethods  = smartOwnMethods('SmartBrepEdge')
const smartBrepWireOwnMethods  = smartOwnMethods('SmartBrepWire')
const smartBrepFaceOwnMethods  = smartOwnMethods('SmartBrepFace')

/* ------------------------------------------------------------------ */
/*  Extract: SmartShapeCollection members                               */
/* ------------------------------------------------------------------ */

const smartCollectionMethods = extractPublicMethods(
    getClass('src/modeler/SmartShapeCollection.ts', 'SmartShapeCollection'),
    new Set(['type', 'isShape', 'isShapeCollection', 'isEmpty', 'children', 'getShapes', 'merge',
             'toOcCompound', 'getShapesByType', 'getShapesByTypes']),
)

/* ------------------------------------------------------------------ */
/*  Extract: Math types (Point, Vector, Bbox, OBbox)                    */
/* ------------------------------------------------------------------ */

const pointMethods  = extractPublicMethods(getClass('devlibs/meshup/src/Point.ts',  'Point'),  new Set(['from', 'type', 'isPoint']))
const vectorMethods = extractPublicMethods(getClass('devlibs/meshup/src/Vector.ts', 'Vector'), new Set(['from', 'isVector']))
const bboxMethods   = extractPublicMethods(getClass('devlibs/meshup/src/Bbox.ts',   'Bbox'),   new Set(['from', 'fromMesh']))
const obboxMethods  = extractPublicMethods(getClass('devlibs/meshup/src/OBbox.ts',  'OBbox'),  new Set(['from', 'fromPoints', 'fromMesh']))

/* ------------------------------------------------------------------ */
/*  Extract: Statics for math types                                     */
/* ------------------------------------------------------------------ */

function extractStatics(relPath: string, cls: string, includeNames: string[]): MethodInfo[]
{
    const klass = getClass(relPath, cls)
    return klass.getStaticMethods()
        .filter(m => includeNames.includes(m.getName()))
        .map(m => ({
            label: m.getName(),
            detail: formatMethodSignature(m),
            info: getJsDoc(m),
            type: 'function' as const,
        }))
}

const pointStatics  = extractStatics('devlibs/meshup/src/Point.ts',  'Point',  ['from'])
const vectorStatics = extractStatics('devlibs/meshup/src/Vector.ts', 'Vector', ['from'])
const bboxStatics   = extractStatics('devlibs/meshup/src/Bbox.ts',   'Bbox',   ['fromMesh'])
const obboxStatics  = extractStatics('devlibs/meshup/src/OBbox.ts',  'OBbox',  ['fromPoints', 'fromMesh'])

/* ------------------------------------------------------------------ */
/*  Assemble: shapeClasses                                              */
/* ------------------------------------------------------------------ */

// Common members shared by all Smart* shapes = meshup Shape base + mixin
const shapeCommonMembers = mergeMembers(meshupShapeMethods, mixinMethods)

const shapeClasses: ShapeClassInfo[] = [
    {
        label: 'SmartMesh',
        detail: 'mesh geometry shape',
        members: mergeMembers(shapeCommonMembers, meshupMeshMethods, smartMeshOwnMethods),
    },
    {
        label: 'SmartSolid',
        detail: 'brep Solid shape',
        members: mergeMembers(shapeCommonMembers, brepSolidMethods, smartBrepSolidOwnMethods),
    },
    {
        label: 'SmartCurve',
        detail: 'mesh-mode curve / wire',
        members: mergeMembers(shapeCommonMembers, meshupCurveMethods, smartMeshCurveOwnMethods),
    },
    {
        label: 'SmartEdge',
        detail: 'brep Edge',
        members: mergeMembers(shapeCommonMembers, brepEdgeMethods, smartBrepEdgeOwnMethods),
    },
    {
        label: 'SmartWire',
        detail: 'brep Wire',
        members: mergeMembers(shapeCommonMembers, brepWireMethods, smartBrepWireOwnMethods),
    },
    {
        label: 'SmartFace',
        detail: 'brep Face',
        members: mergeMembers(shapeCommonMembers, brepFaceMethods, smartBrepFaceOwnMethods),
    },
    {
        label: 'SmartShapeCollection',
        detail: 'collection of Smart* shapes',
        members: smartCollectionMethods,
    },
    {
        label: 'Sketch',
        detail: '2D sketch on a plane',
        members: extractPublicMethods(getClass('devlibs/meshup/src/Sketch.ts', 'Sketch'), new Set(['type'])),
    },
    {
        label: 'Point',
        detail: '3D point',
        statics: pointStatics,
        members: pointMethods,
    },
    {
        label: 'Vector',
        detail: '3D vector',
        statics: vectorStatics,
        members: vectorMethods,
    },
    {
        label: 'Bbox',
        detail: 'axis-aligned bounding box',
        statics: bboxStatics,
        members: bboxMethods,
    },
    {
        label: 'OBbox',
        detail: 'oriented bounding box',
        statics: obboxStatics,
        members: obboxMethods,
    },
]

/* ------------------------------------------------------------------ */
/*  Render helpers                                                       */
/* ------------------------------------------------------------------ */

function renderMethodInfo(m: MethodInfo, indent: string): string
{
    const info = m.info ? `\n${indent}  info: ${JSON.stringify(m.info)},` : ''
    return (
        `${indent}{ label: ${JSON.stringify(m.label)}, detail: ${JSON.stringify(m.detail)},${info}\n` +
        `${indent}  type: '${m.type}' },`
    )
}

function renderShapeClass(cls: ShapeClassInfo): string
{
    const indent = '  '
    const memberLines = cls.members.map(m => renderMethodInfo(m, indent + '  ')).join('\n')
    let staticsBlock = ''
    if (cls.statics && cls.statics.length > 0)
    {
        const staticLines = cls.statics.map(m => renderMethodInfo(m, indent + '  ')).join('\n')
        staticsBlock = `\n${indent}  statics: [\n${staticLines}\n${indent}  ],`
    }
    return (
        `  {\n` +
        `    label: ${JSON.stringify(cls.label)},\n` +
        `    detail: ${JSON.stringify(cls.detail)},${staticsBlock}\n` +
        `    members: [\n${memberLines}\n${indent}  ],\n` +
        `  },`
    )
}

/* ------------------------------------------------------------------ */
/*  Write output                                                         */
/* ------------------------------------------------------------------ */

const OUTPUT_PATH = resolve(
    ROOT,
    '../../src/components/editor/completions-data.generated.ts',
)

const header = `\
/**
 * completions-data.generated.ts
 *
 * AUTO-GENERATED by devlibs/archiyou-core-next/scripts/generate-completions.ts
 * Run: cd devlibs/archiyou-core-next && pnpm run generate:completions
 *
 * Do NOT edit manually — changes will be overwritten on next generation.
 */

/* eslint-disable */
/* prettier-ignore */

`

const output =
    header +
    `export interface MethodInfo {\n` +
    `  label: string;\n  detail: string;\n  info?: string;\n  type: 'function' | 'property';\n}\n\n` +
    `export interface ShapeClassInfo {\n` +
    `  label: string;\n  detail: string;\n  statics?: MethodInfo[];\n  members: MethodInfo[];\n}\n\n` +
    `export const modelerFunctions: MethodInfo[] = [\n` +
    modelerFunctions.map(m => renderMethodInfo(m, '  ')).join('\n') +
    `\n];\n\n` +
    `export const shapeClasses: ShapeClassInfo[] = [\n` +
    shapeClasses.map(renderShapeClass).join('\n') +
    `\n];\n`

mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
writeFileSync(OUTPUT_PATH, output, 'utf-8')
console.log(`✓ Wrote completions data to ${OUTPUT_PATH}`)
console.log(`  modelerFunctions: ${modelerFunctions.length} entries`)
console.log(`  shapeClasses: ${shapeClasses.length} classes`)
shapeClasses.forEach(c => console.log(`    ${c.label}: ${c.members.length} members`))
