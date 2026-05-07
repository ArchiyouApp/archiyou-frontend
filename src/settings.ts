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
