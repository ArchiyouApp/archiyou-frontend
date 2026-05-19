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
export const EDITOR_START_SCRIPT = `// Welcome to Archiyou!
b = box(10,10,10).color('red');
s = sphere(5).color('blue').move(5,5,5);
b.subtract(s);
s.hide();
c = circle(15).color('yellow');
r = rect(20,20).color('green');
`

// Dimension lines (3D viewer) — the in-scene line + arrowhead cones.
// Sizes are world units relative to the ~2-unit normalized model and are
// counter-scaled by the model's fit-scale so they stay visually constant.
// The value text is an HTML overlay label, styled via CSS in
// `viewer-labels-overlay` (not configured here).
export const DIMENSION_LINE_COLOR       = 0x222222; // line + arrowheads
export const DIMENSION_ARROW_LENGTH     = 0.05;     // arrowhead cone length
export const DIMENSION_ARROW_RADIUS     = 0.01;    // arrowhead cone base radius

// 3D viewer
export const VIEWER_BACKGROUND_COLOR = 0xf1f5f9; // scene + renderer clear color

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
