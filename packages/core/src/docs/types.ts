
import type { ModelUnits } from '../modeler/types';
import type { PublishLicense } from '../execution/types';

import { Container } from './Container';
import { View } from './View';

import type { DataRows, ComputedFooterRow } from '../calc/types';

export type DocUnits = 'mm'|'cm'|'inch'|'pnt' 
export type DocUnitsWithPerc = DocUnits | '%' // Percent of page (side is dependent of measure)
export type PercentageString = string // 100%, 5% etc.
export type ValueWithUnitsString = number|string // string with number and DocUnitsWithPerc
export type WidthHeightInput = number|PercentageString|ValueWithUnitsString;
export type ContainerTableInput = string | DataRows

export interface DocSettings {
    proxy: string // url of proxy
}

export interface DocData {
    name:string
    units:DocUnits
    pages:Array<PageData>
    modelUnits:ModelUnits
}


export interface DocPipeline
{
    fn:() => any
    done: boolean
}

/** Context passed down from Page.toSVG() into each Container.toSVG() call. */
export interface PageSVGContext
{
    pageWidthMm:  number
    pageHeightMm: number
    hPaddingMm:   number  // absolute mm, resolved from relative padding
    vPaddingMm:   number
    nextClipId:   () => string
    cache?:       Record<string, any>
}

/** A single page rendered as a standalone SVG string, used as the intermediate
 *  step for PDF export (one PDF page per DocSVGPage). */
export interface DocSVGPage
{
    name:string
    widthMm:number
    heightMm:number
    orientation:PageOrientation
    svg:string // standalone <svg> for just this page
}

//// DOC:PAGE ////

export type PageSize = 'A0'|'A1'|'A2'|'A3'|'A4'|'A5'|'A6'|'A7';
export type PageOrientation = 'landscape'|'portrait';
export type PageSide = 'width'|'height'
export type AnyPageContainer = Container|View

export interface PageData {
    _entity:'page'
    name:string
    size:PageSize
    width:number // in units given in docUnits
    height:number // in units given in docUnits
    orientation:PageOrientation
    padding:Array<number|number> // horizontal (left and right), vertical (top and bottom) relative to Page width/height
    containers:Array<ContainerData>
    variables?:{[key:string]:any}
    docUnits:DocUnits, // gets taken from parent doc
}   

//// DOC:PAGE:CONTAINER ////

export type ContainerType = 'view'|'image'|'text'|'textarea'|'table'|'graphic'
export type ContainerHAlignment = 'left'|'center'|'right'
export type ContainerVAlignment = 'top' | 'center' | 'bottom'
export type ContainerAlignment = [ContainerHAlignment,ContainerVAlignment] // like [left,top]
export type ContainerSide = 'width'|'height'
export type ZoomRelativeTo = 'container'|'world'
export type ScaleInput = 'auto'|number;
export type ContainerSizeRelativeTo = 'page' | 'page-content-area'; // page-content area is page without the padding on both sides

export type ContainerPositionCoordRel = number // [0-1]
export type ContainerPositionCoordAbs = number|string // >=1 or 10mm

export type ContainerPositionRel= Array<number|number> // This is relative coords [ [0,1],[0,1]] from left bottom
export type ContainerPositionAbs = Array<string|string> // '10mm', '20mm'
export type ContainerPositionLike = ContainerPositionRel|ContainerAlignment|ContainerPositionAbs

export type ContainerData = { // Combine all Container types for convenience
    _entity:string
    name:string
    parent?:string // Name of parent - NOT USED YET
    type:ContainerType
    width:number // relative to (see: widthRelativeTo)
    widthRelativeTo:ContainerSizeRelativeTo
    widthAbs?:number // in doc units (added on place)
    height:number // relative to (see: widthRelativeTo)
    heightRelativeTo:ContainerSizeRelativeTo
    heightAbs?:number // in doc units (added on place)
    position:ContainerPositionRel// relative to page-content-area
    pivot:ContainerPositionRel
    border?:boolean // border around container
    borderStyle?:DocPathStyle // style to draw border
    frame?:any // advanced shapes as border
    index?:number

    contentAlign:ContainerAlignment // alignment of content inside container
    content:any; // TODO: raw content
    zoomLevel?:ScaleInput, // number or 'auto' [default]
    zoomRelativeTo?:ZoomRelativeTo,
    docUnits:DocUnits, 
    modelUnits:ModelUnits,
    
    caption?:string
    title?:string

    _domElem?:HTMLDivElement, // added on placement
}

export interface Frame {
    color:string // TODO
    thickness:number
    shape:'rect'|'circle'
}

export interface ContainerContent 
{
    source?:string, // source url (used for quick access if possible)
    format?:'jpg'|'svg'|'png';
    data:any; // main data - can be base64
    footer?:Array<ComputedFooterRow>; // optional computed footer rows (tables)
    settings:{[key:string]:any}
}


//// DOC:PAGE:CONTAINER:IMAGE ////

export type ImageOptionsFit = 'fill'|'contain'|'cover' // taken from CSS, see https://www.w3schools.com/css/css3_object-fit.asp
// fill is unproportianlly, contain is fit inside with margin, cover is fill proportianally

export function isImageOptionsFit(o:any): o is ImageOptionsFit
{
    return ['fill','contain','cover'].includes(o);
}

