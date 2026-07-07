/**
 *  Script.ts
 *    New script class for Archiyou Scripts
 *    Combines the creation in editor and publishing into one model
 *    Adds programmatic layer for validation 
 */

import { Check, Errors } from 'typebox/value'
import semver from 'semver'; // for version validation

import type { ScriptData, ScriptParamData, ScriptPublished, ScriptMeta } from './types';
import { ScriptParam } from './ScriptParam';
import { ScriptSchema, ScriptPublishedSchema, ScriptPublishedData } from './schemas'
import { hash, uuid4, dataToModuleString } from '../utils' // utils

export class Script 
{
    declare id: string; // uuid for the script (version) - this is primary because script names can be changed
    declare fileId:string // uuid for the file this script belongs to: Created when script is created, never changes.
    declare name: undefined|string; // optional, always lowercase. Still needed for saving.
    declare author: undefined|string; // optional always lowercase. Still needed for saving.
    declare created: Date;
    declare updated: Date;
    
    // Information on the published script (if null, not published)
    declare published: null|ScriptPublished  // This contains version
    
    declare description: undefined|string;
    declare details:undefined|string;
    tags: string[] = []; // array of tags for the script
    units: undefined|'metric'|'imperial'; // main unit system of the script (metric shows mm, imperial shows inches)
    
    declare code:string;
    params:Record<string,ScriptParam> = {}; 

    // presets are saved combinations of params
    presets:Record<string, Record<string, ScriptParamData>> = {}; 

    // run time information
    declare _meta: ScriptMeta|null;  // To be filled in by client or server after execution
    _valid:boolean = false; // internal validation flag
    _inline:boolean = false; // if script was created inline (used in handling inline component code)
    _component:string|undefined; // keep track how this component was referenced (NOTE: can be inline code!)

    constructor()
    {
        console.warn("Script::constructor(): Please use Script.fromData() to create a script from data.");    
    }

    /** Simple test if obj is Script instance. Use Script.fromData() to create one with validation */
    static isScript(obj:any): obj is Script
    {
        if(obj instanceof Script) return true;
        return false;
    }

    isValid():boolean
    {
        return this._valid;
    }

    namespace():string
    {
        return `${this.author}/${this.name}`;
    }

    //// VALIDATION AND DEFAULTS ////

    validate()
    {   
        const data = this.toData();

        if(!Check(ScriptSchema, data)) 
        {
            this._valid = false;
            const messages = Errors(ScriptSchema, data).map(e => e.message).join('; ');
            throw new Error(`Script.validate(): ${messages}`);
        }

        this._valid = true;
    }

    /** Returns actionable field-level error strings for raw (pre-transformed) script data.
     *  Checks each section independently to avoid union-type noise from TypeBox. */
    static diagnoseData(data: Record<string, any>): string[]
    {
        const errors: string[] = [];

        // Required field
        if (typeof data.code !== 'string')
        {
            errors.push('code: expected a string (required)');
        }

        // Params
        const params = data.params;
        if (params && typeof params === 'object')
        {
            for (const [key, value] of Object.entries(params))
            {
                try
                {
                    ScriptParam.fromData({ name: key, ...(value as object) } as ScriptParamData);
                }
                catch (e)
                {
                    const msg = e instanceof Error
                        ? e.message.replace(/^ScriptParam\.fromData\(\):\s*/, '')
                        : String(e);
                    errors.push(`params.${key}: ${msg}`);
                }
            }
        }

        // Published block (optional, but if present must have a semver version)
        const pub = data.published;
        if (pub && typeof pub === 'object')
        {
            if (!pub.version)
            {
                errors.push('published.version: required semver string (e.g. "1.0.0")');
            }
            else if (!semver.valid(semver.coerce(pub.version)))
            {
                errors.push(`published.version: "${pub.version}" is not a valid semver`);
            }

            const pubParams = pub.params;
            if (pubParams && typeof pubParams === 'object')
            {
                for (const [key, value] of Object.entries(pubParams))
                {
                    try
                    {
                        ScriptParam.fromData({ name: key, ...(value as object) } as ScriptParamData);
                    }
                    catch (e)
                    {
                        const msg = e instanceof Error
                            ? e.message.replace(/^ScriptParam\.fromData\(\):\s*/, '')
                            : String(e);
                        errors.push(`published.params.${key}: ${msg}`);
                    }
                }
            }
        }

        return errors;
    }

    //// PARAM CHECKS ////

    getDefaultParamValues():Record<string,any>
    {
        if(!this.params || typeof this.params !== 'object') { return {}; }
        return Object.fromEntries(
            Object.entries(this.params).map(([key, param]) => [key, param.default])
        );
    }

