
/** DimensionLine Class 
 * 
 *  NOTES:
 *      - Dimension lines will be rendered in different contexts (3D GLTF viewer, html/SVG, PDF) 
 *          so we need enough data to alter representation in every context, while at the same time 
 *          minimizing repeating calculations
 *      - offset length can be set by user in world coordinates
 * 
*/

// TODO: after refactor
//import { DxfBlock, point3d } from '@tarikjabiri/dxf'

import type  { MainAxis, ModelUnits } from '../modeler/types'
import type { DimensionLineData, DimensionOptions, AnnotationType } from './types'
import { BaseAnnotation } from './AnnotatorBaseAnnotation'

import { isPointLike } from '../modeler/typeguards'

import { validate, optional } from '../decorators'
import { PointLikeSchema } from '../modeler/schemas'
import { DimensionOptionsSchema } from './schemas'
import { Type } from 'typebox'

import { roundTo } from '../utils' // utils
import { MM_PER_UNIT, toMM, formatLength } from '../units/UnitConverter'

export class DimensionLine extends BaseAnnotation
{
    //// SETTINGS
    DIMENSION_OFFSET_DEFAULT = 10; // in model units
    DIMENSION_ROUND_DEFAULT = true;

    // NOTE: line start and end is calculated when exporting toData()
    _initialized:boolean = false;
    targetStart:Point; // point on Shape
    targetEnd:Point; // point on Shape
    targetShape:AnyShape = null; // the (sub)shape (mostly an Edge) the dimension line is directly generated from
    linkedTo:any = null; // the main parent Shape or ShapeCollection this dimension is linked to
    // value:number; // the value of the dimension line, from BaseAnnotation
    static:boolean = false;
    units:ModelUnits = null;
    offsetVec:Vector; // Normalized Vector offset from Shape 
    offsetLength:number; // distance of DimensionLine to target Shape along offsetVec in world units: most of the time this is calculated based on view context

    ortho:boolean|MainAxis = false;
    _orthoAxis:MainAxis; // parallel to which axis it the ortho dimension line
    round:boolean = this.DIMENSION_ROUND_DEFAULT; 
    roundDecimals:number = 0;    
    textSize:number;

    interactive:boolean = false;
    showUnits:boolean = false;
    _param:string = null; // name of bound parameter
    _hasCustomOffsetVec:boolean = false;
    _offsetComponents:[number, number, number] | null = null;

    constructor(start:PointLike=null, end:PointLike=null, options?:DimensionOptions)
    {
        super('dimensionLine');

        if(start && end)
        {
            this.init(start,end, options)
        }
        else {
            console.warn(`DimensionLine::constructor(): DimensionLine not initialized. Use methods init(start,end,options) or fromEdge(shape, options) later!`)
        }

    }

    /** Check if a given object is a DimensionLine  */
    static isDimensionLine(o:any):boolean
    {
        return (typeof o === 'object') && o?._type == 'DimensionLine'
    }

    /** (Re)init dimension line */
    @validate(PointLikeSchema, PointLikeSchema, optional(DimensionOptionsSchema))
    init(start:PointLike, end:PointLike, options?:DimensionOptions):this
    {
        if(!start && !end){ throw new Error(`DimensionLine::init(): Please supply start and end Point!`); }

        this.targetStart = start as Point; // auto converted
        this.targetEnd = end as Point;

        this._initialized = true;
        this.setOptions(options)

        this._calculateAutoOffsetLength();
        this._calculateOffsetVec(); // don't override from options
        this.value = this._getDynamicValue();

        return this;
    }

    /** Generate a dimension line from this Edge */
    fromEdge(edge:Edge, options?:DimensionOptions):this
    {
        if(!this.classes.Shape.isShape(edge)){ throw new Error(`DimensionLine::init(): Please supply an Edge Shape`); }
        
        // TODO: AFTER REFACTOR generalize modeling API's
        if(!['Edge','Curve'].includes(edge.type as string))
        { 
            throw new Error(`DimensionLine::init(): Please supply a Edge. Other Shapes are not yet supported!`); 
        }
        
        this.targetShape = edge;
        this.linkedTo = this._getParentShape(edge); // set main Shape
        this.linkedTo.addAnnotations(this); // make two-sided link
        // init() validates options against an object schema — never pass undefined
        return this.init(edge.start().toPoint(), edge.end().toPoint(), options ?? {})
    }

