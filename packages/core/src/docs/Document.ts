import { Doc } from './Doc'
import { Page } from './Page'
import type { DocUnits, PageSize,
    PageOrientation, DocPipeline, DocData } from './types'
import { convertValueFromToUnit, escapeXml } from './utils'

/** A document that is part of a Doc module instance
 *  It contains pages and some settings */
export class Document
{
    //// SETTINGS ////
    DOC_DEFAULT_NAME = 'Document'; // default name for document
    DOC_UNITS_DEFAULT:DocUnits = 'mm'; // default document units
    DOC_PAGE_SIZE_DEFAULT:PageSize = 'A4'; // default ISO page size (A0-A7)
    DOC_PAGE_ORIENTATION_DEFAULT:PageOrientation = 'landscape'; // default page orientation
    //// END SETTINGS

    name:string; // name of document
    pageSize:PageSize; // ISO page size (A0-A7)
    pageOrientation:PageOrientation;
    units:DocUnits;

    _doc:Doc; // reference to Doc module
    _pages:Array<Page> = []; // pages in this document
    _pipelines:Array<DocPipeline> = []; // pipelines for this document, see DocPipelin
    _activePage?:Page; // active page in this document
    _component?:string; // component name if this document is part of a component - used for naming on merge
    
    constructor(doc:Doc, name:string)
    {
        this._doc = doc; // reference to Doc module
        this.name = name;
        
        this.pageSize = this.DOC_PAGE_SIZE_DEFAULT; // default page size
        this.pageOrientation = this.DOC_PAGE_ORIENTATION_DEFAULT; // default page orientation
        this.units = this.DOC_UNITS_DEFAULT; // default document units
    }

    /** Add page to this document */
    createPage(name:string):Page
    {
        if(this.pageExists(name)){ throw new Error(`Doc::page: Page name "${name}" is already taken. Please use unique names!`)}
        const newPage = new Page(this._doc, this, name);
        this._pages.push(newPage);
        this._activePage = newPage; // set active page if not set
        console.info(`Doc::createPage(): Created new page "${name}" in document "${this.name}" [#${this._pages.length}] with default settings [${this.units} - ${this.pageSize} - ${this.pageOrientation}]`);
        return newPage;
    }

    pageExists(name:string):boolean
    {
        return !!(this._pages.find(p => p.name === name));
    }

    addPipeline(p:DocPipeline):this
    {
        if(!p || !p.fn || typeof p.fn !== 'function')
        {
            throw new Error(`Doc::addPipeline(): Invalid pipeline function. Please provide a valid function.`);
        }
        this._pipelines.push(p);
        return this;
    }

    //// EXPORT SVG ////

    async toSVG(cache?: Record<string, any>): Promise<string>
    {
        const PAGE_GAP_MM = 10;
        const fmt = (n: number) => +n.toFixed(4);

        // Page dimensions in mm
        const pageSizesMm = this._pages.map(p => ({
            wMm: convertValueFromToUnit(p._width,  p._units, 'mm'),
            hMm: convertValueFromToUnit(p._height, p._units, 'mm'),
        }));

        // Vertical stacking: compute y-offsets for each page
        const yOffsets: number[] = [];
        let yOffset = 0;
        for (const { hMm } of pageSizesMm)
        {
            yOffsets.push(yOffset);
            yOffset += hMm + PAGE_GAP_MM;
        }
        const totalHeight = yOffset - PAGE_GAP_MM;
        const totalWidth  = Math.max(...pageSizesMm.map(p => p.wMm));

        // Shared clip-path ID counter across all pages in this document
        let clipCounter = 0;
        const nextClipId = () => `clip${++clipCounter}`;

        // Render each page
        const pageLayers: string[] = [];
        for (let i = 0; i < this._pages.length; i++)
        {
            const { layer } = await this._pages[i].toSVG(yOffsets[i], nextClipId, cache);
            pageLayers.push(layer);
        }

        // InkScape named view with one <inkscape:page> per page
        const inkscapePages = this._pages.map((p, i) =>
            `    <inkscape:page id="page${i+1}" x="0" y="${fmt(yOffsets[i])}" width="${fmt(pageSizesMm[i].wMm)}" height="${fmt(pageSizesMm[i].hMm)}" inkscape:label="${escapeXml(p.name)}"/>`
        ).join('\n');

        const namedView = `  <sodipodi:namedview id="namedview">\n${inkscapePages}\n  </sodipodi:namedview>`;

        return [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<svg`,
            `  xmlns="http://www.w3.org/2000/svg"`,
            `  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`,
            `  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"`,
            `  id="${escapeXml(this.name)}"`,
            `  width="${fmt(totalWidth)}mm"`,
            `  height="${fmt(totalHeight)}mm"`,
            `  viewBox="0 0 ${fmt(totalWidth)} ${fmt(totalHeight)}"`,
            `  version="1.1">`,
            namedView,
            ...pageLayers,
            `</svg>`,
        ].join('\n');
    }

    //// EXPORT DATA ////

    async toData(cache:Record<string, any>|undefined):Promise<DocData>
    {
        const docPagesData = [];
        
        if(this._pages.length === 0)
        {
            console.warn(`Document::toData(): No pages in document "${this.name}". Please create at least one page!`);
        }
        else {
            for(let i = 0; i < this._pages.length; i++)
            {
                const pageData = await this._pages[i].toData();
                docPagesData.push(pageData);
            }
        }

        return {
            name: this.name,
            units: this.units,
            pages: docPagesData,
            // set model units to calculate scale later
            modelUnits: this._doc._archiyou?.modeler?.units()
        }
        
    }

    //// COMPONENTS ////

    /** Remove all references that tie this Document instance to the execution scope */
    resolveScopeReferences():this
    {
        this._doc.executePipelines(); // make sure pipelines are executed before moving around
        this._pages.forEach( p => 
        {
            p?.resolveScopeReferences();
        });
        return this;
    }
}