    /** Check parameter values against script definition params and give back error messages
     *  @return 
     *      success flag
     *      Record with valid values only
     */
    checkParamValuesVerbose(paramValues:Record<string,any>):{ success: boolean, errors: Array<string>, checkedParamValues: Record<string,any> }
    {
        let errors:Array<string> = [];
        let success: boolean = false;

        const checkedParamValues = Object.fromEntries(
            Object.entries(this.params).map(([key, param]) => {
                return [key, param.default];
            })
        );

        // empty/nullish input param values
        if(paramValues === null || typeof paramValues !== 'object' 
            || (typeof paramValues === 'object' && Object.keys(paramValues).length === 0))
        {
            return { success: true, errors: [], checkedParamValues };
        }

        for(const [key, value] of Object.entries(paramValues))
        {
            console.info(`Script.checkParamValues(): Checking param "${key}" with value:`, value);

            const keyUpper = key.toUpperCase();
            const param = this.params[keyUpper];

            if(!param)
            {  
                throw new Error(`Script.checkParamValuesVerbose(): Parameter "${key}" is not defined in script parameters. Check script params and published.params!`); 
            }

            const { success: validateSuccess, errors: validateErrors } = param.validateValueVerbose(value)

            if(param && validateSuccess)
            {
                checkedParamValues[keyUpper] = value;
                success = validateSuccess;
            }
            else {
                success = false;
                if(!param)
                { 
                    errors.push(`Script.checkParamValues(): Invalid param name "${key}", ignoring it.`);
                }
                else {
                    errors = errors.concat(validateErrors);
                }
            }
        }

        // Log all errors
        errors.forEach( (e) => console.error(e) );

        return { success, errors, checkedParamValues };   
    }

    /** Simple flag version */
    checkParamValues(paramValues:Record<string,any>):boolean
    {
        return this.checkParamValuesVerbose(paramValues).success;
    }


    //// PUBLISH ////

    /** Set publish data */
    publish(data: ScriptPublishedData): this
    {
        if (!Check(ScriptPublishedSchema, data))
        {
            const messages = Errors(ScriptPublishedSchema, data).map(e => e.message).join('; ');
            throw new Error(`Script.publish(): ${messages}`);
        }

        this.published = data as ScriptPublished;
        return this;
    }

     /** Used by library to set public url of this script */
    setPublishedUrl(rootUrl:string):this
    {
        if(this.published)
        {
            this.published.library = rootUrl; // without trailing slash
            this.published.url = `/${this.author}/${this.name}:${this.published.version}`;
        }
        else {
            console.warn("Script.setPublishedUrl(): Cannot set published URL, script is not published yet.");
        }
        return this;
    }

    //// PARAM VALUES ////

    validateParamValues(paramValues:Record<string,any>):boolean
    {
        for(const [key, value] of Object.entries(paramValues))
        {
            const param = this.params[key];
            
            if(!param)
            {
                console.error(`Script.validateParamValues(): Invalid param name "${key}"`);
                return false;
            }
            else if(!param.validateValue(value))
            {
                console.error(`Script.validateParamValues(): Invalid value for param "${key}": ${value}`);
                return false;
            }
        }
        return true;
    }

    /** When a script is executed with a set of params we generate a hash
     *  to uniquely identify the variant of the script. For example for caching
     */
    async getVariantId(paramValues: Record<string,any>): Promise<string> 
    {
        const HASH_LENGTH_TRUNCATE = 11;
        
        // generate string based on the param names and values
        // in format: {param1:value1,param2:value2,...}
        // NOTE: We use param definitions in script.params and default values if not set in paramValues
        const paramValuesDefault = Object.fromEntries(Object.entries(this.params).map(([paramName, paramObj]) => [paramName.toUpperCase(), paramObj?.default]));
        // Only accept param names that are also in definition 
        const paramValuesUpper = Object.fromEntries(
            Object.entries(paramValues)
                .map(([k, v]) => [k.toUpperCase(), v])
                .filter(([k, v]) => Object.keys(this.params).map(p => p.toUpperCase()).includes(k))
        );
        const input = JSON.stringify({...paramValuesDefault, ...paramValuesUpper}); // incoming overwrite default
        const variantHash = hash(input);

        // TODO: see is this still works after change to hash function instead of crypto
        const id = variantHash.substring(0, HASH_LENGTH_TRUNCATE);

        console.log(`Script::getVariantId(): Generated variant id "${id}" for param values: ${input}`);

        return id;
    }

    /** Get number of possible variants */
    getNumVariants():number
    {
        // No parameters, only one variant
        if(!this.params || typeof this.params !== 'object') return 1;

        if(Object.values(this.params).find(param => !param.isIterable()))
        {
            return Infinity;
        }

        return Object.values(this.params).reduce((acc, param) => {
            acc *= param.numValues();
            return acc;
        }, 1);
    }

    /** Iterate over all possible parameter variants
     *  @params params Array of parameter names to iterate over, others are kept to default
     */
    *iterateVariants(only?:Array<string>):Generator<Record<string,any>>
    {
        if(!this.params){ throw new Error("Script::iterateVariants: No parameters defined"); }

        only = only || Object.keys(this.params); // all

        // The params that we iterate
        const iterParams = Object.values(this.params).filter(p => p.isIterable() && only.includes(p.name));
        const staticParams = Object.values(this.params).filter(p => !p.isIterable() || !only.includes(p.name));
        const staticParamValues = Object.fromEntries(staticParams.map(p => [p.name, p.default]));

        // No params to iterate through
        if(iterParams.length === 0) 
        {
            // No iterable parameters, return static variant
            yield staticParamValues;
            return;
        }

        // Now start iterating along every parameter
        yield* this._generateCombinations(iterParams, staticParamValues);

    }