    /** Centralized dimension creation for any Shape or SmartShape.
     *  Single source of truth — brep Shape.dim() and SmartShape.dim() both route here.
     *  Switches on shape.type:
     *    - 'Edge' (brep)                  → single dimension line
     *    - 'Curve' (mesh)                 → single line if open; bbox dims if isCuboid;
     *                                       otherwise route to Annotator.autoDim()
     *    - 'Wire' / 'Face'                → dimension every visible edge
     *    - 'Mesh' (mesh)                  → bbox dims if isCuboid; otherwise autoDim
     *    - 'Solid' / 'Shell'              → bounding-box dimensions
     *    - 'Vertex'                       → error
     */
    fromShape(shape:AnyShape, options?:DimensionOptions):DimensionLine|Array<DimensionLine>
    {
        const ann = this._archiyou.annotator;
        const t = (shape as any).type as string;

        // Normalize options: init() validates against an object schema, so never
        // pass undefined; default units from the model (mirrors old Edge.dimension).
        const opts: DimensionOptions = { ...(options ?? {}) };
        if (opts.units == null && this._archiyou?.modeler?.units)
        {
            opts.units = this._archiyou.modeler.units();
        }

        switch (t)
        {
            case 'Edge':
                return this.fromEdge(shape as Edge, opts);

            case 'Curve':
            {
                // Mesh-kernel Curve: an open single line still dimensions as one
                // edge; a closed cuboid (rectangle) gets axis-aligned bbox dims;
                // anything more complex routes to the Annotator's autoDim().
                const curve = shape as any;
                const isClosed = typeof curve.isClosed === 'function' && curve.isClosed();
                if (!isClosed)
                {
                    return this.fromEdge(shape as Edge, opts);
                }
                if (typeof curve.isCuboid === 'function' && curve.isCuboid())
                {
                    return this._dimensionBoxFromShape(shape as AnyShape);
                }
                return this._dispatchAutoDim(shape as AnyShape, opts);
            }

            case 'Wire':
            case 'Face':
            {
                const edges = new this.classes.ShapeCollection((shape as any).edges().visible()).toArray() as Array<Edge>;
                if (edges.length === 0) return this;
                this.fromEdge(edges[0], opts);
                const rest = edges.slice(1).map(e => ann.dimensionLine().fromEdge(e, opts));
                return [this, ...rest];
            }

            case 'Vertex':
                throw new Error(`DimensionLine::fromShape(): cannot dimension a single Vertex`);

            case 'Mesh':
            {
                // Mesh-kernel Mesh: 3 bbox dims if cuboid (2 if flat); otherwise
                // route to autoDim().
                const mesh = shape as any;
                if (typeof mesh.isCuboid === 'function' && mesh.isCuboid())
                {
                    return this._dimensionBoxFromShape(shape as AnyShape);
                }
                return this._dispatchAutoDim(shape as AnyShape, opts);
            }

            case 'Solid':
            case 'Shell':
            default:
            {
                return this._dimensionBoxFromShape(shape as AnyShape);
            }
        }
    }

    /** Run Annotator.dimensionBox(shape) and return the new lines, dropping the
     *  empty placeholder this fromShape() created. */
    _dimensionBoxFromShape(shape:AnyShape):Array<DimensionLine>
    {
        const ann = this._archiyou.annotator;
        ann._drop(this);
        const before = ann.getAnnotations().length;
        ann.dimensionBox(shape);
        return ann.getAnnotations().slice(before) as Array<DimensionLine>;
    }

    /** Wrap the shape in a ShapeCollection and forward to Annotator.autoDim().
     *  Drops the empty placeholder this fromShape() created. */
    _dispatchAutoDim(shape:AnyShape, opts:DimensionOptions):Array<DimensionLine>
    {
        const ann = this._archiyou.annotator;
        ann._drop(this);
        const before = ann.getAnnotations().length;
        const collection = new this.classes.ShapeCollection(shape);
        ann.autoDim(collection as AnyShapeCollection, opts);
        return ann.getAnnotations().slice(before) as Array<DimensionLine>;
    }

