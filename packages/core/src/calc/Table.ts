/**
 *  Table.ts
 *     A table object holds data and enables easy adding, modifiying of data
 * 
*/

import type { JSONSchema7 } from 'json-schema';

import { Db } from './Db';
import type { DataRowColumnValue, DataRows, DataRowsColumnValue,
    FooterSpec, FooterOptions, FooterColumnSpec, FooterAggKeyword, ComputedFooterRow } from './types'
import { isDataRowsValues, isDataRowsColumnValue } from './typeguards';

import writeXlsxFile from 'write-excel-file/universal' // see: https://www.npmjs.com/package/write-excel-file

export class Table
{
    //// SETTINGS ////
    DEFAULT_COL_NAME = 'col';
    //// END SETTINGS

    _name:string;
    _db:Db; // reference to database parent
    _dataRows: DataRowsColumnValue; // raw data fallback: [{ col1: v1, col2: v2}, { col1: v3, col2: v4 }]}
    _schema:JSONSchema7; // optional JSON schema for this table
    _component:string; // component name if this table came from a component
    _footers:Array<{ spec:FooterSpec, options:FooterOptions }> = []; // footer aggregation blocks, kept separate from row data

    KNOWN_AGG_KEYWORDS:Array<FooterAggKeyword> = ['sum','average','avg','mean'];

    /** Make Table from rows with Objects or values */
    constructor(data:DataRows, columns:Array<string>=null)
    {
        if(isDataRowsValues(data)) 
        {
            // only rows with values [[r1v1,r1v2],[r2v1,r2v2]], make up column names
            // Set the columns later with setColumns()
            console.info(`Table::constructor(): Creating table with ${data.length} rows and ${data[0].length} columns`);
            this._dataRows = data.map((row,rowIndex) => row.reduce((acc,val,valIndex) => 
            {
                // accumulator is the new row
                acc[`${this.DEFAULT_COL_NAME}${valIndex}`] = val;
                return acc
            }, {}))
            console.info(`Table::constructor(): Created table with data ${JSON.stringify(this._dataRows)}`);
        }
        else if(isDataRowsColumnValue(data))
        {
            this._dataRows = data;
        }
        else {
            console.info(`Table: Can't create table. Unknown data format. Please supply [{ col1:v1, col2:v2 }, ...] or [[r1v1,r1v2],...]`);
        }
    
    }
    
    /** Print table to console */
    print()
    {
        return this._dataRows;
    }

    /** Get/set name */
    name(newName?:string):string|Table
    {
        if(!newName)
        { 
            return this._name;
        }
        this._db.renameTable(this, newName);
        return this;
    }

    /** Set JSON schema for defining the structure of this table */
    schema(schema?:JSONSchema7):this
    {
        this._schema = schema;
        return this;
    }

    /** Validate this Table against its schema */
    validate()
    {
        // TODO validate this._dataRows against this._schema
    }

    /** Save this Table in the database*/
    save(name?:string):Table
    {
        if(!this._db)
        {
            console.error(`Table::save: Table cannot register to the database. None given!`);
        }
        else {
            this._db.saveTable(this, name || this._name);
            this._name = name;
        }

        return this;
    }

    //// BASIC PROPERTIES ////

    firstRow():DataRowColumnValue
    {
        return this._dataRows[0] || {}
    }

    /** Get size of table in rows and columns */
    shape():Array<number> // [rows,columns]
    {
        return [this._dataRows.length, Object.keys(this._dataRows[0])?.length];
    }
    
    size():Array<number>
    {
        return this.shape();
    }

    numRows():number
    {
        return this.shape()[0];
    }

    numColumns():number
    {
        return this.shape()[1];
    }

    /** Set name of columns */
    setColumns(names:Array<string>):Table
    {
        if(!Array.isArray(names))
        {
            throw new Error(`Table::setColumns(columns): Please names of columns in an Array!`)    
        }

        this._dataRows = this._dataRows.map( row => {
            const newRow = {};
            for (const [colName,val] of Object.entries(row))
            {
                const i = Object.keys(row).indexOf(colName);
                newRow[names[i] || colName] = val;
            } 
            return newRow;
        })
        return this;
    }

