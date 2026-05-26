import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DIMENSION_LINE_COLOR,
  DIMENSION_ARROW_LENGTH,
  DIMENSION_ARROW_RADIUS,
} from '../../settings.js';

/**
 * Render archiyou annotations carried in the GLB root `extras`.
 *
 * GLTFBuilder.addData() writes `{ annotations: AnnotationData[] }` into the
 * glTF root extras (Three's GLTFLoader exposes raw json at gltf.parser.json →
 * root extras at gltf.parser.json.extras).
 *
 *  - dimension lines  → 3D line + arrowhead cones (added under modelGroup)
 *                       PLUS
 *                       an HTML overlay label for the value text.
 *  - labels           → an HTML overlay element, optionally with a CSS leader
 *                       line + arrow (screen-space length/angle).
 *
 * No troika / in-scene text: all text is HTML, styled via CSS in
 * `viewer-labels-overlay`.
 */

interface DimensionLineData
{
  type?: 'dimensionLine';
  start: [number, number, number];
  end: [number, number, number];
  dir?: [number, number, number];
  value: number | string;
  units?: string;
  showUnits?: boolean;
  round?: boolean;
  roundDecimals?: number;
  _labelPosition?: [number, number, number];
  /** Name of a script parameter bound via DimensionLine.bindParam(name).
   *  Combined with `interactive`, the overlay turns this label into an
   *  inline editor that writes back to the param-menu. */
  param?: string;
  interactive?: boolean;
}

interface LabelData
{
  type: 'label';
  position: [number, number, number];
  value: string;
  class?: string;
  line?: boolean;
  offset?: number;
  angle?: number;
  circle?: boolean;
}

type AnnotationItem = DimensionLineData | LabelData;

/** A label rendered by the HTML overlay (anchor in modelGroup-local coords) */
export interface HtmlLabelDef
{
  id: string;
  text: string;
  variant: 'label' | 'dimension';
  anchorLocal: THREE.Vector3;
  class?: string;
  /** Optional CSS leader (screen space) */
  line?: boolean;
  offset?: number;
  angle?: number;
  circle?: boolean;
  /** When set, the overlay renders this label as an inline editor that
   *  writes back to the named script parameter on commit. */
  param?: string;
  interactive?: boolean;
  /** Raw numeric value (for dimensions) — used as the starting input value
   *  when the user clicks the label to edit it. */
  rawValue?: number | string;
}

export interface AnnotationsResult
{
  htmlLabels: HtmlLabelDef[]; // projected to screen by the caller each frame
}

export async function applyAnnotations(
  gltf: GLTF,
  modelGroup: THREE.Object3D,
  /** Annotations from the execution result (preferred). When absent, fall
   *  back to `gltf.parser.json.extras.state.annotations` (new) and then to
   *  `extras.annotations` (legacy) so a standalone .glb can still render. */
  override?: AnnotationItem[],
  /** Multiplier applied to arrowhead length/radius so dimension arrows scale
   *  with the viewer's scene radius. 1 = use the constants as-is. */
  arrowScale: number = 1,
): Promise<AnnotationsResult>
{
  const extras = (gltf.parser?.json?.extras ?? {}) as
    { annotations?: AnnotationItem[]; state?: { annotations?: AnnotationItem[] } };
  const anns = override ?? extras.state?.annotations ?? extras.annotations;
  if (!Array.isArray(anns) || anns.length === 0) return { htmlLabels: [] };

  const htmlLabels: HtmlLabelDef[] = [];
  const dims: DimensionLineData[] = [];

  anns.forEach((an, i) =>
  {
    if (an && (an as LabelData).type === 'label')
    {
      const l = an as LabelData;
      if (!Array.isArray(l.position)) return;
      htmlLabels.push({
        id: `label-${i}`,
        text: String(l.value ?? ''),
        variant: 'label',
        anchorLocal: new THREE.Vector3(...l.position),
        class: l.class,
        line: l.line,
        offset: l.offset,
        angle: l.angle,
        circle: l.circle,
      });
    }
    else
    {
      dims.push(an as DimensionLineData);
    }
  });

  if (dims.length === 0) return { htmlLabels };

  // 3D dimension-line geometry (line + arrowhead cones). Sizes are world units,
  // scaled by `arrowScale` so arrows stay legible across very different model sizes.
  const arrowLen = DIMENSION_ARROW_LENGTH * arrowScale;
  const arrowRad = DIMENSION_ARROW_RADIUS * arrowScale;

  const group = new THREE.Group();
  group.name = 'Dimensions';
  group.userData.isViewerHelper = true; // excluded from scene tree

  // toneMapped:false — annotation geometry is a UI overlay; AgX tone mapping
  // would otherwise desaturate the color toward gray.
  const lineMat = new THREE.LineBasicMaterial({ color: DIMENSION_LINE_COLOR, toneMapped: false });
  const coneMat = new THREE.MeshBasicMaterial({ color: DIMENSION_LINE_COLOR, toneMapped: false });
  const coneGeo = new THREE.ConeGeometry(arrowRad, arrowLen, 12);

  dims.forEach((d, i) =>
  {
    if (!d?.start || !d?.end) return;

    const a = new THREE.Vector3(...d.start);
    const b = new THREE.Vector3(...d.end);
    const dir = (d.dir ? new THREE.Vector3(...d.dir) : b.clone().sub(a)).normalize();

    // main line
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat));

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

    // value text → HTML overlay label at the midpoint / _labelPosition
    const lp = d._labelPosition
      ? new THREE.Vector3(...d._labelPosition)
      : a.clone().add(b).multiplyScalar(0.5);
    htmlLabels.push({
      id: `dim-${i}`,
      text: _formatValue(d),
      variant: 'dimension',
      anchorLocal: lp,
      param: d.param,
      interactive: !!d.interactive && !!d.param,
      rawValue: d.value,
    });
  });

  modelGroup.add(group);
  return { htmlLabels };
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