    /** Link this Annotation to given Shape or ShapeCollection 
     *  This helps with more advanced dimensioning and retrieving Dimension when exporting Shapes */
    link(to:AnyShapeOrCollection):this
    {
        this.linkedTo = (this.classes.Shape.isShape(to)) 
                            ? this._getParentShape(to)
                            : (this.classes.ShapeCollection.isShapeCollection(to) ? to as AnyShapeCollection : null); // Make sure we always got the top Shape

        if(!this.linkedTo)
        {
            console.warn(`AnnotatorDimensionLine::link(): No valid Shape or ShapeCollection to link to. Skipped!`)
            return this;
        }

        this.linkedTo.addAnnotations(this);

        // recalculate for offset based on main shape
        this._calculateAutoOffsetLength(); 
        this._calculateOffsetVec(true);
        return this;
    }

    /** Recurse parents to find main parent Shape of given shape */
    _getParentShape(s:AnyShapeOrCollection):AnyShapeOrCollection|null
    {
        if(!s || (typeof s !== 'object'))
        { 
            console.warn(`AnnotatorDimensionLine::_getParentShape(): Could not find a parent Shape. Did you supply a Shape to start recursion?`);
            return null;
        }
        return ((s as any)._parent) ? this._getParentShape((s as any)._parent) : s;
    }


    _getDynamicValue():number
    {
        return roundTo(
                (!this.ortho) ? this.targetDir().length() : this.dir().length(), 
                3);
    }

    type():AnnotationType
    {
        return 'dimensionLine';
    }

    /** Vector from target start to end, not normalized */
    targetDir():Vector
    {
        return this.targetEnd.toVector().subtracted(this.targetStart)
    }

    /** Vector from dimension line start to end */
    dir():Vector
    {
        return (!this.ortho) 
            ? this.targetDir()
            : this._calculatePoint('end').toVector().subtract(this._calculatePoint('start'))
    }

    /** Middle Point of this DimensionLine */
    targetMiddle():Point
    {
        return this.classes.Curve.Line(this.targetStart, this.targetEnd).middle()
    }

    /** Offset Vector of length offsetLength from target points to Dimension line */
    offset():Vector
    {
        const offsetComponents = this._getEffectiveOffsetComponents();

        return this._scaledOffset(offsetComponents, this.offsetLength)
    }

    /** Update when linked Shape is updated */
    update()
    {
        if(!this.static){ this.value = this._getDynamicValue() }
        this.updatePosition();
    }

    /** Update position after linked Shape has moved 
     *  !!!! IMPORTANT !!!! Improve this method
    */
    updatePosition()
    {
        // TODO: AFTER REFACTOR FIX
        if(this.targetShape && (this.targetShape.type() === 'Curve' || (this.targetShape as any).type() === 'Edge'))
        {
            const linkedEdge = (this.targetShape as Edge);
            this.targetStart = linkedEdge.start().toPoint();
            this.targetEnd = linkedEdge.end().toPoint();
            this._calculateOffsetVec(true); // force overwrite
            this._calculateAutoOffsetLength(); 
        }
    }

