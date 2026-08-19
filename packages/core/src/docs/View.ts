import { Container } from './Container'
import type { ContainerData, ContainerContent, PageSVGContext } from './types'
import { ShapeCollection } from '@archiyou/meshup'
import { isKernelShapeOrCollection, kernelShapeToSVG } from '../modeler/typeguards'
import type { AnyShapeOrCollection } from '../modeler/types'
import { stripOuterSVGTags, getPreserveAspectRatio } from './utils'

export class View extends Container
{
    _shapes:ShapeCollection|string; // either a real reference to a ShapeCollection or the name of it that is suppose to be available after running the Doc pipeline
    _resolvedShapesSVG:string; // cached resolved SVG string
    _style:any; // general style (TODO)
    _styles:{[key:string]:any}; // style overrides (TODO)
    _dimension:any; // TODO
    _forceAll:boolean = false;

    constructor()
    {
        super(); // no name needed?
        this._type = 'view';
    }

    //// OUTPUT ////

    async toData():Promise<ContainerData> // TODO
    {
        return {
            ...this._toContainerData(),
            content: { 
                data: this.resolveShapesToSVG(), 
                settings: {} 
            } as ContainerContent,
        }
    }

    /** For components we need to remove all references to Shapes */
    resolveShapesToSVG():string
    {
        if(this._resolvedShapesSVG)
        { 
            console.info(`DocPageContainerView::resolveShapesToSVG(): Got svg from cache!`);
            return this._resolvedShapesSVG
        }

        const svg = (isKernelShapeOrCollection(this._shapes))
                        ? kernelShapeToSVG(this._shapes)
                        :  this.resolveShapeNameToSVG(this._shapes as string)

        this._resolvedShapesSVG = svg; // set to avoid double use
        
        return this._resolvedShapesSVG;
    }

    resolveShapeNameToSVG(shapesRef:string):string
    {
        if(typeof shapesRef !== 'string')
        {
            throw new Error(`View::resolveShapeNameToSVG(): Given shapes reference is not a string (got ${typeof shapesRef}). Pass either a ShapeCollection or the name (string) of a variable returned from the pipeline.`)
        }

        const archiyou = this._page?._docs?._archiyou as any;
        if(!archiyou)
        {
            console.warn(`View::resolveShapeNameToSVG(): No archiyou modules wired into Doc — cannot resolve shapes reference "${shapesRef}". Was the Doc constructed via the Runner?`);
            return null;
        }

        // Primary path: same scope the pipeline writes to (Doc.executePipelines uses
        // runner.getActiveScope()). Fall back to legacy worker locations.
        const workerScope = archiyou?.runner?.getActiveScope?.()
                            ?? archiyou?.scope
                            ?? archiyou?.worker?.self
                            ?? archiyou?.worker;

        if (!workerScope)
        {
            console.warn(`View::resolveShapeNameToSVG(): Could not determine execution scope for view "${this.name}" — looked at archiyou.runner.getActiveScope(), archiyou.scope, archiyou.worker.self, archiyou.worker. Shapes reference "${shapesRef}" cannot be resolved.`);
            return null;
        }

        if(!(shapesRef in workerScope))
        {
            const scopeKeys = Object.keys(workerScope).filter(k => !k.startsWith('_')).slice(0, 40);
            throw new Error(`View::resolveShapeNameToSVG(): Variable "${shapesRef}" was not found in the execution scope for view "${this.name}". Make sure your pipeline function returns it, e.g. \`pipeline(() => { ${shapesRef} = ...; return { ${shapesRef} } })\`. Available top-level scope keys: ${scopeKeys.join(', ') || '(none)'}.`);
        }

        const realShapes = workerScope[shapesRef];

        if(realShapes === undefined || realShapes === null)
        {
            throw new Error(`View::resolveShapeNameToSVG(): Variable "${shapesRef}" resolved to ${realShapes} for view "${this.name}". The pipeline function returned it but the value is empty.`);
        }

        if(!isKernelShapeOrCollection(realShapes))
        {
            const got = (realShapes as any)?.constructor?.name || typeof realShapes;
            throw new Error(`View::resolveShapeNameToSVG(): Variable "${shapesRef}" for view "${this.name}" is not a Shape or ShapeCollection (got ${got}). Return a Shape/ShapeCollection from your pipeline, e.g. \`${shapesRef} = myMainBox.iso()\`.`);
        }

        return kernelShapeToSVG(realShapes);
    }

    /** Bind ShapeCollection to View */
    shapes(shapes:AnyShapeOrCollection|string, all:boolean=false)
    {
        this._forceAll = all;
        // a reference to a ShapeCollection from main script
        if (isKernelShapeOrCollection(shapes))
        {
            // Keep the shape/collection as the kernel made it — only that kernel can draw it.
            this._shapes = shapes as ShapeCollection;
        }
        else if(typeof shapes === 'string')
        {
            this._shapes = shapes as string;
        }
        else {
            throw new Error('DocPageContainer:shapes(): Please supply either a reference to ShapeCollection or the name of one that will be available after running the pipeline!');
        }
    }

    //// OUTPUT: SVG ////

    async _toSVGContent(_ctx: PageSVGContext, wMm: number, hMm: number): Promise<string>
    {
        const svgData = this.resolveShapesToSVG();
        if (!svgData || typeof svgData !== 'string')
        {
            console.warn(`View::_toSVGContent(): No SVG data in view "${this.name}". Skipped.`);
            return '';
        }

        const fmt = (n: number) => +n.toFixed(4);
        const viewBoxMatch = svgData.match(/viewBox\s*=\s*["']([^"']+)["']/);
        const viewBox      = viewBoxMatch ? viewBoxMatch[1] : '';
        const innerContent = stripOuterSVGTags(svgData);
        const par          = getPreserveAspectRatio(this._contentAlign);
        const vbAttr       = viewBox ? ` viewBox="${viewBox}"` : '';

        return `<svg x="0" y="0" width="${fmt(wMm)}" height="${fmt(hMm)}"${vbAttr} preserveAspectRatio="${par}">${innerContent}</svg>`;
    }

    //// UTIL ////

    /** Used to remove DocDocument instances from execution scope
     *  Used in components
     */
    resolveScopeReferences():this
    {
        this.resolveShapesToSVG();
        this.shapes = null; // remove to be sure
        return this;
    }


}