    /** Get column names */
    columns():Array<string>
    {
        return this._dataRows.reduce( (agg, row) => 
        {
            Object.keys(row).forEach( (col) => 
            {
                if(!agg.includes(col))
                {
                    agg.push(col);
                }
            });
            return agg
        },
            []
        ) as Array<string>
    }


    /** Return index labels. By default serial integers */
    index():Array<string|number>
    {
        return Array.from(Array(this._dataRows.length).keys());
    }

    //// SIMPLE OPS ////

    /** Add a simple row consisting of valyues */
    addRow(row:Array<string|number|Record<string,  string|number>>):this
    {
        if(Array.isArray(row))
        {
            this._dataRows.push(this._zip(this.columns(), row))
        }
        else if(typeof row === 'object'){
            const fullRow = { ...this._zip(this.columns(), []), ...(row as Object) };
            this._dataRows.push(fullRow); // can directly push the key:value pair
        }

        return this;
    }

    //// FOOTERS ////

    /** Declare a footer block: per-column aggregations rendered as summary row(s) below the table.
     *  The spec maps column name to an aggregation keyword ('sum'|'average'|...), a custom
     *  function (values, rows) => value, or a literal label string.
     *  With options.groupBy the footer expands into one subtotal row per unique group value(s).
     *  Multiple footer() calls stack. Footers are stored separately from the row data.
     */
    footer(spec:FooterSpec, options:FooterOptions = {}):this
    {
        if(!spec || typeof spec !== 'object')
        {
            throw new Error(`Table::footer(spec, options): Please supply a footer spec like { length: 'sum', subpart: 'Total' }`);
        }
        this._footers.push({ spec, options });
        return this;
    }

    /** Remove all declared footer blocks */
    clearFooters():this
    {
        this._footers = [];
        return this;
    }

    /** Expand all declared footer blocks into concrete rendered rows */
    computeFooterRows():Array<ComputedFooterRow>
    {
        const result:Array<ComputedFooterRow> = [];

        this._footers.forEach(({ spec, options }) =>
        {
            const line = options.line !== false; // default true
            const bold = options.bold !== false; // default true
            const fill = options.fill;

            const groupByCols = (options.groupBy === undefined) ? []
                : (Array.isArray(options.groupBy) ? options.groupBy : [options.groupBy]);

            if(groupByCols.length === 0)
            {
                // single summary row over the whole table
                result.push({ values: this._computeFooterValues(spec, this._dataRows), line, bold, fill });
            }
            else
            {
                // one subtotal row per unique combination of groupBy column value(s), in first-seen order
                const groupKey = (row:DataRowColumnValue) => groupByCols.map(c => row[c]).join(' ');
                const seen = new Set<string>();
                const groupOrder:Array<string> = [];
                this._dataRows.forEach(row =>
                {
                    const k = groupKey(row);
                    if(!seen.has(k)){ seen.add(k); groupOrder.push(k); }
                });

                groupOrder.forEach((k, i) =>
                {
                    const groupRows = this._dataRows.filter(row => groupKey(row) === k);
                    const values = this._computeFooterValues(spec, groupRows);
                    // fill in the groupBy column(s) with this group's value(s)
                    groupByCols.forEach(c => { values[c] = groupRows[0]?.[c] ?? ''; });
                    result.push({ values, line: line && i === 0, bold, fill }); // only first row of block carries the line
                });
            }
        });

        return result;
    }

    /** Resolve every column in a footer spec over the given rows into a single values object */
    _computeFooterValues(spec:FooterSpec, rows:DataRowsColumnValue):DataRowColumnValue
    {
        const values:DataRowColumnValue = {};
        // start blank for all known columns so missing cells render empty
        this.columns().forEach(col => { values[col] = ''; });

        for (const [col, colSpec] of Object.entries(spec))
        {
            values[col] = this._resolveFooterCell(colSpec, rows.map(r => r[col]), rows);
        }
        return values;
    }

