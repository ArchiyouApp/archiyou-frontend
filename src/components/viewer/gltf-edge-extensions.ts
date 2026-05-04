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
    // Only render edges when an explicit stroke material was set by the user.
    // Unstyled meshes (no strokeWidth / strokeDash) carry no material index
    // and should not show any edge overlay.
    if (ext.material === undefined) return;

    const indexAttr = mesh.geometry.index;
    if (!indexAttr) return;

    const indices  = indexAttr.array;
    // IMPORTANT: use getX/getY/getZ — not .array — because gltf-transform may write
    // position + normal in a single interleaved buffer view (stride = 6).
    // Three.js creates an InterleavedBufferAttribute in that case, and .array gives the
    // full interleaved buffer, so positions[v*3] lands on the normal for odd v indices.
    const posAttr  = mesh.geometry.attributes.position;

    // Fetch the 2-bit-per-edge visibility bitfield accessor
    const accDef = (parser.json as any).accessors?.[ext.visibility];
    console.log(`_attachEdgeLines: mesh "${mesh.name}" ext=`, ext,
        `indices=${indices.length} tris=${indices.length/3} vertices=${posAttr.count}`,
        `visibilityAcc=`, accDef);
    // getDependency returns a THREE.BufferAttribute — extract the raw typed array.
    // The accessor is SCALAR UNSIGNED_BYTE (componentType 5121), so .array should be Uint8Array.
    // If Three.js returns a different type (e.g. normalized Float32), re-interpret raw bytes.
    const visAttr = await parser.getDependency('accessor', ext.visibility) as THREE.BufferAttribute;
    const rawArr = visAttr.array;
    const visData: Uint8Array = rawArr instanceof Uint8Array
        ? rawArr
        : new Uint8Array(rawArr.buffer, rawArr.byteOffset, (accDef?.count ?? rawArr.length));
    console.log(`_attachEdgeLines: visData type=${rawArr.constructor.name} bytes=${visData.length} ALL=[${Array.from(visData).map(b => b.toString(2).padStart(8,'0')).join(' ')}]`);

    const lineVerts: number[] = [];
    const triCount = indices.length / 3;
    let hardSlots = 0, smoothSlots = 0;

    for (let tri = 0; tri < triCount; tri++)
    {
        for (let slot = 0; slot < 3; slot++)
        {
            const edgeIdx = tri * 3 + slot;
            const byteIdx = Math.floor(edgeIdx * 2 / 8);
            const bitOff  = (edgeIdx * 2) % 8;
            const val = (visData[byteIdx] >> bitOff) & 0x3;
            if (val !== 2) { smoothSlots++; continue; } // only hard/crease edges
            hardSlots++;

            const a = indices[tri * 3 + slot];
            const b = indices[tri * 3 + (slot + 1) % 3];
            lineVerts.push(
                posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a),
                posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b),
            );
        }
    }
    console.log(`_attachEdgeLines: slots hard=${hardSlots} smooth=${smoothSlots} total=${hardSlots+smoothSlots} (expected for cube: 24 hard, 12 smooth)`);

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
    // Log all deduped edges so we can verify they are box corner-edges, not face diagonals
    for (let i = 0; i < dedupedVerts.length; i += 6)
    {
        const r = (v: number) => v.toFixed(3);
        console.log(`  edge ${i/6}: (${r(dedupedVerts[i])},${r(dedupedVerts[i+1])},${r(dedupedVerts[i+2])}) → (${r(dedupedVerts[i+3])},${r(dedupedVerts[i+4])},${r(dedupedVerts[i+5])})`);
    }
    if (!dedupedVerts.length) return;

    // Push mesh faces slightly back so lines win the depth test (no z-fighting)
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; });

    const mat = _resolveLineMaterial(ext.material, parser);
    console.log(`_attachEdgeLines: material =`, mat.type, mat instanceof THREE.LineBasicMaterial ? '(LineBasicMaterial)' : '(LineMaterial)');

    // Mark the source mesh so the scene explorer skips it (container node is shown instead)
    mesh.userData.isEdgeSurface = true;

    if (mat instanceof THREE.LineBasicMaterial)
    {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(dedupedVerts, 3));
        const lines = new THREE.LineSegments(geo, mat);
        lines.userData.cannotReceiveAO = true;
        lines.userData.isEdgeOverlay = true;
        mesh.parent!.add(lines);
        console.log(`_attachEdgeLines: added LineSegments to scene`);
    }
    else
    {
        const geo2 = new LineSegmentsGeometry().setPositions(dedupedVerts);
        const lines2 = new LineSegments2(geo2, mat as LineMaterial);
        lines2.userData.cannotReceiveAO = true;
        lines2.userData.isEdgeOverlay = true;
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
