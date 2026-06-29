import type { PointLike, AnyShapeCollection, AnyShapeOrCollection } from './types'

// TODO: BREP

import { isPointLike as meshupIsPointLike } from 'meshup/src/types'

export function isPointLike(value: any): value is PointLike
{
    // TODO: add brep isPointLike check when brep library is available
    return meshupIsPointLike(value);
}