    /** Generate all parameter combinations
     *  This function uses recursion to generate all possible combinations of parameter values.
    */
    *_generateCombinations(params: Array<ScriptParam>, staticValues: Record<string,any>): Generator<Record<string,any>> 
    {
        if (params.length === 0) {
            yield staticValues;
            return;
        }
        
        const [firstParam, ...restParams] = params;
        
        for (const value of firstParam.iterateValues()) 
        {
            const currentValues = { ...staticValues, [firstParam.name]: value };
            
            if (restParams.length === 0) 
            {
                yield currentValues;
            } 
            else 
            {
                yield* this._generateCombinations(restParams, currentValues);
            }
        }
    }



    //// IO ////

    /** Load from raw data
     *  Some backwards compatibility
     */
    static fromData(data:Script|ScriptData|Record<string, any>):Script|null
    {
        // if already is a Script
        if (data instanceof Script){ return data as Script;}

        const script = Object.create(this.prototype) as Script;

        // start flags
        script._valid = false;
        script._inline = false;

        // attributes
        script.id = data.id ?? uuid4(); // scripts should always have an id
        script.fileId = (data as any).fileId ?? script.id; // fileId is same as id on first creation, but doesn't change when script is updated or new version is created

        script.created = script.created ?? new Date();
        script.updated = script.updated ?? new Date();

        script.name = data.name?.toLowerCase(); // some scripts don't have names
        script.author = data.author?.toLowerCase();
        script.description = data.description;
        script.tags = Array.isArray(data.tags) ? data.tags : [];
        script.units = (data as any).units;
        script.created = data.created ? new Date(data.created) : new Date();
        script.updated = data.updated ? new Date(data.updated) : new Date();
        script.code = data.code;

        // params are instances of ScriptParam
        script.params = (typeof data.params === 'object') 
            ? Object.entries(data.params).reduce((acc, [key, value]) => {
                    try {
                        acc[key] = ScriptParam.fromData({ name:key, ...(value as Object) as any }); // inject name 
                    }
                    catch(e) {
                        console.error(`Script::fromData(): Skipping param "${key}":`, e);
                    }
                return acc;
            }, {} as Record<string, ScriptParam>) : {};

        script.presets = data.presets || {};
        script.published = data.published || null; // will be validated in validate()     
        
        // Validate the script after loading
        try { 
            script.validate();
        }
        catch(e)
        {
            return null;
        }

        return script;
    }

    fixSemver(v:string)
    {
        return semver.valid(semver.coerce(v));
    }

    /** To raw data */
    toData():ScriptData
    {
        return {
            id: this.id,
            fileId: this.fileId,
            name: this.name,
            author: this.author,
            description: this.description,
            tags: this.tags,
            units: this.units,
            created: this.created ? this.created.toISOString() : null,
            updated: this.updated ? this.updated.toISOString() : null,
            code: this.code,
            params: (typeof this.params === 'object') 
                ? Object.entries(this.params).reduce((acc, [key, value]) => {
                    acc[key] = { name:key, ...value.toData() }; // inject name into ParamData
                    return acc;
                }, {} as Record<string, ScriptParamData>) : {},
            presets: this.presets,
            published: this.published,
        };
    }

    /** Export to module string - in this format the Script is saved in the library */
    toModuleString():string
    {
        return dataToModuleString(this.toData());
    }

    /** Export as a self-contained JS file.
     *  UI-defined params are emitted as $PARAMS.define() calls prepended to the script code.
     *  Programmatically-defined params are already in the code and are skipped. */
    toScriptJs(): string
    {
        const headerLines: string[] = [];
        if (this.name)        headerLines.push(`// ${this.name}`);
        if (this.description) headerLines.push(`// ${this.description}`);

        const uiParams = Object.values(this.params)
            .filter(p => !p._definedProgrammatically)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const paramBlock = uiParams.map(p => p.toScriptJs()).join('\n');

        const parts: string[] = [];
        if (headerLines.length) parts.push(headerLines.join('\n'));
        if (paramBlock)         parts.push(paramBlock);
        parts.push(this.code);

        return parts.join('\n\n');
    }

    //// UTILS ////

    /** Test if a given string could be a valid Script path 
     *  {{author}}/{{scriptname}}?:{{version}}
    */
    static isPath(s:string)
    {
        const regex = /^\s*([\w-]+)\/([\w-]+)(?::([\d.]+))?\s*$/;
        return regex.test(s);
    }

    /** Test if a string is probably script code 
     *  WARNING: unsafe!
    */
    static isProbablyCode(s:string)
    {
        const signs = ['box(','sphere(','cylinder(','plane(', 'sketch(', 'layer('];
        return signs.find(sign => s.toLowerCase().includes(sign));
    }
}

