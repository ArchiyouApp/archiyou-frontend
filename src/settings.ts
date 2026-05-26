/**
 *  General settings and configuration for the Archiyou web application.
 */

// Overlay menus — percentages of viewport preferred; px accepted too
export const OVERLAY_MENU_WIDTH  = '40vw';
export const OVERLAY_MENU_HEIGHT = '50vh';

// Parameter tabs
export const PARAM_TAB_NAME_MAX_LENGTH       = 15;
export const PARAM_DESCRIPTION_MAX_LENGTH    = 128;

// Editor
import { ScriptParamType } from '../devlibs/archiyou-core-next/src/execution/types';
import type { ScriptData } from '../devlibs/archiyou-core-next/src/execution/types';


export const EDITOR_START_SCRIPT: ScriptData = 
{
  name: 'untitled',
  code: `// Welcome to Archiyou!
myMainBox = box($SIZE).color('red');
myMainBox.subtract(
      box(50).color('blue')
        .moveTo(myMainBox.bbox().corner('leftfronttop'))
        .hide()
    )

doc.create('myDoc')
.pipeline(() => {
  iso = myMainBox.iso();
  return { iso }
})
.page('myPage')
.view('isometry')
.shapes('iso')
.text('MyText')
`,
  params: {
    SIZE: {
      type: ScriptParamType.number,
      label: 'Size',
      default: 50,
      schema: { type: 'number', minimum: 0, maximum: 100, multipleOf: 1, default: 50 },
    },
  },
};

// Dimension lines (3D viewer) — the in-scene line + arrowhead cones.
// Sizes are world units in viewer/model space.
// The value text is an HTML overlay label, styled via CSS in
// `viewer-labels-overlay` (not configured here).
export const DIMENSION_LINE_COLOR       = 0x222222; // line + arrowheads
export const DIMENSION_ARROW_LENGTH     = 0.3;     // arrowhead cone length
export const DIMENSION_ARROW_RADIUS     = 0.1;    // arrowhead cone base radius

// 3D viewer
export const VIEWER_BACKGROUND_COLOR = 0xf1f5f9; // scene + renderer clear color
export const VIEWER_AUTO_FRAME_ON_FIRST_LOAD = true;

// 3D viewer grid (auto-sized to the loaded model on first load).
// Total grid extent along each axis = sceneRadius × VIEWER_SCENE_TO_GRID_SIZE.
// FadingGrid fades to the background near the edges, so the visually useful
// area is smaller than the full extent.
export const VIEWER_SCENE_TO_GRID_SIZE   = 30;
// Target number of grid cells across the scene diameter. The actual cell
// step is snapped to the nearest "nice" value (1, 2, 5, 10, …) so labels and
// snap distances stay readable.
export const VIEWER_GRID_CELLS_PER_SCENE = 10;
// Scene radius assumed for the very first grid build, before any model has
// loaded. Once a model arrives the grid rebuilds from its bounding box.
export const VIEWER_GRID_FALLBACK_SCENE_RADIUS = 5;

// Relative change in scene radius (XZ half-extent) that triggers a rebuild of
// the grid, gizmo and dimension arrows on subsequent model loads. 0.5 = rebuild
// when the new model is >50% larger/smaller than the last one we sized for.
// Lower = jumpier, higher = stickier.
export const VIEWER_ESSENTIALS_RESCALE_THRESHOLD = 0.5;

// Scene radius at which DIMENSION_ARROW_LENGTH / DIMENSION_ARROW_RADIUS look
// "right". Arrow sizes scale by (currentSceneRadius / reference).
export const VIEWER_DIMENSION_REFERENCE_SCENE_RADIUS = VIEWER_GRID_FALLBACK_SCENE_RADIUS;

// Origin UCS / navigation gizmo
export const VIEWER_GIZMO_AXIS_LENGTH    = 0.6;    // positive-arm length, world units (base scale)
export const VIEWER_GIZMO_SCENE_FRACTION = 0.40;   // gizmo arm length as fraction of scene radius
export const VIEWER_GIZMO_COLOR_X        = 0xFF0000; // red   (+X)
export const VIEWER_GIZMO_COLOR_Y        = 0x00FF00; // green (+Y)
export const VIEWER_GIZMO_COLOR_Z        = 0x0000FF; // blue  (+Z)
export const VIEWER_GIZMO_COLOR_ORIGIN   = 0xFFFFFF; // origin sphere at (0,0,0)
export const VIEWER_GIZMO_LABEL_SIZE     = 0.14;   // sprite scale, world units

// ── File Manager ──────────────────────────────────────────────────────────────

/**
 * Pipe-separated list of dile-editor toolbar items to disable.
 * Available: bold, italic, code_mark, link, removeLink, image,
 *            unordered_list, ordered_list, lift, paragraph,
 *            h1, h2, h3, h4, code, undo, redo
 */
export const FILE_MANAGER_DISABLED_TOOLBAR_ITEMS = 'image|h4|bold|italic|code|code_mark';

/**
 * Predefined tags that users can select in the file manager.
 * Only these tags are allowed to ensure consistent categorisation.
 */
export const SCRIPT_PREDEFINED_TAGS: string[] = [
  'architecture',
  'parametric',
  'geometry',
  'building',
  'furniture',
  'visualization',
  'tool',
  'example',
  'template',
  'product',
  'structure',
  'interior',
  'landscape',
  'mechanical',
];