export interface ImageOptions 
{
    fit?: ImageOptionsFit
    align?: ContainerAlignment // for example ['left', 'top]  
    opacity?: number // [0-100]
    brightness?:number // [0-100]
    contrast?:number // [0-100]
    saturation?:number
    grayscale?:number // [0-100]
}

//// DOC:PAGE:CONTAINER:TABLE ////

// NOTE: uses DataRows for input from Calc

export interface TableContainerOptions
{
    fontsize?: number
    fontcolor?: string
    footer?: Array<ComputedFooterRow> // computed footer rows (from calc.Table.computeFooterRows())
}

//// DOCS:PAGE:CONTAINER:TEXT ////

export type TextAreaAlign = 'left'|'right'|'center'|'fill';
export type TextBaseline = 'alphabetic'|'ideographic'|'bottom'|'top'|'middle'|'hanging'

// see: https://raw.githack.com/MrRio/jsPDF/master/docs/jsPDF.html#text
export interface TextOptions
{
    size?:number|string // saved in 'points' (like in Word) - units are also allowed but converted in options
    color?:string // always converted to hex
    width?:number // TODO: needed?
    height?:number // TODO: needed?
    bold?:boolean
    underline?:boolean // TODO implement in renderer
    strike?:boolean // TODO implement in renderer   
    oblique?:boolean // TODO implement in renderer
    align?:TextAreaAlign // Not used. Use: Cotnainer.contentAlign
    baseline?:TextBaseline
    angle?:number // in degrees
    // NOTE: some of these parameters are plugged directly into jsPDF.text()
}

//// DOCS:PAGE:CONTAINER:GRAPHIC

export type DocGraphicType = 'rect'|'circle'|'ellipse'|'line'|'hline'|'vline'|'triangle' // Later: poly?

// Default simple input
export interface DocGraphicInputBase
{
    type?:DocGraphicType
    units?:DocUnitsWithPerc // default in mm
    style?:DocPathStyle
    data?:any // TODO later: things to put inside graphic, like label number
}

export interface DocGraphicInputRect extends DocGraphicInputBase
{
    // if size => size=width=height
    width:number
    height:number
    round?:number
}

export interface DocGraphicInputCircle extends DocGraphicInputBase
{
    // if size => size = radius
    radius:number
}

export interface DocGraphicInputLine extends DocGraphicInputBase
{
    // if size => size = length
    start:[number,number]
    end:[number,number]
}

export interface DocGraphicInputOrthoLine extends DocGraphicInputBase
{
    length:number|string // number in default units or with units
    thickness:number|string
    color:string
}


//// DOCS:PAGE:CONTAINER:VIEW ////

export interface toSVGOptions
{
    all?:boolean // also invisible
    only2D?:boolean // only export 2D shapes
    annotations?:boolean
    fills?:boolean // Generate fills in SVG
    outlines?:boolean // Calculate the Shape outlines (Slow!)
}

export interface SVGtoPDFtransform
{
    svgUnits:string
    scale: number // SVG to PDF units scale
    translateX: number // first SVG transform to center
    translateY: number
    containerTranslateX: number // offset for container position including pivot
    containerTranslateY: number
    boundBy:'width'|'height' // content is bound by width or height
    contentOffsetX: number // Offset to align content
    contentOffsetY: number
    
}

export interface toDXFOptions 
{
    all?:boolean // also invisible
    annotations?:boolean // add annotations
    // TODO: more
}

//// DOCS:PAGE:CONTAINER:TEXTAREA ////

export interface TextAreaOptions
{
    size?:number|string // saved in 'point' (like in Word) - units are also allowed but converted in options
    color?:string // always converted to hex
    align?:TextAreaAlign
}

//// DOCS:BLOCKS

/** Important data of created ContainerBlock */
export interface ContainerBlock
{
    width:number // relative to page/content-area
    height:number // relative
    x:number // relative
    y:number // relative
    pivot:[number,number]
    bbox?:[number,number,number,number] // left,right,bottom,top (in rel coords, original left bottom)
}

export interface TitleBlockInput
{
    title ?: string
    designer ?: string
    logoUrl ?: string // default: archiyou logo
    designLicense ?: PublishLicense // license of the design
    manualLicense ?: PublishLicense // license of the manual
}

export interface LabelBlockOptions
{
    x?:string|number
    y?:string|number
    width?:string|number // 10mm, 5%, 0.5
    pivot?:[number,number]
    textSize?:string|number
    secondaryTextSize?:string|number
    labelSize?:string|number
    numTextLines?:number // number of lines of text
    margin?:number|string // between label/text and outer block
    line?:boolean
}


/** Configurator on how to draw shapes on documents (HTML or PDF) 
 *  These settings correspond to the style functions of jsPDF (with some exceptions!)
*/
export interface DocPathStyle {
    // see: https://pdfkit.org/docs/vector.html
    lineWidth?:number // in pnts
    // NOTE: butt=miter, bevel=square etc. see: https://artskydj.github.io/jsPDF/docs/jspdf.js.html#line4237
    lineCap?:'butt'|'round'|'bevel'
    lineJoin?:'butt'|'round'|'bevel'
    lineDashPattern?:Array<number|number> // size, space
    strokeColor?:string // 'red', '#FF0000'
    strokeOpacity?:number // [0.0-1.0] - NOTE: on jsPDF this is (set)drawColor 
    fillColor?:string
    fillOpacity?:number
    dash?: Array<number>
}

export interface PDFLinePath 
{
    path: string // the d of SVG paths in PDF coords: M 10 10 L 200 200 ...
    style: DocPathStyle
}
