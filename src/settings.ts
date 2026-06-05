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
      box($SIZE*0.5).color('blue')
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

// Scene explorer
/** Tree depth shown in the scene-explorer "minimized" view: nodes shallower than
 *  this level stay expanded, deeper nodes are collapsed. 1 = show the direct
 *  children of the main Scene (root) node. */
export const SCENE_EXPLORER_MINIMIZED_TREE_LEVEL = 1;

// 3D viewer

/** Coordinate system of models as exported by the kernel/meshup pipeline.
 *  The viewer configures Three.js to match this system so no per-vertex
 *  remap is needed at runtime — the spatial transform is applied once at
 *  the camera/scene level.
 */
export const VIEWER_MODEL_COORDSYSTEM = { up: 'z', forward: 'y', right: 'x' } as const;

export const VIEWER_BACKGROUND_COLOR = 0xf1f5f9; // scene + renderer clear color
export const VIEWER_AUTO_FRAME_ON_FIRST_LOAD = true;

// Dimension lines (3D viewer) — the in-scene line + arrowhead cones.
// Sizes are world units in viewer/model space.
// The value text is an HTML overlay label, styled via CSS in
// `viewer-labels-overlay` (not configured here).
export const DIMENSION_LINE_COLOR       = 0x222222; // line + arrowheads
export const DIMENSION_ARROW_LENGTH     = 30;     // arrowhead cone length in model units
export const DIMENSION_ARROW_RADIUS     = 10;    // arrowhead cone base radius in model units


// 3D viewer helpers use a fixed scene size for now.
// This is the total grid / ground-plane size in world units.
export const VIEWER_SCENE_SIZE = 5000;
export const VIEWER_GRID_CELLS_PER_SCENE = 500;

// Key directional light for shadow casting.
// VIEWER_LIGHT_POSITION defines the direction and distance from the scene centre
// to the light. At runtime the vector is normalised into a fixed unit direction
// and both the light position and its target are offset from the model centre by
// that same direction — so the shadow angle is always exactly constant, regardless
// of where the model sits in world space or how its bounding box grows.
export const VIEWER_LIGHT_POSITION: [number, number, number] = [1000, -1000, 1000];

// Origin UCS / navigation gizmo
export const VIEWER_GIZMO_AXIS_LENGTH    = 300;    // positive-arm length, world units (base scale)
export const VIEWER_GIZMO_COLOR_X        = 0xFF0000; // red   (+X)
export const VIEWER_GIZMO_COLOR_Y        = 0x00FF00; // green (+Y)
export const VIEWER_GIZMO_COLOR_Z        = 0x0000FF; // blue  (+Z)
export const VIEWER_GIZMO_COLOR_ORIGIN   = 0xFFFFFF; // origin sphere at (0,0,0)
export const VIEWER_GIZMO_LABEL_SIZE     = 100;   // world units

// Interaction handles
export const VIEWER_HANDLE_DEFAULT_ICON   = 'move';
export const VIEWER_HANDLE_COLOR          = 0x2563EB; // blue-600
export const VIEWER_HANDLE_RANGE_LINE_COLOR  = 0x93C5FD; // blue-300
export const VIEWER_HANDLE_RANGE_LINE_WIDTH  = 2;    // px
export const VIEWER_HANDLE_ICON_SIZE      = 18;        // px — icon box side length


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
