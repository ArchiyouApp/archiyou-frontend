import * as THREE from 'three';
import { Text } from 'troika-three-text';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DIMENSION_LINE_COLOR,
  DIMENSION_ARROW_LENGTH,
  DIMENSION_ARROW_RADIUS,
  DIMENSION_TEXT_SIZE,
  DIMENSION_TEXT_COLOR,
  DIMENSION_TEXT_BG_COLOR,
  DIMENSION_TEXT_BG_PADDING,
} from '../../settings.js';

/**
 * Render archiyou dimension-line annotations carried in the GLB root `extras`.
 *
 * GLTFBuilder.addData() writes `{ annotations: DimensionLineData[] }` into the
 * glTF root extras. Three's GLTFLoader exposes the raw json at
 * gltf.parser.json — root extras live at gltf.parser.json.extras.
 *
 * The returned group is added as a child of `modelGroup` so it inherits the
 * same scale/position normalization the viewer applies to the model; geometry
 * is therefore built in raw model coordinates. Text/arrow sizes are
 * counter-scaled by `modelScale` so they read at a consistent on-screen size.
 *
 * Returns the troika Text label objects so the caller can billboard them
 * toward the camera each frame and dispose them on unload.
 */

interface DimensionLineData
{
  start: [number, number, number];
  end: [number, number, number];
  dir?: [number, number, number];
  value: number | string;
  units?: string;
  showUnits?: boolean;
  round?: boolean;
  roundDecimals?: number;
  _labelPosition?: [number, number, number];
}

export async function applyAnnotations(
  gltf: GLTF,
  modelGroup: THREE.Object3D,
  modelScale: number,
): Promise<Text[]>
{
  const extras = (gltf.parser?.json?.extras ?? {}) as { annotations?: DimensionLineData[] };
  const dims = extras.annotations;
  if (!Array.isArray(dims) || dims.length === 0) return [];

  // Counter-scale so text/arrows are ~constant in world space despite modelScale
  const s = modelScale > 0 ? modelScale : 1;
  const textSize = DIMENSION_TEXT_SIZE / s;
  const arrowLen = DIMENSION_ARROW_LENGTH / s;
  const arrowRad = DIMENSION_ARROW_RADIUS / s;

  const group = new THREE.Group();
  group.name = 'Dimensions';
  group.userData.isViewerHelper = true; // excluded from scene tree

  // toneMapped:false — annotations are UI overlays; AgX tone mapping would
  // otherwise desaturate every color toward gray.
  const lineMat = new THREE.LineBasicMaterial({ color: DIMENSION_LINE_COLOR, toneMapped: false });
  const coneMat = new THREE.MeshBasicMaterial({ color: DIMENSION_LINE_COLOR, toneMapped: false });
  const coneGeo = new THREE.ConeGeometry(arrowRad, arrowLen, 12);

  const labels: Text[] = [];

  for (const d of dims)
  {
    if (!d?.start || !d?.end) continue;

    const a = new THREE.Vector3(...d.start);
    const b = new THREE.Vector3(...d.end);
    const dir = (d.dir ? new THREE.Vector3(...d.dir) : b.clone().sub(a)).normalize();

    // main line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
    group.add(new THREE.Line(lineGeo, lineMat));

    // arrowheads at both ends (cone's +Y is its tip → orient to the line dir)
    const qEnd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const qStart = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());

    const coneEnd = new THREE.Mesh(coneGeo, coneMat);
    coneEnd.position.copy(b).addScaledVector(dir, -arrowLen / 2);
    coneEnd.quaternion.copy(qEnd);
    group.add(coneEnd);

    const coneStart = new THREE.Mesh(coneGeo, coneMat);
    coneStart.position.copy(a).addScaledVector(dir, arrowLen / 2);
    coneStart.quaternion.copy(qStart);
    group.add(coneStart);

    // label — draws over the dimension line (depthTest off + render order)
    const label = new Text();
    label.text = _formatValue(d);
    label.fontSize = textSize;
    label.color = DIMENSION_TEXT_COLOR;
    label.anchorX = 'center';
    label.anchorY = 'middle';
    label.material = new THREE.MeshBasicMaterial({ depthTest: false, toneMapped: false });
    label.renderOrder = 3;
    const lp = d._labelPosition
      ? new THREE.Vector3(...d._labelPosition)
      : a.clone().add(b).multiplyScalar(0.5);
    label.position.copy(lp);
    label.userData.isDimLabel = true;

    // opaque background quad that occludes the line behind the text
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: DIMENSION_TEXT_BG_COLOR,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    bg.renderOrder = 2; // behind the glyphs, in front of the line
    bg.visible = false; // until sized from text bounds
    label.add(bg);

    label.sync(() =>
    {
      const tri = (label as unknown as { textRenderInfo?: { blockBounds: [number, number, number, number] } }).textRenderInfo;
      if (!tri) return;
      const [x0, y0, x1, y1] = tri.blockBounds;
      const pad = textSize * DIMENSION_TEXT_BG_PADDING;
      const w = (x1 - x0) + pad * 2;
      const h = (y1 - y0) + pad * 2;
      bg.geometry.dispose();
      bg.geometry = new THREE.PlaneGeometry(w, h);
      bg.position.set((x0 + x1) / 2, (y0 + y1) / 2, -textSize * 0.01);
      bg.visible = true;
    });

    group.add(label);
    labels.push(label);
  }

  modelGroup.add(group);
  return labels;
}

function _formatValue(d: DimensionLineData): string
{
  let v: string;
  if (typeof d.value === 'number')
  {
    v = (d.round ? _round(d.value, d.roundDecimals ?? 0) : d.value).toString();
  }
  else
  {
    v = String(d.value);
  }
  if (d.showUnits && d.units) v += d.units;
  return v;
}

function _round(n: number, decimals: number): number
{
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
