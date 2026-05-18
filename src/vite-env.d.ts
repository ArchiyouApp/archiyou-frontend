/// <reference types="vite/client" />

declare module 'n8ao'
{
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
  import { Scene, Camera } from 'three';

  export interface N8AOConfiguration
  {
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    color: unknown;
    aoSamples: number;
    denoiseSamples: number;
    denoiseRadius: number;
    qualityMode: string;
    [key: string]: unknown;
  }

  export class N8AOPostPass extends Pass
  {
    configuration: N8AOConfiguration;
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    setSize(width: number, height: number): void;
  }

  export class N8AOPass extends Pass
  {
    configuration: N8AOConfiguration;
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    setSize(width: number, height: number): void;
  }
}

declare module 'troika-three-text'
{
  import { Mesh } from 'three';

  export class Text extends Mesh
  {
    text: string;
    fontSize: number;
    color: number | string;
    anchorX: number | 'left' | 'center' | 'right' | string;
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | string;
    outlineWidth: number | string;
    outlineColor: number | string;
    font: string | null;
    maxWidth: number;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export function preloadFont(
    options: { font?: string; characters?: string | string[] },
    callback: () => void,
  ): void;
}