    /** Calculate the direction for offsetting from target  
     *  How to offset depends on dimension line type: normal, ortho
    */
    _calculateOffsetVec(overwrite:boolean=false):Vector
    {
        // Don't overwrite if already set
        if(this.offsetVec && !overwrite)
        {
            return this.offsetVec;
        }

        // If dimension line is parallel to z-axis, make offset the x-axis
        if ( this.targetDir().isParallel([0,0,1]))
        {
            this.offsetVec = new this.classes.Vector(1,0,0);
            return this.offsetVec;
        }
        else 
        {
            // Determine offset from a 2D/3D Shape: So the Shape can have an outside
            const insidePoint = ((this.linkedTo?.is2D() || this.linkedTo?.is3D()) ? this.linkedTo?.center() : new this.classes.Point(0,0,0)).toArray() as [number, number, number];
            const targetDir = this.targetDir().toArray() as [number, number, number];
            let newOffsetComponents = this._crossComponents(targetDir, [0, 0, 1]);

            if(this._componentsLength(newOffsetComponents) === 0)
            {
                newOffsetComponents = this._crossComponents(targetDir, [0, 1, 0]);
            }

            const targetMiddle = this.targetMiddle().toArray() as [number, number, number];
            const d1 = this._distanceBetween(this._addComponents(targetMiddle, newOffsetComponents), insidePoint);
            const d2 = this._distanceBetween(this._addComponents(targetMiddle, this._scaleComponents(newOffsetComponents, -1)), insidePoint);

            // Basic: newwOffsetVec points away from center
            if (d1 < d2) 
            {
                newOffsetComponents = this._scaleComponents(newOffsetComponents, -1);
            }

            newOffsetComponents = this._normalizeComponents(newOffsetComponents);

            // If ortho the offset vector is parallel to one of the 3 axis (or reversed)
            // What axis to use can be set by user
            // We first determine what axis the Shape occupy (1D/2D/3D) 
            // If no axis given by user we pick the one that has the biggest measurement
            if(this.ortho) // true, or 'x'  or 'y' 
            {
                const dimLineHasAxes = this.targetEdge().bbox().hasAxes();
                const shapeBiggestAxis = this.targetEdge().bbox().maxSizeAxis();

                this._orthoAxis = (typeof this.ortho !== 'string') 
                                            ? shapeBiggestAxis // autopick biggest axis
                                            : dimLineHasAxes.includes(this.ortho) 
                                                ? this.ortho
                                                : shapeBiggestAxis;
                const orthoOffsetAxis = ['x','y','z'].find(a => a !== this._orthoAxis ) as MainAxis
                const axisIndex = (orthoOffsetAxis === 'x') ? 0 : (orthoOffsetAxis === 'y') ? 1 : 2;
                const axisValue = newOffsetComponents[axisIndex] >= 0 ? 1 : -1;

                newOffsetComponents = [0, 0, 0];
                newOffsetComponents[axisIndex] = axisValue;
                
            }

            this._offsetComponents = [...newOffsetComponents] as [number, number, number];
            this.offsetVec = new this.classes.Vector(
                this._offsetComponents[0],
                this._offsetComponents[1],
                this._offsetComponents[2],
            );

            return this.offsetVec
        }        
    }

    _crossVectors(a:Vector, b:Vector):Vector
    {
        return new this.classes.Vector(
            a.y * b.z - a.z * b.y,
            a.z * b.x - a.x * b.z,
            a.x * b.y - a.y * b.x,
        );
    }

    _normalizeVector(v:Vector):Vector
    {
        const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

        if(length === 0)
        {
            return new this.classes.Vector(0,0,0);
        }

        return new this.classes.Vector(v.x / length, v.y / length, v.z / length);
    }

