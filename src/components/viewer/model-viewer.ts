import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildScenegraphPath, executionResult, scenegraph, scriptParams, updateParam } from '../../state/workspace.js';
import type { ScriptOutputData } from '../../../devlibs/archiyou-core-next/src/execution/types.js';
import type { SmartSceneNodeData } from '../../../devlibs/archiyou-core-next/src/modeler/types.js';
import { applyEdgeExtensions } from './gltf-edge-extensions.js';
import { applyAnnotations } from './gltf-annotations.js';
import type { HtmlLabelDef } from './gltf-annotations.js';
import './viewer-labels-overlay.js';
import type { ViewerLabelsOverlay, OverlayLabel, OverlayLabelPos, DimensionParamChangeDetail } from './viewer-labels-overlay.js';
import { VIEWER_AUTO_FRAME_ON_FIRST_LOAD, VIEWER_BACKGROUND_COLOR,
  VIEWER_SCENE_TO_GRID_SIZE, VIEWER_GRID_CELLS_PER_SCENE, VIEWER_GRID_FALLBACK_SCENE_RADIUS,
  VIEWER_GIZMO_AXIS_LENGTH, VIEWER_GIZMO_SCENE_FRACTION, VIEWER_GIZMO_COLOR_X, VIEWER_GIZMO_COLOR_Y,
  VIEWER_GIZMO_COLOR_Z, VIEWER_GIZMO_COLOR_ORIGIN, VIEWER_GIZMO_LABEL_SIZE,
  VIEWER_ESSENTIALS_RESCALE_THRESHOLD, VIEWER_DIMENSION_REFERENCE_SCENE_RADIUS } from '../../settings.js';
import { VIEW_STYLES } from './view-styles.js';
import type { ViewStyle, ViewStyleMaterialConfig } from './view-styles.js';
import { FadingGrid } from './fading-grid.js';
import './viewer-menu.js';

