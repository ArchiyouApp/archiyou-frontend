/**
 *  SmartSceneNode.ts
 *
 *  A SceneNode specialised for Smart* shape instances.
 *  Extends meshup.SceneNode so all hierarchy management,
 *  style cascading, GLTF/SVG traversal, and query methods are inherited.
 *
 *  This is the leading scene management structure in Modeler.
 */

import { SceneNode } from 'meshup/src/index';
import type { StyleData } from 'meshup/src/Style';
import { isAnySmartShape, type AnySmartShape } from './SmartShapes';
import { SmartShapeCollection } from './SmartShapeCollection';
import type { SmartSceneNodeData } from './types';

/** Plain-object serialisation of a SmartSceneNode subtree.
 *  Used by RunnerComponentImporter to recreate a component's scene under
 *  the parent script's modeler. Shapes are kept as live references — they
 *  carry their _modeler from the component scope and must be re-bound on
 *  recreate. */
export interface ComponentGraphNode
{
    _entity: 'SceneNodeData';
    name: string;
    shape: AnySmartShape | null;
    style: Partial<StyleData>;
    children: ComponentGraphNode[];
}

export class SmartSceneNode extends SceneNode<any>
{
    /** Override so addLayer / add(string) create SmartSceneNode children, not plain SceneNode. */
    // @ts-ignore - TypeScript doesn't allow covariant return types in overrides
    protected override _createChild(name: string): SmartSceneNode
    {
        return new SmartSceneNode(name);
    }

    /** Accept Smart* shapes (duck-typed via isShapeClass). */
    override add(...items: Array<any>): this
    {
        items.forEach(item =>
        {
            if (isAnySmartShape(item))
            {
                this.addShape(item);
            }
            else
            {
                super.add(item)
            }
        })
        return this;
    }

    // @ts-ignore - TypeScript doesn't allow covariant return types in overrides
    override shapes(): SmartShapeCollection
    {
        return new SmartShapeCollection(super.shapes().toArray() as any);
    }

    /** Export this subtree as a plain ComponentGraphNode tree so it can be
     *  reconstructed inside a different scope (see RunnerComponentImporter).
     *  Node names are prefixed with the component label to keep merged scenes
     *  free of name collisions. */
    toComponentGraph(component: string, parent: ComponentGraphNode | null = null): ComponentGraphNode
    {
        const curNode: ComponentGraphNode = {
            _entity: 'SceneNodeData',
            name: parent ? `${component}_${this.name}` : component,
            shape: (this.shape() as AnySmartShape | null) ?? null,
            style: this.style.explicitData(),
            children: [],
        };

        this.children().forEach(child =>
        {
            (child as SmartSceneNode).toComponentGraph(component, curNode);
        });

        if (parent) parent.children.push(curNode);

        return curNode;
    }

    /** Serialise this subtree into the plain-data SmartSceneNodeData shape used
     *  by RunnerScriptExecutionResult.state and GLB extras.
     *
     *  Identity rules (must stay in sync with the viewer's path-map builder):
     *    - Each child is named by its node.name; siblings that share a name get
     *      a `[idx]` suffix on every occurrence after the first ('Mesh',
     *      'Mesh[1]', 'Mesh[2]', …). meshup auto-names raw meshes 'Mesh' so
     *      this matters.
     *    - When `renameRoot` is true the top-level node is emitted as 'Scene'
     *      (matching the convention the app/viewer use to look up paths).
     *    - Style is serialised via `.explicitData()` and augmented with
     *      shape-level visibility for leaf nodes so `shape.hide()` survives
     *      the worker boundary. */
    /** Recursively remove all descendant nodes that carry no shape and have no
     *  children with shapes (i.e. purely structural empty containers left behind
     *  by Make methods that pre-allocate group slots).
     *  The root node itself is never removed. Returns `this` for chaining. */
    pruneEmptyNodes(): this
    {
        // Post-order: prune children first so we see their final state.
        for (const child of [...this.children()] as SmartSceneNode[])
        {
            (child as SmartSceneNode).pruneEmptyNodes();

            const hasNoShape    = !child.hasShape();
            const hasNoChildren = child.children().length === 0;
            if (hasNoShape && hasNoChildren)
            {
                this.removeChild(child);
            }
        }
        return this;
    }

    /** Display names for a node's direct children, applying the sibling `[idx]`
     *  suffix rule ('Mesh', 'Mesh[1]', 'Mesh[2]', …). Single source of truth so
     *  toData() and path() can never drift. Returned array is aligned with the
     *  input order. */
    static _siblingDisplayNames(children: ReadonlyArray<SmartSceneNode>): string[]
    {
        const nameCounts: Record<string, number> = {};
        for (const c of children) nameCounts[c.name] = (nameCounts[c.name] ?? 0) + 1;
        const seen: Record<string, number> = {};
        return children.map((c) =>
        {
            if (nameCounts[c.name] > 1)
            {
                const idx = seen[c.name] = (seen[c.name] ?? 0) + 1;
                return `${c.name}[${idx - 1}]`;
            }
            return c.name;
        });
    }

    /** Canonical scene path of this node, e.g. `"Scene/walls/Box%5B0%5D"`.
     *  Identity used for selection/interaction across re-runs (shape UUIDs are
     *  regenerated each run, so they cannot be used). The format mirrors the
     *  viewer exactly: root emitted as 'Scene', each segment named by the
     *  sibling-suffix rule and URI-encoded (matching buildScenegraphPath in the
     *  viewer's state/editor.ts). */
    path(): string
    {
        // Build the chain root → this.
        const chain: SmartSceneNode[] = [];
        let n: SmartSceneNode | null = this;
        while (n) { chain.unshift(n); n = n.parent() as SmartSceneNode | null; }

        // Root is always 'Scene' regardless of its real name.
        let path = encodeURIComponent('Scene');
        for (let i = 1; i < chain.length; i++)
        {
            const parent = chain[i - 1];
            const siblings = parent.children() as SmartSceneNode[];
            const names = SmartSceneNode._siblingDisplayNames(siblings);
            const idx = siblings.indexOf(chain[i]);
            path += `/${encodeURIComponent(names[idx] ?? chain[i].name)}`;
        }
        return path;
    }

    toData(renameRoot: boolean = false): SmartSceneNodeData
    {
        const rawChildren = this.children() as Array<SmartSceneNode>;
        const names = SmartSceneNode._siblingDisplayNames(rawChildren);

        const children = rawChildren.map((c, i) =>
        {
            const data = c.toData(false);
            data.name = names[i];
            return data;
        });

        const shape = this.shape?.();
        const style = this.style?.explicitData?.() ?? {};
        if (style.visible === undefined && (shape as any)?.style?.visible === false)
        {
            style.visible = false;
        }

        return {
            name: renameRoot ? 'Scene' : this.name,
            shape: (shape as any)?.id?.() ?? null,
            style,
            children,
        };
    }

}
