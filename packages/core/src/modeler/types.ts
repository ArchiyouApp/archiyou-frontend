// Mesh kernel
import type * as meshup from 'meshup/src/index'

import type { SmartSceneNode } from '../modeler/SmartSceneNode'

import { type Static } from 'typebox'
import { ModelUnitsSchema, ModelModeSchema, MainAxisSchema } from './schemas'


// Re-export for convenience
export type { AnySmartShape } from './SmartShapes'
export { isAnySmartShape, wrapBrepShape } from './SmartShapes'


// Infer from typebox schemas
export type ModelUnits = Static<typeof ModelUnitsSchema>
export type ModelMode = Static<typeof ModelModeSchema>
export type MainAxis = Static<typeof MainAxisSchema>
export type LayoutAnimationInterpolation = 'linear' | 'easeInOut' | 'easeIn' | 'easeOut' | 'spring'

export interface KernelClasses {
    Point:      typeof meshup.Point
    Vector:     typeof meshup.Vector
    Vertex:     typeof meshup.Vertex
    Shape:      typeof meshup.Shape
    Curve:      typeof meshup.Curve
    Mesh:       typeof meshup.Mesh
    ShapeCollection: typeof meshup.ShapeCollection
    Bbox:       typeof meshup.Bbox
}

export interface SmartShapeConversion
{
    method:    string
    fromMode:  ModelMode
    toMode:    ModelMode
    timestamp: number
}

//// SPECIAL ANIMATION OUTPUTS ////

export interface ExplodedViewOptions
{
    /** Distance to push each shape from its original position along the origin→pivot direction. Leave empty for automatic */
    distance?: number
}

export interface LayoutViewOptions
{
    /** Lateral spacing between shapes when laid flat. Default 1.5 */
    spacing?: number
}

export interface LayoutAnimationOptions
{
    duration?: number
    interpolation?: LayoutAnimationInterpolation // default 'linear'
    tween?: LayoutAnimationInterpolation // deprecated alias for interpolation
    animationName?: string
}

export interface LayoutTransformation
{
    sceneNode: SmartSceneNode
    translation: [number, number, number]
    rotation: [number, number, number, number]
    scale: [number, number, number]
}

export interface LayoutTransformationResult
{
    name: string
    translationMode: 'relative' | 'absolute' // For now always relative
    transforms: Array<LayoutTransformation> // LayoutTransformation includes node reference, so we can apply directly to scene
}

export interface SmartSceneNodeData
{
    name: string
    shape?: string | null // uuid of held shape; null/undefined for layer/group containers
    style: meshup.StyleData
    children: SmartSceneNodeData[]
}