/** Round a raw step size up to the nearest "nice" number (1, 2, 5, 10, 20, …). */
function _niceGridStep(rawStep: number): number
{
  if (rawStep <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm  = rawStep / power;
  if (norm < 1.5) return power;
  if (norm < 3.5) return 2 * power;
  if (norm < 7.5) return 5 * power;
  return 10 * power;
}

/**
 * <model-viewer> — Three.js GLTF viewer with IBL, spotlight shadows, and AgX tone mapping.
 */
@customElement('model-viewer')
export class ModelViewer extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    // Read signals so SignalWatcher tracks them and re-renders on change
    this._pendingGlbOutput = executionResult.get()?.outputs
      ?.find(o => o.path.requestedPath === 'default/model/glb');
    this._pendingScenegraph = scenegraph.get();

    return html`
      <canvas></canvas>
      <viewer-labels-overlay
        @dim-param-change=${this._onDimParamChange}
      ></viewer-labels-overlay>
      <viewer-menu
        .activeStyleId=${this._activeStyleId}
        .arSupported=${this._arSupported}
        .arActive=${this._arActive}
        .isOrtho=${this._isOrtho}
        .gridVisible=${this._gridVisible}
        .gizmoVisible=${this._gizmoVisible}
        .animations=${this._animationClips.map(c => c.name)}
        .activeAnimation=${this._activeAnimationName}
        @viewer-zoom-in=${this._zoomIn}
        @viewer-zoom-out=${this._zoomOut}
        @viewer-center=${this._centerCamera}
        @viewer-set-style=${(e: Event) =>
          this._applyViewStyle((e as CustomEvent<{ styleId: string }>).detail.styleId)}
        @viewer-set-animation=${(e: Event) =>
          this._playAnimation((e as CustomEvent<{ name: string | null }>).detail.name)}
        @viewer-toggle-ar=${this._toggleAR}
        @viewer-toggle-projection=${this._toggleProjection}
        @viewer-toggle-grid=${this._toggleGrid}
        @viewer-toggle-gizmo=${this._toggleGizmo}
      ></viewer-menu>
    `;
  }

  // ── 3. Lifecycle ──
  override firstUpdated()
  {
    const canvas = this.renderRoot.querySelector('canvas')!;
    this._initRenderer(canvas);
    this._initScene();
    this._initLights();
    this._initGround();
    this._initGizmo();
    this._initControls(canvas);
    this._initLoaders();
    this._initAR();
    this._loop();

    canvas.addEventListener('pointerdown', this._hitTestGizmo);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this);
  }

  override updated(_changed: Map<string, unknown>)
  {
    const glbOutput = this._pendingGlbOutput;
    if (glbOutput && glbOutput !== this._lastGlbOutput && this._renderer)
    {
      this._lastGlbOutput = glbOutput;
      this._loadGlbOutput(glbOutput);
    }

    // Re-apply full view style when the scenegraph signal mutates (toggle, or
    // a fresh result reconciled into a new tree). The signal always replaces
    // the root reference on mutation, so cheap reference compare is enough.
    if (this._pendingScenegraph !== this._lastAppliedScenegraph && this._renderer)
    {
      this._lastAppliedScenegraph = this._pendingScenegraph;
      this._applyViewStyle(this._activeStyleId);
    }
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    cancelAnimationFrame(this._frameId);
    this._resizeObserver?.disconnect();
    this._controls?.dispose();
    this._renderer?.dispose();
    this._roomEnvTexture?.dispose();
  }

  // ── 4. State ──

  // Reactive state that updates viewer-menu props
  @state() private _activeStyleId = 'realistic';
  @state() private _arSupported = false;
  @state() private _arActive = false;
  @state() private _isOrtho = false;
  @state() private _gridVisible = true;
  @state() private _gizmoVisible = true;

  // Three.js scene objects
  private _renderer!: THREE.WebGLRenderer;
  private _scene!: THREE.Scene;
  private _camera!: THREE.PerspectiveCamera;
  private _orthoCamera?: THREE.OrthographicCamera;
  private _controls!: OrbitControls;
  private _ambientLight!: THREE.AmbientLight;
  private _spotlight!: THREE.SpotLight;
  private _hemiLight?: THREE.HemisphereLight;
  private _gridHelper?: FadingGrid;
  private _appliedGridSize?: number;
  private _appliedGridDivisions?: number;
  private _appliedGridPrimary?:   number;
  private _appliedGridSecondary?: number;
  private _appliedGridPrimaryEvery?: number;
  // Scene radius the grid/gizmo/dimension arrows were last sized to.
  // `undefined` = still on the fallback build (no real model has informed sizing yet).
  // Used to detect bbox changes that exceed VIEWER_ESSENTIALS_RESCALE_THRESHOLD.
  private _lastSceneRadius?: number;
  private _gizmoGroup?: THREE.Group;
  private _roomEnvTexture?: THREE.Texture;

  // Model / animation
  private _gltfLoader!: GLTFLoader;
  private _resizeObserver?: ResizeObserver;
  private _frameId = 0;
  private _mixer?: THREE.AnimationMixer;
  private _clock = new THREE.Clock();
  @state() private _animationClips: THREE.AnimationClip[] = [];
  @state() private _activeAnimationName: string | null = null;
  private _dirty = true;
  private _currentModel?: THREE.Object3D;
  private _htmlLabels: HtmlLabelDef[] = [];
  private _projV = new THREE.Vector3(); // reused for world→screen projection
  private _lastGlbOutput?: ScriptOutputData;
  private _pendingGlbOutput?: ScriptOutputData;
  private _hasFramedCamera = false;

  // View-style override tracking
  private _savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private _savedLineColors = new Map<THREE.Object3D, { color: THREE.Color; opacity: number; transparent: boolean; linewidth?: number; dashed?: boolean; dashSize?: number; gapSize?: number }>();
  private _overrideMaterials: THREE.Material[] = [];
  private _hiddenObjects: THREE.Object3D[] = [];
  private _userHiddenObjects: THREE.Object3D[] = [];

  // AR
  private _xrSession?: unknown;

  // Node visibility (driven by scenegraph signal, identity by path).
  private _pendingScenegraph: SmartSceneNodeData | null = null;
  private _lastAppliedScenegraph: SmartSceneNodeData | null = null;
  /** Path → Three.js object map rebuilt on every GLB load; matches the
   *  filtering rules used by the runner-side path emitter so paths line up. */
  private _pathToObject = new Map<string, THREE.Object3D>();

  // Camera tween state for smooth axis-snap
  private _cameraTween?: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    upTarget: THREE.Vector3;
    t: number;
    duration: number;
  };

  // ── 5. Initialisation helpers ──

  private _initRenderer(canvas: HTMLCanvasElement)
  {
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    r.setClearColor(VIEWER_BACKGROUND_COLOR);
    this._renderer = r;
  }

  private _initScene()
  {
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(VIEWER_BACKGROUND_COLOR);

    // Image-based lighting from a procedural studio-style room environment
    const pmrem = new THREE.PMREMGenerator(this._renderer);
    const envScene = new RoomEnvironment();
    this._roomEnvTexture = pmrem.fromScene(envScene, 0.04).texture;
    this._scene.environment = this._roomEnvTexture;
    envScene.dispose();
    pmrem.dispose();

    this._camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this._camera.position.set(3, 2, 3);
  }

  private _initLights()
  {
    this._ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this._scene.add(this._ambientLight);

    // Key spotlight with VSM soft shadows
    const spot = new THREE.SpotLight(0xffffff, 5);
    spot.position.set(3, 5, 2);
    spot.angle = Math.PI / 5;
    spot.penumbra = 0.5;
    spot.decay = 2;
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0001;
    spot.shadow.radius = 4;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 20;
    this._scene.add(spot);
    this._scene.add(spot.target);
    this._spotlight = spot;
  }

  private _initGround()
  {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.15 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.userData.isViewerHelper = true;
    this._scene.add(mesh);
  }

  private _initControls(canvas: HTMLCanvasElement)
  {
    const c = new OrbitControls(this._camera, canvas);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.maxPolarAngle = Math.PI / 2 - 0.05;
    c.minDistance = 0.1;
    c.maxDistance = 50;
    c.target.set(0, 0.5, 0);
    c.update();

    // Belt-and-suspenders: mark dirty on any camera change event, in addition
    // to the controls.update() return-value check in the render loop.
    c.addEventListener('change', () => { this._dirty = true; });

    // On Linux/GTK, switching from a pointer-drag to a scroll wheel can fire
    // `pointercancel`, which releases browser pointer-capture without notifying
    // OrbitControls. OrbitControls leaves its internal `state` set to ROTATE/PAN,
    // and its wheel handler silently returns early while state !== _STATE.NONE (-1).
    // Resetting state here unblocks wheel events immediately.
    canvas.addEventListener('pointercancel', () =>
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).state = -1; // _STATE.NONE = -1 in Three.js r0.171
    });

    this._controls = c;
  }

  private _initLoaders()
  {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this._gltfLoader = new GLTFLoader();
    this._gltfLoader.setDRACOLoader(draco);
  }

  private _initAR = async () =>
  {
    if ('xr' in navigator)
    {
      try
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this._arSupported = await (navigator as any).xr.isSessionSupported('immersive-ar');
      }
      catch
      {
        this._arSupported = false;
      }
    }
  };

  // ── 6. Navigation controls ──

  private _zoomIn = () =>
  {
    if (this._isOrtho && this._orthoCamera)
    {
      const factor = 0.8;
      this._orthoCamera.left   *= factor;
      this._orthoCamera.right  *= factor;
      this._orthoCamera.top    *= factor;
      this._orthoCamera.bottom *= factor;
      this._orthoCamera.updateProjectionMatrix();
    }
    else
    {
      const dir = this._camera.position.clone().sub(this._controls.target);
      const dist = dir.length();
      const newDist = Math.max(this._controls.minDistance, dist * 0.8);
      this._camera.position.copy(
        this._controls.target.clone().add(dir.normalize().multiplyScalar(newDist)),
      );
      this._controls.update();
    }
    this._dirty = true;
  };

  private _zoomOut = () =>
  {
    if (this._isOrtho && this._orthoCamera)
    {
      const factor = 1.25;
      this._orthoCamera.left   *= factor;
      this._orthoCamera.right  *= factor;
      this._orthoCamera.top    *= factor;
      this._orthoCamera.bottom *= factor;
      this._orthoCamera.updateProjectionMatrix();
    }
    else
    {
      const dir = this._camera.position.clone().sub(this._controls.target);
      const dist = dir.length();
      const newDist = Math.min(this._controls.maxDistance, dist * 1.25);
      this._camera.position.copy(
        this._controls.target.clone().add(dir.normalize().multiplyScalar(newDist)),
      );
      this._controls.update();
    }
    this._dirty = true;
  };

  private _centerCamera = () =>
  {
    if (this._currentModel)
    {
      this._frameCamera(this._currentModel);
    }
    else
    {
      this._controls.target.set(0, 0.5, 0);
      this._camera.position.set(3, 2, 3);
      this._controls.update();
      this._dirty = true;
    }
  };

  private _updateCameraRangesForObject(obj: THREE.Object3D, framedDistance?: number)
  {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const currentDistance = this._camera.position.distanceTo(this._controls.target);
    const baseDistance = Math.max(framedDistance ?? 0, currentDistance, maxDim);

    this._controls.minDistance = Math.max(maxDim * 0.001, 0.01);
    this._controls.maxDistance = Math.max(baseDistance * 10, maxDim * 20);

    this._camera.near = Math.max(baseDistance * 0.001, 0.001);
    this._camera.far = Math.max(baseDistance * 50, maxDim * 50, this._camera.near + 1);
    this._camera.updateProjectionMatrix();

    if (this._isOrtho)
    {
      this._buildOrthoFromPersp();
      this._controls.object = this._orthoCamera!;
    }
  }

  private _playAnimation(name: string | null)
  {
    if (!this._mixer) return;

    if (name === null)
    {
      const activeClip = this._activeAnimationName
        ? this._animationClips.find(c => c.name === this._activeAnimationName)
        : undefined;

      if (!activeClip)
      {
        this._activeAnimationName = null;
        this._dirty = true;
        return;
      }

      this._mixer.stopAllAction();
      this._playClip(activeClip, true);
      this._activeAnimationName = null;
      this._dirty = true;
      return;
    }

    this._mixer.stopAllAction();
    const clip = this._animationClips.find(c => c.name === name);

    if (clip)
    {
      this._playClip(clip);
    }

    this._activeAnimationName = name;
    this._dirty = true;
  }

  private _playClip(clip: THREE.AnimationClip, reverse = false)
  {
    if (!this._mixer) return;

    const action = this._mixer.clipAction(clip);
    action.reset();
    action.paused = false;
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(reverse ? -1 : 1);
    action.setEffectiveWeight(1);
    action.time = reverse ? clip.duration : 0;
    action.play();
  }

  // ── 7. AR mode ──

  private _toggleAR = async () =>
  {
    if (!this._arSupported) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xr = (navigator as any).xr;

    if (this._arActive && this._xrSession)
    {
      await (this._xrSession as { end(): Promise<void> }).end();
      return;
    }

    try
    {
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
      });
      this._xrSession = session;
      this._renderer.xr.enabled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._renderer.xr.setSession(session as any);
      this._arActive = true;

      // Switch from rAF to XR animation loop
      cancelAnimationFrame(this._frameId);
      this._renderer.setAnimationLoop(() =>
      {
        if (this._controls.update()) this._dirty = true;
        this._renderer.render(this._scene, this._isOrtho ? this._orthoCamera! : this._camera);
      });

      session.addEventListener('end', () =>
      {
        this._arActive = false;
        this._xrSession = undefined;
        this._renderer.xr.enabled = false;
        this._renderer.setAnimationLoop(null);
        this._loop();
        this._dirty = true;
      });
    }
    catch (e)
    {
      console.warn('AR session failed:', e);
    }
  };

  // ── 8. View styles ──

  private _buildOrthoFromPersp(): void
  {
    const dist = this._camera.position.distanceTo(this._controls.target);
    const fovRad = (this._camera.fov * Math.PI) / 180;
    const frustumH = 2 * dist * Math.tan(fovRad / 2);
    const aspect = this._camera.aspect;

    if (!this._orthoCamera)
    {
      this._orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 10000);
    }
    this._orthoCamera.left   = -(frustumH * aspect) / 2;
    this._orthoCamera.right  =  (frustumH * aspect) / 2;
    this._orthoCamera.top    =  frustumH / 2;
    this._orthoCamera.bottom = -frustumH / 2;
    this._orthoCamera.near   = this._camera.near;
    this._orthoCamera.far    = this._camera.far;
    this._orthoCamera.position.copy(this._camera.position);
    this._orthoCamera.quaternion.copy(this._camera.quaternion);
    this._orthoCamera.updateProjectionMatrix();
  }

  private _toggleProjection = () =>
  {
    if (!this._isOrtho)
    {
      this._buildOrthoFromPersp();
      this._controls.object = this._orthoCamera!;
      this._controls.update();
      this._isOrtho = true;
    }
    else
    {
      this._camera.position.copy(this._orthoCamera!.position);
      this._camera.quaternion.copy(this._orthoCamera!.quaternion);
      this._camera.updateProjectionMatrix();
      this._controls.object = this._camera;
      this._controls.update();
      this._isOrtho = false;
    }
    this._dirty = true;
  };

  private _toggleGrid = () =>
  {
    this._gridVisible = !this._gridVisible;
    this._updateGrid();
    this._dirty = true;
  };

  private _toggleGizmo = () =>
  {
    this._gizmoVisible = !this._gizmoVisible;
    if (this._gizmoGroup) this._gizmoGroup.visible = this._gizmoVisible;
    this._dirty = true;
  };

  /**
   * Half-extent of the current model along its largest XZ axis, or `undefined`
   * if there's no model / it has an empty bbox. The grid + gizmo + dimension
   * arrows are sized from this value.
   */
  private _computeSceneRadius(): number | undefined
  {
    if (!this._currentModel) return undefined;
    const box = new THREE.Box3().setFromObject(this._currentModel);
    if (box.isEmpty()) return undefined;
    const sz = box.getSize(new THREE.Vector3());
    return Math.max(Math.max(sz.x, sz.z) * 0.5, 0.5);
  }

  /**
   * Rebuild the GridHelper and rescale the gizmo to match the current model
   * bounding box. Rebuilds on first load, when a real model first arrives, or
   * when the scene radius changes by more than
   * VIEWER_ESSENTIALS_RESCALE_THRESHOLD — otherwise keeps the existing
   * geometry so small parameter tweaks don't make the grid jump.
   * The grid colour is always allowed to change (driven by the active style).
   */
  private _updateGrid()
  {
    const style = VIEW_STYLES.find(s => s.id === this._activeStyleId);

    if (!style?.grid?.visible || !this._gridVisible)
    {
      if (this._gridHelper) this._gridHelper.visible = false;
      return;
    }

    const primary      = style.grid.primaryColor   ?? 0x666666;
    const secondary    = style.grid.secondaryColor ?? 0xAAAAAA;
    const primaryEvery = style.grid.primaryEvery   ?? 5;

    // ── Geometry: build on first call, when a real model first arrives, or
    // when a new model's scene radius differs from the last one by more than
    // VIEWER_ESSENTIALS_RESCALE_THRESHOLD (otherwise small parameter tweaks
    // would make the grid jump on every edit).
    const newRadius = this._computeSceneRadius();
    const onFallback = this._lastSceneRadius === undefined;
    const exceedsThreshold = newRadius !== undefined
      && this._lastSceneRadius !== undefined
      && Math.abs(newRadius - this._lastSceneRadius) / this._lastSceneRadius
           > VIEWER_ESSENTIALS_RESCALE_THRESHOLD;
    const needsBuild = !this._appliedGridSize
                       || (onFallback && newRadius !== undefined)
                       || exceedsThreshold;
    if (needsBuild)
    {
      const sceneRadius = newRadius ?? VIEWER_GRID_FALLBACK_SCENE_RADIUS;

      // Target cell size: one cell per `1 / VIEWER_GRID_CELLS_PER_SCENE` of the
      // scene diameter, snapped to a "nice" round step (1, 2, 5, 10, …).
      const cellStep  = _niceGridStep((sceneRadius * 2) / VIEWER_GRID_CELLS_PER_SCENE);
      // Total grid extent snapped to a whole multiple of the cell step so
      // primary lines line up cleanly with the centre.
      const size      = Math.ceil((sceneRadius * VIEWER_SCENE_TO_GRID_SIZE) / cellStep) * cellStep;
      const divisions = Math.round(size / cellStep);

      if (this._gridHelper)
      {
        this._scene.remove(this._gridHelper);
        this._gridHelper.geometry.dispose();
        (this._gridHelper.material as THREE.Material).dispose();
      }
      this._gridHelper = new FadingGrid(
        size, divisions, primary, secondary,
        VIEWER_BACKGROUND_COLOR, primaryEvery,
      );
      this._gridHelper.userData.isViewerHelper = true;
      this._scene.add(this._gridHelper);
      this._appliedGridSize         = size;
      this._appliedGridDivisions    = divisions;
      this._appliedGridPrimary      = primary;
      this._appliedGridSecondary    = secondary;
      this._appliedGridPrimaryEvery = primaryEvery;
      this._lastSceneRadius         = newRadius;

      // Scale the gizmo so its arm length = sceneRadius × VIEWER_GIZMO_SCENE_FRACTION
      if (this._gizmoGroup)
      {
        const targetLength = sceneRadius * VIEWER_GIZMO_SCENE_FRACTION;
        const s = targetLength / VIEWER_GIZMO_AXIS_LENGTH;
        this._gizmoGroup.scale.setScalar(s);
      }
      return;
    }

    // ── Grid already built: just show it and update colour if style changed ──
    if (!this._gridHelper)
    {
      // Geometry params known — recreate with existing values (e.g. after dispose)
      this._gridHelper = new FadingGrid(
        this._appliedGridSize,
        this._appliedGridDivisions!,
        primary, secondary,
        VIEWER_BACKGROUND_COLOR, primaryEvery,
      );
      this._gridHelper.userData.isViewerHelper = true;
      this._scene.add(this._gridHelper);
      this._appliedGridPrimary      = primary;
      this._appliedGridSecondary    = secondary;
      this._appliedGridPrimaryEvery = primaryEvery;
      return;
    }

    this._gridHelper.visible = true;

    if (this._appliedGridPrimary !== primary || this._appliedGridSecondary !== secondary)
    {
      this._gridHelper.setColors(primary, secondary);
      this._appliedGridPrimary   = primary;
      this._appliedGridSecondary = secondary;
    }
    if (this._appliedGridPrimaryEvery !== primaryEvery)
    {
      this._gridHelper.setPrimaryEvery(primaryEvery);
      this._appliedGridPrimaryEvery = primaryEvery;
    }
  }

  private _initGizmo()
  {
    this._gizmoGroup = new THREE.Group();
    this._gizmoGroup.userData.isViewerHelper = true;

    // label is the CAD-space name (Z=up system); axis is the Three.js geometric axis
    // Three.js Y (up) = CAD Z (up); Three.js -Z (depth) = CAD +Y
    const axes: Array<{ axis: 'x' | 'y' | 'z'; label: string; dir: THREE.Vector3; color: number }> = [
      { axis: 'x', label: 'X', dir: new THREE.Vector3(1, 0, 0), color: VIEWER_GIZMO_COLOR_X },
      { axis: 'y', label: 'Z', dir: new THREE.Vector3(0, 1, 0), color: VIEWER_GIZMO_COLOR_Z },
      { axis: 'z', label: 'Y', dir: new THREE.Vector3(0, 0, -1), color: VIEWER_GIZMO_COLOR_Y },
    ];

    const L = VIEWER_GIZMO_AXIS_LENGTH;

    for (const { axis, label, dir, color } of axes)
    {
      // positive solid line
      const posGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(L)]);
      const posMat = new THREE.LineBasicMaterial({ color, depthTest: false });
      const posLine = new THREE.Line(posGeo, posMat);
      posLine.renderOrder = 999;
      posLine.userData.isViewerHelper = true;
      this._gizmoGroup.add(posLine);

      // negative dashed line
      const negGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(-L)]);
      const negMat = new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.04, depthTest: false });
      const negLine = new THREE.Line(negGeo, negMat);
      negLine.computeLineDistances();
      negLine.renderOrder = 999;
      negLine.userData.isViewerHelper = true;
      this._gizmoGroup.add(negLine);

      // positive arrowhead cone (clickable handle)
      const coneH = L * 0.18;
      const coneR = L * 0.055;
      const coneGeo = new THREE.ConeGeometry(coneR, coneH, 8);
      const coneMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      // place tip at L, base at L - coneH
      cone.position.copy(dir.clone().multiplyScalar(L - coneH / 2));
      // orient cone from its default +Y direction onto the current axis direction
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      cone.renderOrder = 999;
      cone.userData = { isViewerHelper: true, isGizmoHandle: true, axis, negative: false };
      this._gizmoGroup.add(cone);

      // negative arrowhead (clickable handle)
      const coneNegGeo = new THREE.ConeGeometry(coneR, coneH, 8);
      const coneNeg = new THREE.Mesh(coneNegGeo, coneMat.clone());
      coneNeg.position.copy(dir.clone().multiplyScalar(-(L - coneH / 2)));
      coneNeg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().multiplyScalar(-1));
      coneNeg.renderOrder = 999;
      coneNeg.userData = { isViewerHelper: true, isGizmoHandle: true, axis, negative: true };
      this._gizmoGroup.add(coneNeg);

      // label sprite
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 32, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.setScalar(VIEWER_GIZMO_LABEL_SIZE);
      sprite.position.copy(dir.clone().multiplyScalar(L + VIEWER_GIZMO_LABEL_SIZE * 0.7));
      sprite.renderOrder = 999;
      sprite.userData.isViewerHelper = true;
      this._gizmoGroup.add(sprite);
    }

    // small origin sphere
    const originGeo = new THREE.SphereGeometry(L * 0.06, 8, 8);
    const originMat = new THREE.MeshBasicMaterial({
      color:       VIEWER_GIZMO_COLOR_ORIGIN,
      depthTest:   false,
      toneMapped:  false, // keep the configured colour exact (AgX would otherwise tint pure white slightly)
    });
    const originSphere = new THREE.Mesh(originGeo, originMat);
    originSphere.renderOrder = 999;
    originSphere.userData.isViewerHelper = true;
    this._gizmoGroup.add(originSphere);

    this._scene.add(this._gizmoGroup);
  }

  private _hitTestGizmo = (e: PointerEvent) =>
  {
    if (!this._gizmoGroup) return;
    const canvas = this.renderRoot.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const activeCamera = this._isOrtho ? (this._orthoCamera ?? this._camera) : this._camera;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, activeCamera);

    const handles = this._gizmoGroup.children.filter(c => c.userData.isGizmoHandle);
    const hits = raycaster.intersectObjects(handles, false);
    if (!hits.length) return;

    e.stopPropagation();
    e.preventDefault();
    const hit = hits[0].object;
    this._snapCameraToAxis(hit.userData.axis as 'x' | 'y' | 'z', hit.userData.negative as boolean);
  };

  private _snapCameraToAxis(axis: 'x' | 'y' | 'z', negative: boolean)
  {
    const target = this._controls.target.clone();
    const dist   = this._camera.position.distanceTo(target);

    const dir = new THREE.Vector3();
    if (axis === 'x') dir.set(negative ? -1 : 1, 0, 0);
    else if (axis === 'y') dir.set(0, negative ? -1 : 1, 0);
    else dir.set(0, 0, negative ? 1 : -1);

    const toPos = target.clone().add(dir.multiplyScalar(dist));
    // choose up vector that avoids gimbal lock on the Y axis
    const upTarget = axis === 'y'
      ? new THREE.Vector3(0, 0, negative ? -1 : 1)
      : new THREE.Vector3(0, 1, 0);

    this._cameraTween = {
      from:      this._camera.position.clone(),
      to:        toPos,
      upTarget,
      t:         0,
      duration:  0.4,
    };
    this._dirty = true;
  }

  private _applyViewStyle(styleId: string)
  {
    const style = VIEW_STYLES.find(s => s.id === styleId);
    if (!style) return;

    // Restore materials from any previous override style before applying new one
    this._restoreStyleOverrides();

    // Background + renderer
    const bg = style.background ?? VIEWER_BACKGROUND_COLOR;
    this._scene.background = new THREE.Color(bg);
    this._renderer.setClearColor(bg);

    if (style.toneMapping !== undefined) this._renderer.toneMapping = style.toneMapping as THREE.ToneMapping;
    if (style.toneMappingExposure !== undefined) this._renderer.toneMappingExposure = style.toneMappingExposure;

    // Shadows
    const shadows = style.shadows ?? true;
    this._renderer.shadowMap.enabled = shadows;
    this._spotlight.castShadow = shadows;

    // IBL environment
    if (style.environment === 'room')
    {
      if (!this._roomEnvTexture)
      {
        const pmrem = new THREE.PMREMGenerator(this._renderer);
        const envScene = new RoomEnvironment();
        this._roomEnvTexture = pmrem.fromScene(envScene, 0.04).texture;
        envScene.dispose();
        pmrem.dispose();
      }
      this._scene.environment = this._roomEnvTexture;
    }
    else if (style.environment === null)
    {
      this._scene.environment = null;
    }

    // Lighting
    this._applyLightConfig(this._ambientLight, style.ambientLight);
    this._applyLightConfig(this._spotlight, style.spotlight);

    if (style.hemiLight)
    {
      if (!this._hemiLight)
      {
        this._hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
        this._scene.add(this._hemiLight);
      }
      this._applyLightConfig(this._hemiLight, style.hemiLight);
    }
    else if (this._hemiLight)
    {
      this._hemiLight.visible = false;
    }

    // Grid + Fog (auto-sized to scene bounds)
    this._activeStyleId = styleId;
    this._updateGrid();

    // Material overrides — traverse scene only when the style has mesh/line config
    if (style.mesh !== undefined || style.lines !== undefined)
    {
      this._scene.traverse((node) =>
      {
        if (node.userData.isViewerHelper) return;

        const isLineSegments2 = node.type === 'LineSegments2';
        const isNativeLine = node instanceof THREE.LineSegments || node instanceof THREE.Line;
        const isMeshSurface = (node as THREE.Mesh).isMesh && !isLineSegments2;

        if (isLineSegments2 || isNativeLine)
        {
          this._applyLineStyleOverride(node, style);
        }
        else if (isMeshSurface)
        {
          this._applyMeshStyleOverride(node as THREE.Mesh, style);
        }
      });
    }

    // Apply user-controlled node visibility on top of style overrides
    this._applyScenegraphVisibility(this._pendingScenegraph);

    this._dirty = true;
  }

  /** Walk the scenegraph; for every node with `style.visible === false`,
   *  look up its Three.js object by path and hide it. Restores previously
   *  user-hidden objects first so toggling back to visible always succeeds. */
  private _applyScenegraphVisibility(graph: SmartSceneNodeData | null)
  {
    for (const obj of this._userHiddenObjects) obj.visible = true;
    this._userHiddenObjects = [];

    if (!graph || !this._currentModel) return;

    const walk = (node: SmartSceneNodeData, parentPath: string) =>
    {
      const path = buildScenegraphPath(parentPath, node.name);
      if (node.style.visible === false)
      {
        const obj = this._pathToObject.get(path);
        if (obj)
        {
          obj.visible = false;
          this._userHiddenObjects.push(obj);
        }
      }
      node.children.forEach(c => walk(c, path));
    };
    walk(graph, '');
    this._dirty = true;
  }

  /** Rebuild `_pathToObject` from the freshly loaded model. When the runner
   *  scenegraph is available, use its canonical names directly so UI paths and
   *  viewer lookups stay aligned after refactors that changed GLTF node names.
   *  For standalone GLBs without state, fall back to inferred object names. */
  private _buildPathMap(root: THREE.Object3D, graph?: SmartSceneNodeData | null): void
  {
    this._pathToObject.clear();
    const geoTypes = ModelViewer._GEO_TYPES;

    const semanticChildrenOf = (obj: THREE.Object3D) =>
      obj.children.filter((child) => !child.userData.isViewerHelper && !geoTypes.has(child.type));

    if (graph)
    {
      const recurWithGraph = (
        obj: THREE.Object3D,
        node: SmartSceneNodeData,
        parentPath: string,
      ) =>
      {
        const path = buildScenegraphPath(parentPath, node.name);
        this._pathToObject.set(path, obj);

        const objectChildren = semanticChildrenOf(obj);
        const childCount = Math.min(objectChildren.length, node.children.length);
        for (let i = 0; i < childCount; i++)
        {
          recurWithGraph(objectChildren[i], node.children[i], path);
        }
      };

      recurWithGraph(root, graph, '');
      return;
    }

    const recur = (obj: THREE.Object3D, parentPath: string, nameOverride?: string) =>
    {
      const name = nameOverride ?? (parentPath === '' ? 'Scene' : (obj.name || obj.type));
      const path = parentPath ? `${parentPath}/${name}` : name;
      this._pathToObject.set(path, obj);

      const semanticChildren = semanticChildrenOf(obj);

      const nameCounts: Record<string, number> = {};
      for (const c of semanticChildren)
      {
        const cname = c.name || c.type;
        nameCounts[cname] = (nameCounts[cname] ?? 0) + 1;
      }
      const seen: Record<string, number> = {};

      for (const c of semanticChildren)
      {
        let cname = c.name || c.type;
        if (nameCounts[cname] > 1)
        {
          const idx = seen[cname] = (seen[cname] ?? 0) + 1;
          cname = `${cname}[${idx - 1}]`;
        }
        recur(c, path, cname);
      }
    };
    recur(root, '');
  }

  private _applyMeshStyleOverride(mesh: THREE.Mesh, style: ViewStyle)
  {
    if (style.mesh === null)
    {
      this._hiddenObjects.push(mesh);
      mesh.visible = false;
    }
    else if (style.mesh !== undefined)
    {
      const existingMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      this._savedMaterials.set(mesh, mesh.material);
      const newMat = this._buildMeshMaterial(style.mesh, existingMat);
      this._overrideMaterials.push(newMat);
      mesh.material = newMat;
    }
  }

  private _applyLineStyleOverride(node: THREE.Object3D, style: ViewStyle)
  {
    if (style.lines === null)
    {
      this._hiddenObjects.push(node);
      node.visible = false;
    }
    else if (style.lines !== undefined)
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mat = (node as any).material;
      if (mat?.color)
      {
        this._savedLineColors.set(node, {
          color: mat.color.clone(),
          opacity: mat.opacity ?? 1,
          transparent: mat.transparent ?? false,
          linewidth: 'linewidth' in mat ? mat.linewidth : undefined,
          dashed: 'dashed' in mat ? mat.dashed : undefined,
          dashSize: 'dashSize' in mat ? mat.dashSize : undefined,
          gapSize: 'gapSize' in mat ? mat.gapSize : undefined,
        });
        if (style.lines.color !== undefined) mat.color.setHex(style.lines.color);
        if (style.lines.strokeWidth !== undefined && 'linewidth' in mat) mat.linewidth = style.lines.strokeWidth;
        if (style.lines.strokeDash !== undefined)
        {
          if ('dashed' in mat) mat.dashed = style.lines.strokeDash > 0;
          if ('dashSize' in mat) mat.dashSize = style.lines.strokeDash;
        }
      }
    }
  }

  private _restoreStyleOverrides()
  {
    for (const [mesh, mat] of this._savedMaterials)
    {
      mesh.material = mat;
    }
    this._savedMaterials.clear();

    for (const [obj, saved] of this._savedLineColors)
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mat = (obj as any).material;
      if (mat?.color)
      {
        mat.color.copy(saved.color);
        mat.opacity = saved.opacity;
        mat.transparent = saved.transparent;
        if (saved.linewidth !== undefined && 'linewidth' in mat) mat.linewidth = saved.linewidth;
        if (saved.dashed !== undefined && 'dashed' in mat) mat.dashed = saved.dashed;
        if (saved.dashSize !== undefined && 'dashSize' in mat) mat.dashSize = saved.dashSize;
        if (saved.gapSize !== undefined && 'gapSize' in mat) mat.gapSize = saved.gapSize;
      }
    }
    this._savedLineColors.clear();

    for (const obj of this._hiddenObjects)
    {
      obj.visible = true;
    }
    this._hiddenObjects = [];

    for (const mat of this._overrideMaterials)
    {
      mat.dispose();
    }
    this._overrideMaterials = [];
  }

  private _buildMeshMaterial(config: ViewStyleMaterialConfig, existingMat?: THREE.Material): THREE.Material
  {
    const existingColor = existingMat && 'color' in existingMat
      ? (existingMat as THREE.MeshBasicMaterial).color?.getHex()
      : undefined;
    const existingOpacity = existingMat?.opacity;
    const existingSide = existingMat?.side;
    const existingFlatShading = existingMat && 'flatShading' in existingMat
      ? (existingMat as THREE.MeshPhongMaterial).flatShading
      : undefined;

    const color = config.color ?? existingColor ?? 0xffffff;
    const opacity = config.opacity ?? existingOpacity ?? 1;
    const transparent = config.transparent ?? existingMat?.transparent ?? (opacity < 1);
    const side = config.side === 'double' ? THREE.DoubleSide
      : config.side === 'back' ? THREE.BackSide
      : config.side === 'front' ? THREE.FrontSide
      : existingSide ?? THREE.FrontSide;

    if (config.wireframe)
    {
      return new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        opacity,
        transparent,
        side,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
    }

    return new THREE.MeshPhongMaterial({
      color,
      opacity,
      transparent,
      side,
      depthTest: config.depthTest ?? true,
      depthWrite: !transparent,
      flatShading: config.flatShading ?? existingFlatShading ?? false,
      shininess: 10,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }

  private _applyLightConfig(
    light: THREE.Light,
    cfg: { enabled: boolean; color?: number; intensity?: number; castShadow?: boolean } | undefined,
  )
  {
    if (!cfg) return;
    light.visible = cfg.enabled;
    if (cfg.color !== undefined) light.color.setHex(cfg.color);
    if (cfg.intensity !== undefined) light.intensity = cfg.intensity;
    if (cfg.castShadow !== undefined && 'castShadow' in light)
    {
      (light as THREE.SpotLight).castShadow = cfg.castShadow;
    }
  }

  // ── 8b. Dimension → param updates ──

  /** Forwarded from <viewer-labels-overlay> when the user edits a bound
   *  dimension label. We coerce to the parameter's declared type, validate
   *  against its JSON schema, and only call updateParam() on success — silent
   *  drops on invalid input per the design (mid-typing values can fail
   *  min/multipleOf, that's fine). */
  private _onDimParamChange = (e: Event) =>
  {
    const detail = (e as CustomEvent<DimensionParamChangeDetail>).detail;
    if (!detail?.param) return;

    const param = scriptParams.get().find(p => p.name === detail.param);
    if (!param)
    {
      console.warn(`Dimension bound to unknown param "${detail.param}"`);
      return;
    }

    const coerced = this._coerceParamValue(param, detail.value);
    if (coerced === undefined) return;
    if (!param.validateValue(coerced)) return; // silent — wait for the user to type more

    updateParam(detail.param, { value: coerced });
  };

  /** Coerce the raw input string to the parameter's value type.
   *  Returns undefined when the string can't be interpreted as the target type
   *  (e.g. letters for a number) — the caller treats that as "drop silently". */
  private _coerceParamValue(param: { schema: { type?: string } }, raw: string): unknown
  {
    const t = param.schema?.type;
    if (t === 'number')
    {
      const trimmed = raw.trim();
      if (trimmed === '' || trimmed === '-' || trimmed === '.') return undefined;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : undefined;
    }
    if (t === 'boolean')
    {
      const s = raw.trim().toLowerCase();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0') return false;
      return undefined;
    }
    return raw;
  }

  // ── 9. Scene tree ──

  // Raw geometry node types that are implementation details — never shown as tree nodes.
  // They may be children of a named container; their material is surfaced on the container.
  private static readonly _GEO_TYPES = new Set([
    'Mesh', 'LineSegments', 'LineSegments2', 'Line', 'Line2', 'Points',
  ]);

  // ── 10. Model loading ──

  private async _loadGLTFString(data: string | ArrayBuffer)
  {
    const shouldFrameCamera = VIEWER_AUTO_FRAME_ON_FIRST_LOAD && !this._currentModel && !this._hasFramedCamera;
    this._disposeModel();
    const gltf = await new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>(
      (resolve, reject) =>
      {
        this._gltfLoader.parse(data, '', resolve, reject);
      },
    );
    this._applyGLTF(gltf, shouldFrameCamera);
  }

  private async _applyGLTF(
    gltf: import('three/examples/jsm/loaders/GLTFLoader.js').GLTF,
    shouldFrameCamera = false,
  )
  {
    const model = gltf.scene;

    // Enable shadow casting / receiving on every mesh; polygon offset pushes
    // surfaces back so coplanar edge lines never z-fight with them.
    model.traverse((n) =>
    {
      if ((n as THREE.Mesh).isMesh)
      {
        n.castShadow = true;
        n.receiveShadow = true;
        const mats = Array.isArray((n as THREE.Mesh).material)
          ? (n as THREE.Mesh).material as THREE.Material[]
          : [(n as THREE.Mesh).material as THREE.Material];
        mats.forEach((m) =>
        {
          m.polygonOffset = true;
          m.polygonOffsetFactor = 1;
          m.polygonOffsetUnits = 1;
        });
      }
    });

    this._scene.add(model);
    this._currentModel = model;

    // Resize the grid to match the now-known model scale (first model load).
    this._updateGrid();

    // Aim spotlight at model center
    const mc = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    this._spotlight.target.position.copy(mc);

    this._updateCameraRangesForObject(model);

    if (shouldFrameCamera && !this._hasFramedCamera)
    {
      this._frameCamera(model);
      this._hasFramedCamera = true;
    }

    // Store animations for user selection — don't auto-play
    if (gltf.animations.length)
    {
      this._animationClips = gltf.animations;
      this._activeAnimationName = null;
      this._mixer = new THREE.AnimationMixer(model);
    }
    else
    {
      this._animationClips = [];
      this._activeAnimationName = null;
    }

    // Render CAD hard edges from custom GLTF extensions
    await applyEdgeExtensions(gltf, model);

    // Render annotations: prefer the live execution result; fall back to GLB
    // extras for standalone .glb loads. Dimensions become 3D arrows + HTML
    // overlay value text; labels become HTML overlay elements.
    // Arrow geometry scales with the viewer's last-known scene radius so
    // arrows stay legible across very different model sizes.
    const anns = executionResult.get()?.state?.annotations as any[] | undefined;
    const r = this._lastSceneRadius ?? VIEWER_GRID_FALLBACK_SCENE_RADIUS;
    const arrowScale = r / VIEWER_DIMENSION_REFERENCE_SCENE_RADIUS;
    const { htmlLabels } = await applyAnnotations(gltf, model, anns, arrowScale);
    this._htmlLabels = htmlLabels;
    const overlay = this.renderRoot.querySelector('viewer-labels-overlay') as ViewerLabelsOverlay | null;
    if (overlay)
    {
      // dimension value text background = viewer background (kept in sync)
      const bgHex = '#' + VIEWER_BACKGROUND_COLOR.toString(16).padStart(6, '0');
      overlay.style.setProperty('--ay-dim-bg', bgHex);

      overlay.labels = htmlLabels.map((l): OverlayLabel => ({
        id: l.id,
        text: l.text,
        variant: l.variant,
        class: l.class,
        line: l.line,
        offset: l.offset,
        angle: l.angle,
        circle: l.circle,
        param: l.param,
        interactive: l.interactive,
        rawValue: l.rawValue,
      }));
    }
    this._dirty = true; // ensure a frame so labels appear/position

    // Ensure LineMaterial resolution is set for pixel-accurate line width
    this._resize();

    // Build path → Three.js object map (mirrors the runner-side path rules).
    // Skip the gltf.scene wrapper Group; start from the GLTFBuilder content root
    // and label it 'Scene' so paths line up with the runner's emission.
    const contentRoot = model.children.find(c => !c.userData.isViewerHelper) ?? model;
    this._buildPathMap(contentRoot, this._pendingScenegraph);

    // Re-apply current view style to newly loaded geometry. This also calls
    // _applyScenegraphVisibility against the latest scenegraph signal so any
    // user-toggled or runner-declared hidden nodes are hidden from the start.
    this._applyViewStyle(this._activeStyleId);
  }

  private _loadGlbOutput(entry: ScriptOutputData)
  {
    const raw = entry.output;

    if (raw instanceof Uint8Array)
    {
      this._loadGLTFString(raw.buffer as ArrayBuffer);
    }
    else if (raw instanceof ArrayBuffer)
    {
      this._loadGLTFString(raw);
    }
    else if (typeof raw === 'object' && raw !== null && 'data' in raw)
    {
      const wrapper = raw as { encoding?: string; data: ArrayBuffer | string };

      if (wrapper.encoding === 'base64' && typeof wrapper.data === 'string')
      {
        const binary = atob(wrapper.data);
        const buf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
        this._loadGLTFString(buf.buffer);
      }
      else
      {
        this._loadGLTFString(wrapper.data as string | ArrayBuffer);
      }
    }
    else if (typeof raw === 'string')
    {
      this._loadGLTFString(raw);
    }
    else
    {
      console.error('Unsupported GLB output format:', raw);
    }
  }

  private _disposeModel()
  {
    if (!this._currentModel) return;

    // The path → object map is rebuilt on the next GLB load. We don't clear
    // the scenegraph signal here — `setExecutionResult` already reconciled it
    // before this dispose runs.
    this._pathToObject.clear();

    // Restore style overrides first so we dispose originals (not override mats) below
    this._restoreStyleOverrides();
    this._userHiddenObjects = [];

    this._scene.remove(this._currentModel);
    this._currentModel.traverse((n) =>
    {
      const obj = n as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material)
      {
        const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => mat.dispose());
      }
    });
    // Clear HTML overlay labels (dimension text + shape labels)
    this._htmlLabels = [];
    const overlay = this.renderRoot.querySelector('viewer-labels-overlay') as ViewerLabelsOverlay | null;
    if (overlay) overlay.labels = [];

    this._currentModel = undefined;
    this._mixer = undefined;
    this._animationClips = [];
    this._activeAnimationName = null;
  }

  private _frameCamera(obj: THREE.Object3D)
  {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const activeCamera = this._isOrtho ? (this._orthoCamera ?? this._camera) : this._camera;
    const currentViewVector = activeCamera.position.clone().sub(this._controls.target);
    const viewDirection = currentViewVector.lengthSq() > 0
      ? currentViewVector.normalize()
      : new THREE.Vector3(1, 1, 1).normalize();

    const verticalFov = THREE.MathUtils.degToRad(this._camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this._camera.aspect);
    const limitingHalfFov = Math.max(Math.min(verticalFov, horizontalFov) / 2, THREE.MathUtils.degToRad(1));
    const dist = (sphere.radius / Math.sin(limitingHalfFov)) * 1.1;

    this._controls.target.copy(center);
    this._camera.position.copy(center.clone().add(viewDirection.multiplyScalar(dist)));
    this._updateCameraRangesForObject(obj, dist);
    this._controls.update();
    if (this._isOrtho)
    {
      this._buildOrthoFromPersp();
      this._controls.object = this._orthoCamera!;
      this._controls.update();
    }
  }

  private _resize()
  {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._orthoCamera)
    {
      const frustumH = this._orthoCamera.top - this._orthoCamera.bottom;
      const aspect = w / h;
      this._orthoCamera.left   = -(frustumH * aspect) / 2;
      this._orthoCamera.right  =  (frustumH * aspect) / 2;
      this._orthoCamera.updateProjectionMatrix();
    }
    this._renderer.setSize(w, h, false);
    // Keep pixel-accurate line width for LineMaterial edge overlays
    this._currentModel?.traverse((n) =>
    {
      const mat = (n as any).material; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (mat?.isLineMaterial)
      {
        (mat as import('three/examples/jsm/lines/LineMaterial.js').LineMaterial)
          .resolution.set(w, h);
      }
    });
    this._dirty = true;
  }

  private _loop = () =>
  {
    this._frameId = requestAnimationFrame(this._loop);
    const dt = this._clock.getDelta();

    if (this._mixer)
    {
      this._mixer.update(dt);
      this._dirty = true;
    }

    // Camera axis-snap tween
    if (this._cameraTween)
    {
      const tw = this._cameraTween;
      tw.t = Math.min(tw.t + dt / tw.duration, 1);
      // smooth-step ease-out
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      this._camera.position.lerpVectors(tw.from, tw.to, k);
      this._camera.up.lerp(tw.upTarget, k);
      this._controls.update();
      if (this._isOrtho) this._buildOrthoFromPersp();
      this._dirty = true;
      if (tw.t >= 1)
      {
        this._camera.position.copy(tw.to);
        this._camera.up.copy(tw.upTarget);
        this._controls.update();
        if (this._isOrtho) this._buildOrthoFromPersp();
        this._cameraTween = undefined;
      }
    }

    if (this._controls.update()) this._dirty = true;

    if (this._dirty)
    {
      this._renderer.render(this._scene, this._isOrtho ? this._orthoCamera! : this._camera);

      // Project HTML overlay labels to screen
      if (this._htmlLabels.length) this._updateLabelOverlay();

      this._dirty = false;
    }
  };

  /** Project each HTML label's world anchor to screen px and push to the overlay */
  private _updateLabelOverlay()
  {
    const overlay = this.renderRoot.querySelector('viewer-labels-overlay') as ViewerLabelsOverlay | null;
    if (!overlay || !this._currentModel) return;

    const cam = this._isOrtho ? this._orthoCamera! : this._camera;
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;

    const positions: Record<string, OverlayLabelPos> = {};
    for (const l of this._htmlLabels)
    {
      // anchor is in modelGroup-local coords → world → NDC → screen px
      this._projV.copy(l.anchorLocal).applyMatrix4(this._currentModel.matrixWorld).project(cam);
      const visible = this._projV.z < 1 &&
        this._projV.x >= -1 && this._projV.x <= 1 &&
        this._projV.y >= -1 && this._projV.y <= 1;
      positions[l.id] = {
        x: (this._projV.x * 0.5 + 0.5) * w,
        y: (-this._projV.y * 0.5 + 0.5) * h,
        visible,
      };
    }
    overlay.setPositions(positions);
  }

  // ── 10. Styles ──
  static override styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none; /* prevent browser from capturing scroll/gesture events away from OrbitControls */
    }

    viewer-menu {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'model-viewer': ModelViewer;
  }
}
