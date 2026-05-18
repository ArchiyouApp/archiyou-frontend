import * as THREE from 'three';

export interface ViewStyleMaterialConfig {
  color?: number;
  opacity?: number;
  transparent?: boolean;
  wireframe?: boolean;
  flatShading?: boolean;
  side?: 'front' | 'back' | 'double';
  depthTest?: boolean;
  strokeWidth?: number;
  strokeDash?: number;
}

export interface ViewStyleLightConfig {
  enabled: boolean;
  color?: number;
  intensity?: number;
  castShadow?: boolean;
}

export interface ViewStyleGridConfig {
  visible: boolean;
  color?: number;
  divisions?: number;
  size?: number;
}

export interface ViewStyle {
  id: string;
  label: string;
  icon: string;
  description?: string;

  // Renderer
  background?: number;
  shadows?: boolean;
  toneMapping?: number;
  toneMappingExposure?: number;

  // Lighting
  environment?: 'room' | null;
  ambientLight?: ViewStyleLightConfig;
  spotlight?: ViewStyleLightConfig;
  hemiLight?: ViewStyleLightConfig;

  // Material overrides: undefined = no override, null = hide, object = replace
  mesh?: ViewStyleMaterialConfig | null;
  lines?: Partial<ViewStyleMaterialConfig> | null;

  // Grid
  grid?: ViewStyleGridConfig;
}

export const VIEW_STYLES: ViewStyle[] = [
  {
    id: 'realistic',
    label: 'Realistic',
    icon: 'sun',
    description: 'Full PBR shading with image-based lighting and shadows',
    background: 0xf1f5f9,
    shadows: true,
    toneMapping: THREE.AgXToneMapping,
    toneMappingExposure: 1.0,
    environment: 'room',
    ambientLight: { enabled: true, color: 0xffffff, intensity: 0.3 },
    spotlight: { enabled: true, color: 0xffffff, intensity: 5, castShadow: true },
    grid: { visible: false },
  },
  {
    id: 'xray',
    label: 'X-Ray',
    icon: 'eye',
    description: 'Semi-transparent surfaces reveal internal structure',
    background: 0xf1f5f9,
    shadows: false,
    toneMapping: THREE.AgXToneMapping,
    toneMappingExposure: 1.0,
    environment: null,
    ambientLight: { enabled: true, color: 0xffffff, intensity: 0.3 },
    spotlight: { enabled: true, color: 0xffffff, intensity: 5, castShadow: false },
    mesh: {
      opacity: 0.35,
      transparent: true,
      side: 'double',
      depthTest: true,
    },
    lines: { strokeWidth: 2  },
    grid: { visible: true, color: 0xFFFFFF, divisions: 20, size: 10 },
  },
  {
    id: 'wireframe',
    label: 'Wireframe',
    icon: 'grid-2x2',
    description: 'Show only edges and lines, mesh surfaces hidden',
    background: 0x111827,
    shadows: false,
    toneMapping: THREE.LinearToneMapping,
    toneMappingExposure: 1.0,
    environment: null,
    ambientLight: { enabled: true, color: 0xffffff, intensity: 0.5 },
    spotlight: { enabled: false },
    mesh: null,
    lines: { color: 0x00eeff },
    grid: { visible: false },
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    icon: 'compass',
    description: 'Technical blueprint look with navy background and construction grid',
    background: 0x0a1628,
    shadows: false,
    toneMapping: THREE.LinearToneMapping,
    toneMappingExposure: 1.0,
    environment: null,
    ambientLight: { enabled: true, color: 0x4a8ab5, intensity: 1.5 },
    spotlight: { enabled: false },
    mesh: {
      color: 0x1e3a6e,
      opacity: 0.8,
      transparent: true,
      side: 'double',
    },
    lines: { color: 0x4fc3f7,  },
    grid: { visible: true, color: 0x1e4b8a, divisions: 20, size: 10 },
  },
  {
    id: 'techdraw',
    label: 'Tech Draw',
    icon: 'ruler',
    description: 'Clean technical drawing: white surfaces, black edges',
    background: 0xfafafa,
    shadows: false,
    toneMapping: THREE.LinearToneMapping,
    toneMappingExposure: 1.0,
    environment: null,
    ambientLight: { enabled: true, color: 0xffffff, intensity: 2.0 },
    spotlight: { enabled: false },
    mesh: {
      color: 0xffffff,
      opacity: 1,
      transparent: false,
    },
    lines: { color: 0x111111 },
    grid: { visible: false },
  },
];