    /** Resolve a single footer cell spec into a value */
    _resolveFooterCell(colSpec:FooterColumnSpec, values:Array<any>, rows:DataRowsColumnValue):any
    {
        if(typeof colSpec === 'function')
        {
            return colSpec(values, rows);
        }
        if(typeof colSpec === 'string' && this.KNOWN_AGG_KEYWORDS.includes(colSpec as FooterAggKeyword))
        {
            return this._aggregate(colSpec as FooterAggKeyword, values);
        }
        // any other string is a literal label
        return colSpec;
    }

    /** Built-in numeric aggregations. Single switch is the extension point for min/max/count etc. */
    _aggregate(keyword:FooterAggKeyword, values:Array<any>):number
    {
        const nums = values.filter(v => this._isNumeric(v)).map(v => parseFloat(v));
        switch(keyword)
        {
            case 'sum':
                return nums.reduce((s,v) => s + v, 0);
            case 'average':
            case 'avg':
            case 'mean':
                return nums.length ? nums.reduce((s,v) => s + v, 0) / nums.length : 0;
            default:
                return NaN;
        }
    }

    //// SLICING AND DICING ////

    // TODO filtering, sorting, groupby, joins, merges, etc

    //// OUTPUT ////

    /** Output raw data in rows 
     * in format { [col1: row1val, col2: row1val2], [col1: row2val, ..] ... }
    * */
    toData():DataRows
    {
        return this._dataRows
    }

    /** Export this Table to Excel format in ArrayBuffer 
     * We use write-excel-file (https://www.npmjs.com/package/write-excel-file)
     *  And use automatic value type detection
    */
    async toExcel():Promise<ArrayBuffer>
    {
        // header row
        const headerRow = this.columns().map( colName => ({ value: colName, fontWeight: 'bold' }) );
        const dataRows = this._dataRows.map( row => 
            this.columns().map( colName => ({ value: row[colName] }) ) // no type, automatic detection
        );

        const blob = await writeXlsxFile([headerRow, ...dataRows], {}); // see options: https://gitlab.com/catamphetamine/write-excel-file
        return blob.arrayBuffer();
    }

    /** Output to Row objects */
    toDataRows():DataRowsColumnValue // TODO: TS typing
    {
        return this._dataRows;
    }

    /** Output to raw Array of values of this column */
    toDataColumn(columnName:string):Array<number|string>
    {
        return this._dataRows.map(row => row[columnName]); 
    }

    //// UTILS ////

    _protectNullUndefined(value:any)
    {
        if(value == null){
            return NaN;
        }
        if(value == undefined)
        {
            return NaN;
        }
        return value;
    }

    _zip(keys:Array<string>,values:Array<any>)
    {
        let obj = {};
        
        keys.forEach( (key, index) =>
        {
            obj[key] = values[index] ?? null
        });

        return obj;
    }

    _checkColumn(name:string)
    {
        return this.columns().includes(name);
    }

    _checkColumns(names:Array<string>)
    {
        return names.filter( name => this._checkColumn(name));
    }

    /** Remap keys of Object to new */
    _remapObject(obj:Object, map:Object)
    {
        let newObj = {}
        for (const [key,value] of Object.entries(obj))
        {
            newObj[map[key]] = value;
        }

        return newObj;
    }

    /** We need to convert some values into their real type */
    _makeRealValue(value:string)
    {
        // null
        if(value == 'null'){ return null; };
        // booleans
        if(value == 'false'){ return false;}
        if(value == 'true'){ return true; }
        // numbers
        if (this._isNumeric(value))
        {
            return parseFloat(value);
        }
        return value;

    }

    _isNumeric(value:string)
    {
        if(typeof value == 'number'){
            return true;
        }
        else {
            return !isNaN(value as any) && !isNaN(parseFloat(value)); // avoid TS errors
        }

    }

    _checkObject(obj:Object,columns:Array<string>)
    {
        for (let i = 0; i < columns.length; i++)
        {
            if(!Object.keys(obj).includes(columns[i]))
            {
                return false;
            }
        }
        return true;
    }

    _range(startIndex:number, endIndex:number):Array<number>
    {
        return Array.from({length: (endIndex - startIndex)}, (v, k) => k + startIndex);
    }
}