    _crossComponents(a:[number, number, number], b:[number, number, number]):[number, number, number]
    {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ];
    }

    _componentsLength(components:[number, number, number]):number
    {
        return Math.sqrt(
            components[0] * components[0]
            + components[1] * components[1]
            + components[2] * components[2],
        );
    }

    _normalizeComponents(components:[number, number, number]):[number, number, number]
    {
        const length = this._componentsLength(components);

        if(length === 0)
        {
            return [0, 0, 0];
        }

        return [
            components[0] / length,
            components[1] / length,
            components[2] / length,
        ];
    }

    _scaleComponents(components:[number, number, number], factor:number):[number, number, number]
    {
        return [
            components[0] * factor,
            components[1] * factor,
            components[2] * factor,
        ];
    }

    _addComponents(a:[number, number, number], b:[number, number, number]):[number, number, number]
    {
        return [
            a[0] + b[0],
            a[1] + b[1],
            a[2] + b[2],
        ];
    }

    _distanceBetween(a:[number, number, number], b:[number, number, number]):number
    {
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    _getEffectiveOffsetComponents():[number, number, number]
    {
        if(this._hasCustomOffsetVec && this.offsetVec)
        {
            return [this.offsetVec.x, this.offsetVec.y, this.offsetVec.z];
        }

        this._calculateOffsetVec(true);

        if(!this._offsetComponents)
        {
            return [0, 0, 0];
        }

        return [...this._offsetComponents] as [number, number, number];
    }

    _getPlanarOffsetComponents():[number, number, number] | null
    {
        if(this.ortho)
        {
            return null;
        }

        const targetDir = [
            this.targetEnd.x - this.targetStart.x,
            this.targetEnd.y - this.targetStart.y,
            this.targetEnd.z - this.targetStart.z,
        ] as [number, number, number];

        if(Math.abs(targetDir[2]) > 1e-9)
        {
            return null;
        }

        const planarLength = Math.hypot(targetDir[0], targetDir[1]);
        if(planarLength === 0)
        {
            return null;
        }

        let offsetComponents:[number, number, number] = [
            targetDir[1] / planarLength,
            -targetDir[0] / planarLength,
            0,
        ];

        const insidePoint = ((this.linkedTo?.is2D() || this.linkedTo?.is3D()) ? this.linkedTo?.center() : new this.classes.Point(0,0,0)).toArray() as [number, number, number];
        const targetMiddle = this.targetMiddle().toArray() as [number, number, number];
        const d1 = this._distanceBetween(this._addComponents(targetMiddle, offsetComponents), insidePoint);
        const d2 = this._distanceBetween(this._addComponents(targetMiddle, this._scaleComponents(offsetComponents, -1)), insidePoint);

        if(d1 < d2)
        {
            offsetComponents = this._scaleComponents(offsetComponents, -1);
        }

        return offsetComponents;
    }

    _resolveOffsetComponents():[number, number, number]
    {
        return this._getPlanarOffsetComponents() ?? this._getEffectiveOffsetComponents();
    }

    _scaledOffset(components:[number, number, number], distance:number):Vector
    {
        return new this.classes.Vector(
            components[0] * distance,
            components[1] * distance,
            components[2] * distance,
        );
    }

    /** Calculate a offset length */
    _calculateAutoOffsetLength():number
    {
        const l = this.DIMENSION_OFFSET_DEFAULT;
        if(this.offsetLength === undefined || this.offsetLength === null){ this.offsetLength = l; }
        return this.offsetLength;
    }

    /** The start and end point of DimensionLine in original coordinate system  
     *  Where the points are depends on type of dimension line. Normal or othogonal
    */
    _calculatePoint(at:'start'|'end'):Point
    {   
        if(!this.offsetLength) { this._calculateAutoOffsetLength(); }

        const sourcePoint = (at === 'start') ? this.targetStart : this.targetEnd;

        if(!this.ortho && this.targetStart.z === this.targetEnd.z)
        {
            const dx = this.targetEnd.x - this.targetStart.x;
            const dy = this.targetEnd.y - this.targetStart.y;
            const planarLength = Math.hypot(dx, dy);

            if(planarLength > 0 && dx !== 0 && dy !== 0)
            {
                let offsetX = dy / planarLength;
                let offsetY = -dx / planarLength;

                const insidePoint = ((this.linkedTo?.is2D() || this.linkedTo?.is3D()) ? this.linkedTo?.center() : new this.classes.Point(0,0,0)).toArray() as [number, number, number];
                const targetMiddle = this.targetMiddle().toArray() as [number, number, number];
                const d1 = this._distanceBetween([targetMiddle[0] + offsetX, targetMiddle[1] + offsetY, targetMiddle[2]], insidePoint);
                const d2 = this._distanceBetween([targetMiddle[0] - offsetX, targetMiddle[1] - offsetY, targetMiddle[2]], insidePoint);

                if(d1 < d2)
                {
                    offsetX *= -1;
                    offsetY *= -1;
                }

                return new this.classes.Point(
                    sourcePoint.x + offsetX * this.offsetLength,
                    sourcePoint.y + offsetY * this.offsetLength,
                    sourcePoint.z,
                );
            }
        }

        const offsetComponents = this._resolveOffsetComponents();
        const curPoint = sourcePoint.copy(); // Make sure we use copies!
        const offsetPoint = this._offsetPoint(curPoint, offsetComponents, this.offsetLength);

        // simple offset parallel to dimension line
        if(!this.ortho)
        {
            return offsetPoint;
        }
        else if(this.ortho)
        {
            // Offset from the point that has the biggest coordinate component parallel to offset vector
            const offsetAxis = this._largestAxis(offsetComponents)

            const offsetMainComponent = this._componentAt(offsetComponents, offsetAxis)
            
            const pointsOrdered = [this.targetStart.copy(), this.targetEnd.copy()].sort((a,b) => b[offsetAxis] - a[offsetAxis]); // order DESC
            if( offsetMainComponent < 0 ){ pointsOrdered.reverse(); }
            
            const offsetFromPoint = pointsOrdered[0];
            const offsettedPoint = this._offsetPoint(offsetFromPoint, offsetComponents, this.offsetLength);

            return (offsetFromPoint.equals(curPoint)) 
                        ? offsettedPoint  // curPoint is the point from which to offset
                        : curPoint.setComponent(offsetAxis, offsettedPoint[offsetAxis])
        }
    }

    _offsetPoint(p:Point, components:[number, number, number], distance:number):Point
    {
        return new this.classes.Point(
            p.x + components[0] * distance,
            p.y + components[1] * distance,
            p.z + components[2] * distance,
        );
    }

    _largestAxis(components:[number, number, number]):MainAxis
    {
        const [x, y, z] = components.map(c => Math.abs(c));

        if(x >= y && x >= z) { return 'x'; }
        if(y >= z) { return 'y'; }
        return 'z';
    }

    _componentAt(components:[number, number, number], axis:MainAxis):number
    {
        return (axis === 'x') ? components[0] : (axis === 'y') ? components[1] : components[2];
    }

    
    /** Get rotation in SVG coordinate system (so mirror y!) */
    getSVGRotation():number
    {
        return this.targetEnd.toVector().copy().mirror([0,0,0],[1,0,0])
            .subtract(this.targetStart.toVector().copy().mirror([0,0,0],[1,0,0])).angleXY();
    }

    //// OPERATIONS ////

    /** Set static value  */
    setValue(v:number|string):this
    {
        this.value = (typeof v === 'number') ? v : Number(v);
        this.static = true; // set this flag so we know if we need to update it in update()

        return this;
    }

    setOptions(o:DimensionOptions):this
    {
        this.ortho = o?.ortho ?? false;
        const optionsOffsetVec = (isPointLike(o?.offsetVec)) ? new this.classes.Vector(o.offsetVec) : null; // Transform any PointLikes of user into a Vector
        this._hasCustomOffsetVec = !!optionsOffsetVec;
        this.offsetVec = optionsOffsetVec || this.offsetVec || this._calculateOffsetVec();
        this._offsetComponents = this.offsetVec ? [this.offsetVec.x, this.offsetVec.y, this.offsetVec.z] : this._offsetComponents;
        this.offsetLength = o?.offset // Can also be 0, only if undefined/null we do something
        this.offsetLength = (this.offsetLength === undefined || o?.offset === null) ? this._calculateAutoOffsetLength() : this.offsetLength;

        this.units = o?.units || this.units;
        this.roundDecimals = o?.roundDecimals || this.roundDecimals;
        // TODO: more: color, linethickness etc.
        return this;
    }

    @validate(PointLikeSchema)
    setOffsetVec(v:PointLike):this
    {
        this._hasCustomOffsetVec = true;
        this.offsetVec = v as Vector; // auto converted
        this._offsetComponents = [this.offsetVec.x, this.offsetVec.y, this.offsetVec.z];
        return this;
    }

    /** Bind a script parameter to this dimension line, making the value text
     *  editable in the viewer overlay. The bound parameter is exported in
     *  toData() so the overlay can route edits back to the param-menu. */
    @validate(Type.String())
    bindParam(paramName:string):this
    {
        this._param = paramName;
        this.interactive = true;
        return this;
    }

    /** alias for bindParam */
    param(paramName:string):this
    {
        return this.bindParam(paramName);
    }

    /** Generic Shape method (every Annotation class should have this!) */
    toShape():Edge 
    {
        return this.toEdge();
    }

    /** Make a Line Edge out this DimensionLine */
    toEdge():Edge
    {
        return this.classes.Curve.Line(this._calculatePoint('start'), this._calculatePoint('end')) as Edge;
    }

    targetEdge():Edge
    {
        return this.classes.Curve.Line(this.targetStart, this.targetEnd) as Edge;
    }

    //// RELATIONS WITH OTHER DIMENSION LINES ////

    /* Generate an id to compare with other dimension lines */
    sameId(flags:Record<string,boolean>={}):string|null
    {
        /* 
            TODO: DimensionLines that are parallel to each other based on positioning is not taken into account!
                For now we see dimensionlines with same offset and length as same. This is a problem!
        */

        const DEFAULT_FLAGS = {
                compareOffsetAbs : true,
                compareOffsetLength : false ,
                compareValue: true,
                compareWithShape: true,
                compareProjYAxis: true, // y coord of projection of offset Vector from position
            }

        flags = { ...DEFAULT_FLAGS, ...flags }

        let ov = this.offsetVec.copy().round();

        if(flags.compareOffsetAbs) ov = ov.abs();
        
        const l = (flags.compareOffsetLength) ? this.offsetLength : 1;
        const v = (flags.compareValue) ? Math.round((typeof this.value === 'string') ? parseFloat(this.value) : this.value ) : ''; // round to full units by default
        const sId = (flags.compareWithShape) ? (this.linkedTo?.hashcode?.() || this.linkedTo?._hashcode?.() || this.uuid) : '';
        const y = (flags.compareProjYAxis) ? Math.round(this._projYAxis()) : ''

        return `${ov}-${l}-${v}-${sId}-${y}`;
    }

    isSame(other:DimensionLine, flags:Record<string,boolean>={}):boolean
    {
       if(!DimensionLine.isDimensionLine(other)){ return false; }

       const id1 = this.sameId(flags);
       const id2 = other.sameId(flags);

       return id1 === id2;
    }

    /** To distinguish between Dimension Lines we can calculate the y coord of the offset projected from the position  */
    _projYAxis():number
    {
        const offsetComponents = this._resolveOffsetComponents();
        const absOffset = offsetComponents.map(c => Math.abs(c)) as [number, number, number];
        const offsetAngle = Math.atan2(absOffset[1], absOffset[0]) * 180 / Math.PI;
        const targetMiddle = this.targetMiddle();

        return (Math.round(offsetAngle) === 90)
            ? 0 // exception
            : (Math.round(offsetAngle) === 0)
                ? Math.abs(targetMiddle.y)
                : (Math.round(offsetComponents[0]) === 0)
                    ? 0 
                    : Math.round(Math.abs(targetMiddle.y) - (absOffset[1] * Math.abs(targetMiddle.x) / absOffset[0]))
    }

    //// EXPORT ////

    /** Output to data (to be send from Webworker to main app) */
    toData():DimensionLineData
    {
        const offsetComponents = this._resolveOffsetComponents();

        const d = {
            type: 'dimensionLine',
            targetStart: this.targetStart.toArray(), // raw target start
            targetEnd: this.targetEnd.toArray(), // raw target end
            targetDir: this.targetDir().toArray(),
            start: this._calculatePoint('start').toArray(), // start of real line (i.e. the arrow!)
            end: this._calculatePoint('end').toArray(),
            dir: this.dir().toArray(),
            value: this.value,
            static: this.static,
            units: this.units,
            offsetVec: offsetComponents,
            offsetLength: this.offsetLength,
            offset: [
                offsetComponents[0] * this.offsetLength,
                offsetComponents[1] * this.offsetLength,
                offsetComponents[2] * this.offsetLength,
            ],
            interactive: this.interactive,
            round: this.round,
            roundDecimals: this.roundDecimals,
            param: this._param,
            showUnits: this.showUnits,
        } as unknown as DimensionLineData

        return d;
    }

    /** Generate SVG for this dimension line
     *     if 3D the Dimension Line is projected to XY plane
     *     NOTE: we need to transform from Archiyou coordinate system to the SVG one (flip y)
     */
    toSVG():string
    {   
        const lineStart = this._calculatePoint('start');
        const lineEnd = this._calculatePoint('end');
        const lineMid = lineStart.copy()
                            .move(lineEnd.toVector()
                            .subtract(lineStart)
                            .scale(0.5));

        const lineStartArr = lineStart.toArray();
        const lineEndArr =  lineEnd.toArray();
        const lineMidArr =  lineMid.toArray();

        // flip y-axis for SVG coordinate system
        lineStartArr[1] = -lineStartArr[1];
        lineEndArr[1] = -lineEndArr[1];
        lineMidArr[1] = -lineMidArr[1];

        const v = (typeof this.value === 'string') ? parseFloat(this.value) : this.value;
        // Convert the raw value (in this.units, the model unit) into the active
        // display system with an auto-picked unit + fractional inches. Always
        // labelled so the value is unambiguous when metric/imperial is toggled.
        const system = this._archiyou?.modeler?.unitSystem?.();
        const src = this.units;
        let dimText:string;
        if (system && src && (src as string) in MM_PER_UNIT && typeof v === 'number')
        {
            dimText = formatLength(toMM(v, src), system, { withUnit: true });
        }
        else
        {
            dimText = ((this.round) ? roundTo(v, this.roundDecimals) : this.value).toString();
            if (this.showUnits) dimText += this.units;
        }

        return `<g class="dimensionline">
                ${this._makeSvgLinePath(lineStartArr,lineEndArr)}
                ${this._makeSvgArrow(lineStartArr)}
                ${this._makeSvgArrow(lineEndArr, true)}
                ${this._makeSvgTextLabel(lineMidArr,dimText)}
            </g>
        `
    }

    /** Generate a line segment in SVG (with SVG coords) */
    @validate(PointLikeSchema, PointLikeSchema)
    _makeSvgLinePath(start:PointLike, end:PointLike)
    {  
       const startPoint = start as Point; // NOTE: auto converted to Point 
       const endPoint = end as Point;
       return `<line class="annotation line" style="stroke-width:0.5" x1="${startPoint.x}" y1="${startPoint.y}" x2="${endPoint.x}" y2="${endPoint.y}"/>`
    }

    /** Place SVG arrow on position and rotation. Tip of the arrow is pivot */
    // NOTE: Arrow itself is already in SVG space (so y-axis is pointing downwards)
    @validate(PointLikeSchema, Type.Optional(Type.Boolean({ default: false })))
    _makeSvgArrow(at:PointLike, flip?:boolean)
    {
       /*   Arrows in raw SVG
            - Pivot of arrow is at [0,0] pointing upwards (in SVG coordinate system of course)
            - use style for fill/stroke, so we can override it later (not tags fill="..")
            - TODO: different arrow styles
        */
       const SIZE = '10 5'; // Size of non-rotated graphic, use this for scaling
       const ARROWS_SVG  = {
            default: '<path class="arrow-path" style="fill:none;stroke-width:0.5" d="M -5 5 L 0 0 L 5 5" />'
       }
       const DEFAULT_ARROW_SVG = 'default'

       const atPoint = at as Point;
        
       const rotation = (flip) ? this.getSVGRotation() - 90 + 180: this.getSVGRotation() - 90;
       
       // NOTE: underscores _ in attributes are omitted (_worldSize => worldSize)
       return `
          <g 
                class="annotation arrow ${(flip) ? 'end' : 'start'}"
                worldSize="${SIZE}"
                transform="translate(${atPoint.x} ${atPoint.y}) 
                            rotate(${rotation})
                            scale(1 1)
                            ">
                            ${ARROWS_SVG[DEFAULT_ARROW_SVG]}
          </g>`
        
    }

    @validate(PointLikeSchema, Type.String())
    _makeSvgTextLabel(at:PointLike, text:string): string
    {
        /* IMPORTANT: 
            This font-size is temporary: 
            We need to make the text (and background rect) scale according to page size and view scale 
             so they are always the same
        */
       
        /* IMPORTANT: because SVG are mostly in mm the difference between font size 
            and the sizes of these drawings must not be too great the text boundingbox might 
            be so small that we loose accuracy.
        */
        const TMP_FONT_SIZE = '1';  
        const atPoint = at as Point;
        
        // NOTE: We rotate later in specific rendering method (html, PDF) for maximum control
        // We place data on element itself in attribute data
        const angle = 90 - this.offsetVec.copy().round().abs().angleXY(); // range [0,90] - NOTE: we reverse for SVG

        
        return `<text 
                        class="annotation text" 
                        text-anchor="middle"
                        alignment-baseline="middle"
                        font-size="${TMP_FONT_SIZE}"
                        style="fill:black;stroke-opacity:0;stroke-width:0"
                        x="${atPoint.x}"
                        y="${atPoint.y}"
                        data="{ 'angle': ${-angle} }"
                        dominant-baseline="central">${text}
                    </text>`; // NOTE: data in JSON format with "'"! TODO: Make this more elegant!
    }
    // NOTE: do very little styling here to be able to easily style with CSS. Only stroke-width is good to set (default is 1, 0.5 sets it apart from Shapes)

    /** Export Annotation to DXF aligned dimension line */
    // TODO AFTER REFACTOR
    /*
    toDXF(dxf:DxfBlock):this
    {
        dxf.addAlignedDim(
            point3d(this.targetStart.x, this.targetStart.y, 0), 
            point3d(this.targetEnd.x, this.targetEnd.y, 0),
            { offset: this.offsetLength as number }
        );
        return this;
    }
    */
}
