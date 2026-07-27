import type { ExecutionRequestOutputFormatGLTFOptions } from "./execution/types";

//// MODELER ////

// TODO: can we define these on runtime in Modeler?
export const MODELER_METHODS_INTO_GLOBAL = [
    'units','mode', // meta
    'point', 'vector', 'vertex',
    'line', 'arc', 'spline', 
    'polyline', 'spiral', 'helix',
    'plane', 'planeBetween', 'rect', 'rectBetween', 'basePlane', 'circle',
    'box', 'boxBetween', 'sphere', 'cone', 'cylinder',
    // scene management 
    'layer', 'collection',
    'layerShapes',
    // sketch
    'sketch', 'all', 'isTemp', 'select', 'atVertices', 'moveTo', 'lineTo', 'splineTo', 'arcTo', 
    'rectTo', 'rect', 'circleTo', 'circle', 'mirror', 'offset', 'offsetted', 'fillet', 'chamfer', 'thicken', 'thickened','combine',
    'close', 'importSketch',
];


//// EXECUTION AND OUTPUT SETTINGS ////

export const SCRIPT_OUTPUT_CATEGORIES = ['model','metrics','tables','docs'] // see types: ScriptOutputCategory
export const SCRIPT_OUTPUT_MODEL_FORMATS = ['gltf','glb','step','stl','svg', 'dae', 'obj', 'dxf', 'amf'] // see types: ScriptOutputModelFormat
export const SCRIPT_OUTPUT_METRIC_FORMATS = ['json','xlsx'] // see types: ScriptOutputMetricFormat
export const METRIC_DEFAULT_ICON = 'gauge' // default icon for metrics without an explicit icon set (Lucide icon name)
export const SCRIPT_OUTPUT_TABLE_FORMATS = ['json','xlsx', 'gsheets'] // see types: ScriptOutputTableFormat
export const SCRIPT_OUTPUT_DOC_FORMATS = ['json','pdf','svg','svg-pages'] // see types: ScriptOutputDocFormat

export const SCRIPT_OUTPUT_GLTF_OPTIONS_DEFAULT = 
{
    edges: true, // show edges by default in glTF output
    animations: false, // export gltf animations. See Layouter.ts
    // archiyou extra data
    annotations: true,
    metrics: true,
    tables: true, // not too big and often handy
    docs: false, // these can be big 
    scenegraph: false,
} as ExecutionRequestOutputFormatGLTFOptions;

//// DOCS ////

export const DOC_DEFAULT_FONT_FAMILY = 'Outfit'
export const DOC_DEFAULT_SVG_FONT_FAMILY = `'${DOC_DEFAULT_FONT_FAMILY}', sans-serif`
export const DOC_TEXT_HEIGHT_TO_FONT_SIZE_FACTOR = 0.9 // mm/cm/inch text heights are mapped to a slightly smaller typographic font-size so visible glyph height better matches the requested physical size
export const DOC_DIMENSION_LINES_TEXT_HEIGHT = 2.5; // in mm
export const DOC_CONTAINER_TITLE_TEXT_HEIGHT = 6; // in mm
export const DOC_CONTAINER_CAPTION_TEXT_HEIGHT = 3; // in mm
export const DOC_CONTAINER_CAPTION_TEXT_PADDING_FACTOR = 2; // applied to text height

//// GLTF ANIMATIONS ////

export const GLTF_ANIMATION_DURATION = 1.0; // in s