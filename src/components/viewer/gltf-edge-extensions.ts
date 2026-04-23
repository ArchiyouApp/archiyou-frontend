import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Post-process a Three.js GLTF scene to render CAD edges stored in:
 *   - EXT_mesh_primitive_edge_visibility  (2-bit-per-edge hard/soft bitfield)
 *   - BENTLEY_materials_line_style        (width in px, 16-bit dash pattern)
 *
 * Three.js GLTFLoader forwards unknown extensions into userData.gltfExtensions,
 * so no custom loader plugin is needed.
 */
export async function applyEdgeExtensions(gltf: GLTF, root: THREE.Object3D): Promise<void>
{
    const tasks: Promise<void>[] = [];
    let meshCount = 0;
    let extCount = 0;

    root.traverse((node) =>
    {
        if (!(node as THREE.Mesh).isMesh) return;
        meshCount++;
        const mesh = node as THREE.Mesh;
        const ext = mesh.userData?.gltfExtensions?.['EXT_mesh_primitive_edge_visibility'];
        console.log(`applyEdgeExtensions: mesh "${mesh.name}" userData.gltfExtensions =`, mesh.userData?.gltfExtensions);
        if (!ext) return;
        extCount++;
        tasks.push(_attachEdgeLines(mesh, ext, gltf.parser));
    });

    console.log(`applyEdgeExtensions: ${meshCount} meshes scanned, ${extCount} with EXT_mesh_primitive_edge_visibility`);
    await Promise.all(tasks);
}

async function _attachEdgeLines(
    mesh: THREE.Mesh,
    ext: { visibility: number; material?: number },
    parser: GLTF['parser'],
): Promise<void>
{
    const indexAttr = mesh.geometry.index;
    if (!indexAttr) return;

    const indices   = indexAttr.array as Uint32Array;
    const positions = mesh.geometry.attributes.position.array as Float32Array;

    // Fetch the 2-bit-per-edge visibility bitfield accessor
    console.log(`_attachEdgeLines: mesh "${mesh.name}" ext=`, ext,
        `indices=${indices.length} tris=${indices.length/3} positions=${positions.length/3}`);
    // getDependency returns a THREE.BufferAttribute — extract the raw typed array
    const visAttr = await parser.getDependency('accessor', ext.visibility) as THREE.BufferAttribute;
    const visData = visAttr.array as Uint8Array;
    console.log(`_attachEdgeLines: visAttr=`, visAttr, `visData bytes=${visData.length} sample=[${Array.from(visData.slice(0,8)).map(b => b.toString(2).padStart(8,'0')).join(' ')}]`);

    const lineVerts: number[] = [];
    const triCount = indices.length / 3;

    for (let tri = 0; tri < triCount; tri++)
    {
        for (let slot = 0; slot < 3; slot++)
        {
            const edgeIdx = tri * 3 + slot;
            const byteIdx = Math.floor(edgeIdx * 2 / 8);
            const bitOff  = (edgeIdx * 2) % 8;
            const val = (visData[byteIdx] >> bitOff) & 0x3;
            if (val !== 2) continue; // only hard/crease edges

            const a = indices[tri * 3 + slot];
            const b = indices[tri * 3 + (slot + 1) % 3];
            lineVerts.push(
                positions[a * 3],     positions[a * 3 + 1], positions[a * 3 + 2],
                positions[b * 3],     positions[b * 3 + 1], positions[b * 3 + 2],
            );
        }
    }

    // Deduplicate: each hard edge is referenced from both adjacent triangles,
    // keep only the first occurrence per unique vertex pair.
    const seen = new Set<string>();
    const dedupedVerts: number[] = [];
    for (let i = 0; i < lineVerts.length; i += 6)
    {
        const ax = lineVerts[i],   ay = lineVerts[i+1], az = lineVerts[i+2];
        const bx = lineVerts[i+3], by = lineVerts[i+4], bz = lineVerts[i+5];
        const key = ax < bx || (ax === bx && ay < by) || (ax === bx && ay === by && az < bz)
            ? `${ax},${ay},${az}|${bx},${by},${bz}`
            : `${bx},${by},${bz}|${ax},${ay},${az}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedupedVerts.push(ax, ay, az, bx, by, bz);
    }

    console.log(`_attachEdgeLines: mesh "${mesh.name}" → ${lineVerts.length / 6} raw / ${dedupedVerts.length / 6} deduped hard edges`);
    if (!dedupedVerts.length) return;

    // Push mesh faces slightly back so lines win the depth test (no z-fighting)
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; });

    const mat = _resolveLineMaterial(ext.material, parser);
    console.log(`_attachEdgeLines: material =`, mat.type, mat instanceof THREE.LineBasicMaterial ? '(LineBasicMaterial)' : '(LineMaterial)');

    if (mat instanceof THREE.LineBasicMaterial)
    {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(dedupedVerts, 3));
        mesh.parent!.add(new THREE.LineSegments(geo, mat));
        console.log(`_attachEdgeLines: added LineSegments to scene`);
    }
    else
    {
        const geo2 = new LineSegmentsGeometry().setPositions(dedupedVerts);
        const lines2 = new LineSegments2(geo2, mat as LineMaterial);
        mesh.parent!.add(lines2);
        console.log(`_attachEdgeLines: added LineSegments2 to scene`);
    }
}

function _resolveLineMaterial(
    materialIndex: number | undefined,
    parser: GLTF['parser'],
): THREE.LineBasicMaterial | LineMaterial
{
    const gltfMat = (parser.json as any).materials?.[materialIndex ?? -1];
    const bentley = gltfMat?.extensions?.['BENTLEY_materials_line_style'];
    console.log(`_resolveLineMaterial: materialIndex=${materialIndex} bentley=`, bentley, 'gltfMat=', gltfMat);
    const baseColor: [number, number, number, number] =
        gltfMat?.pbrMetallicRoughness?.baseColorFactor ?? [0, 0, 0, 1];

    const color   = new THREE.Color(baseColor[0], baseColor[1], baseColor[2]);
    const width: number   = bentley?.width   ?? 1;
    const pattern: number = bentley?.pattern ?? 0xFFFF;

    if (width <= 1 && pattern === 0xFFFF)
    {
        return new THREE.LineBasicMaterial({ color });
    }

    const mat = new LineMaterial({ color: color.getHex(), linewidth: width });
    if (pattern !== 0xFFFF) _applyDashPattern(mat, pattern);
    return mat;
}

function _applyDashPattern(mat: LineMaterial, pattern: number): void
{
    mat.onBeforeCompile = (shader) =>
    {
        shader.uniforms['uDashPattern'] = { value: pattern };
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
             uniform uint uDashPattern;
             {
               int bit = int(mod(vLineDistance, 16.0));
               if (((uDashPattern >> uint(bit)) & 1u) == 0u) discard;
             }`,
        );
    };
    mat.needsUpdate = true;
}
