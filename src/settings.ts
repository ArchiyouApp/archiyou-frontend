/**
 *  General settings and configuration for the Archiyou web application.
 */

// Overlay menus — percentages of viewport preferred; px accepted too
export const OVERLAY_MENU_WIDTH  = '30vw';
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

// Dimension lines (3D viewer).
// Sizes are world units relative to the ~2-unit normalized model and are
// counter-scaled by the model's fit-scale so they stay visually constant.
export const DIMENSION_LINE_COLOR       = 0x222222; // line + arrowheads
export const DIMENSION_ARROW_LENGTH     = 0.06;     // arrowhead cone length
export const DIMENSION_ARROW_RADIUS     = 0.021;    // arrowhead cone base radius
export const DIMENSION_TEXT_SIZE        = 0.055;    // value label font size
export const DIMENSION_TEXT_COLOR       = 0x222222; // value label text color
export const DIMENSION_TEXT_BG_COLOR    = 0xf1f5f9; // label background (covers the line)
export const DIMENSION_TEXT_BG_PADDING  = 0.28;     // padding as a fraction of text size

// 3D viewer
export const VIEWER_BACKGROUND_COLOR = 0xf1f5f9; // scene + renderer clear color
