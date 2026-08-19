import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { applyEdgeExtensions } from '../src/viewer/gltf-edge-extensions.js';

/**
 * A Curve (circle, rect, line) exports as a native GLTF LINE_STRIP whose material
 * carries BENTLEY_materials_line_style. WebGL ignores LineBasicMaterial.linewidth,
 * so anything wider than a hairline has to be swapped for the fat-line pipeline.
 */

/** Build a THREE.Line the way GLTFLoader does for a LINE_STRIP primitive. */
function nativeLine(points: number[][], lineStyle?: { width?: number; pattern?: number }): THREE.Line
{
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
    if (lineStyle)
    {
        material.userData.gltfExtensions = { BENTLEY_materials_line_style: lineStyle };
    }
    return new THREE.Line(geometry, material);
}

const SQUARE = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 0]];

async function applyTo(root: THREE.Object3D): Promise<void>
{
    // No meshes carry EXT_mesh_primitive_edge_visibility here, so the parser is never touched.
    await applyEdgeExtensions({ parser: { json: {} } } as never, root);
}

describe('native line styling', () =>
{
    it('upgrades a strokeWidth > 1 curve to a fat line of that pixel width', async () =>
    {
        const root = new THREE.Group();
        const line = nativeLine(SQUARE, { width: 10, pattern: 0xFFFF });
        line.name = 'circle';
        line.userData.shapeId = 'abc';
        line.position.set(1, 2, 3);
        root.add(new THREE.Group()); // sibling before, so index preservation is observable
        root.add(line);
        root.add(new THREE.Group());

        await applyTo(root);

        const fat = root.children[1];
        expect(fat).toBeInstanceOf(LineSegments2);
        expect(fat.parent).toBe(root);
        expect(fat.name).toBe('circle');
        expect(fat.userData.shapeId).toBe('abc');
        expect(fat.position.toArray()).toEqual([1, 2, 3]);

        const material = (fat as LineSegments2).material as LineMaterial;
        expect(material.linewidth).toBe(10);
        expect(material.color.getHex()).toBe(0xffff00);
        expect(material.dashed).toBe(false);

        // 5 strip vertices -> 4 segments -> 8 endpoints
        expect((fat as LineSegments2).geometry.attributes.instanceStart.count).toBe(4);
    });

    it('leaves a hairline curve as a native line', async () =>
    {
        const root = new THREE.Group();
        const line = nativeLine(SQUARE, { width: 1, pattern: 0xFFFF });
        root.add(line);

        await applyTo(root);

        expect(root.children[0]).toBe(line);
        expect(line.material).toBeInstanceOf(THREE.LineBasicMaterial);
    });

    it('leaves an unstyled curve (no extension) untouched', async () =>
    {
        const root = new THREE.Group();
        const line = nativeLine(SQUARE);
        root.add(line);

        await applyTo(root);

        expect(root.children[0]).toBe(line);
    });

    it('keeps dashing a hairline via LineDashedMaterial', async () =>
    {
        const root = new THREE.Group();
        const line = nativeLine(SQUARE, { width: 1, pattern: 0x00FF });
        root.add(line);

        await applyTo(root);

        expect(root.children[0]).toBe(line);
        expect(line.material).toBeInstanceOf(THREE.LineDashedMaterial);
    });

    it('dashes a wide curve on the fat-line material', async () =>
    {
        const root = new THREE.Group();
        root.add(nativeLine(SQUARE, { width: 4, pattern: 0x00FF }));

        await applyTo(root);

        const fat = root.children[0] as LineSegments2;
        expect(fat).toBeInstanceOf(LineSegments2);
        const material = fat.material as LineMaterial;
        expect(material.linewidth).toBe(4);
        expect(material.dashed).toBe(true);
        expect(material.dashSize).toBeGreaterThan(0);
        expect(material.gapSize).toBeGreaterThan(0);
    });
});
