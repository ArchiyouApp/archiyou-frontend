import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { executionResult, hiddenNodes, setSceneTree, clearSceneState } from '../../state/workspace.js';
import type { ScriptOutputData } from '../../../devlibs/archiyou-core-next/src/execution/types.js';
import type { SceneNodeData, SceneMaterialData } from '../../state/workspace.js';
import { applyEdgeExtensions } from './gltf-edge-extensions.js';
import { applyAnnotations } from './gltf-annotations.js';
import type { HtmlLabelDef } from './gltf-annotations.js';
import './viewer-labels-overlay.js';
import type { ViewerLabelsOverlay, OverlayLabel, OverlayLabelPos } from './viewer-labels-overlay.js';
import { VIEWER_AUTO_FRAME_ON_FIRST_LOAD, VIEWER_BACKGROUND_COLOR,
  VIEWER_SCENE_TO_GRID_SIZE, VIEWER_GRID_CELLS_PER_SCENE, VIEWER_GRID_FALLBACK_SCENE_RADIUS,
  VIEWER_GIZMO_AXIS_LENGTH, VIEWER_GIZMO_SCENE_FRACTION, VIEWER_GIZMO_COLOR_X, VIEWER_GIZMO_COLOR_Y,
  VIEWER_GIZMO_COLOR_Z, VIEWER_GIZMO_COLOR_ORIGIN, VIEWER_GIZMO_LABEL_SIZE } from '../../settings.js';
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
    this._pendingHiddenNodes = hiddenNodes.get();

    return html`
      <canvas></canvas>
      <viewer-labels-overlay></viewer-labels-overlay>
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

    // Re-apply full view style when user toggles node visibility, so that
    // style-level hiding and user-level hiding are composed correctly.
    if (this._pendingHiddenNodes !== this._lastAppliedHiddenNodes && this._renderer)
    {
      this._lastAppliedHiddenNodes = this._pendingHiddenNodes;
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
  private _gridSizedFromModel = false; // false while the grid is still the fallback-sized one
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

  // Node visibility (driven by hiddenNodes signal)
  private _pendingHiddenNodes: ReadonlySet<string> = new Set();
  private _lastAppliedHiddenNodes?: ReadonlySet<string>;

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
   * Build the GridHelper from the current model bounding box on first load,
   * then keep the same geometry for the session so the grid doesn't jump.
   * Only the colour is allowed to change (driven by the active view style).
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

    // ── Geometry: build on first call and re-size once a real model arrives ──
    // The first call may happen before any model loads — we size to a
    // DEFAULT_SCENE_RADIUS fallback then. When the model later shows up
    // (`_gridSizedFromModel` is still false but `_currentModel` is now set)
    // we rebuild so cell size matches the actual scene scale.
    const needsBuild = !this._appliedGridSize
                       || (!this._gridSizedFromModel && !!this._currentModel);
    if (needsBuild)
    {
      let sceneRadius = VIEWER_GRID_FALLBACK_SCENE_RADIUS;
      let sizedFromModel = false;
      if (this._currentModel)
      {
        const box = new THREE.Box3().setFromObject(this._currentModel);
        if (!box.isEmpty())
        {
          const sz = box.getSize(new THREE.Vector3());
          sceneRadius = Math.max(Math.max(sz.x, sz.z) * 0.5, 0.5);
          sizedFromModel = true;
        }
      }

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
      this._gridSizedFromModel      = sizedFromModel;

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
    // Three.js Y (up) = CAD Z (up);  Three.js Z (depth) = CAD Y
    const axes: Array<{ axis: 'x' | 'y' | 'z'; label: string; dir: THREE.Vector3; color: number }> = [
      { axis: 'x', label: 'X', dir: new THREE.Vector3(1, 0, 0), color: VIEWER_GIZMO_COLOR_X },
      { axis: 'y', label: 'Z', dir: new THREE.Vector3(0, 1, 0), color: VIEWER_GIZMO_COLOR_Z },
      { axis: 'z', label: 'Y', dir: new THREE.Vector3(0, 0, 1), color: VIEWER_GIZMO_COLOR_Y },
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
      // orient cone along the axis
      if (axis === 'x') cone.rotation.z = -Math.PI / 2;
      else if (axis === 'z') cone.rotation.x = Math.PI / 2;
      cone.renderOrder = 999;
      cone.userData = { isViewerHelper: true, isGizmoHandle: true, axis, negative: false };
      this._gizmoGroup.add(cone);

      // negative arrowhead (clickable handle)
      const coneNegGeo = new THREE.ConeGeometry(coneR, coneH, 8);
      const coneNeg = new THREE.Mesh(coneNegGeo, coneMat.clone());
      coneNeg.position.copy(dir.clone().multiplyScalar(-(L - coneH / 2)));
      if (axis === 'x') coneNeg.rotation.z = Math.PI / 2;
      else if (axis === 'z') coneNeg.rotation.x = -Math.PI / 2;
      else coneNeg.rotation.z = Math.PI; // -Y
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
    else dir.set(0, 0, negative ? -1 : 1);

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
    this._applyNodeVisibility(this._pendingHiddenNodes);

    this._dirty = true;
  }

  private _applyNodeVisibility(hidden: ReadonlySet<string>)
  {
    // Restore previously user-hidden objects before re-applying the new set
    for (const obj of this._userHiddenObjects) obj.visible = true;
    this._userHiddenObjects = [];

    if (!this._currentModel) return;
    this._currentModel.traverse((node) =>
    {
      if (node.userData.isViewerHelper) return;
      if (hidden.has(node.uuid))
      {
        node.visible = false;
        this._userHiddenObjects.push(node);
      }
    });
    this._dirty = true;
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

  // ── 9. Scene tree ──

  // Raw geometry node types that are implementation details — never shown as tree nodes.
  // They may be children of a named container; their material is surfaced on the container.
  private static readonly _GEO_TYPES = new Set([
    'Mesh', 'LineSegments', 'LineSegments2', 'Line', 'Line2', 'Points',
  ]);

  private _buildSceneTree(obj: THREE.Object3D): SceneNodeData
  {
    const geoTypes = ModelViewer._GEO_TYPES;

    // Bubble material up from the first geometry child when the container has none
    const ownMaterial = this._extractMaterial(obj);
    let material = ownMaterial
      ?? this._extractMaterial(
        obj.children.find(c => geoTypes.has(c.type)) ?? obj,
      );

    const semanticChildren = obj.children.filter(
      c => !c.userData.isViewerHelper && !geoTypes.has(c.type),
    );

    // Infer semantic type from direct geometry children so the scene-explorer
    // can show the correct icon (e.g. 'Mesh' instead of 'Object3D').
    const geoChild = obj.children.find(c => !c.userData.isViewerHelper && geoTypes.has(c.type));
    const semanticType = geoChild?.type ?? obj.type;

    return {
      uuid: obj.uuid,
      name: obj.name || obj.type,
      type: semanticType,
      visible: obj.visible,
      material,
      children: semanticChildren.map(c => this._buildSceneTree(c)),
    };
  }

  private _extractMaterial(obj: THREE.Object3D): SceneMaterialData | undefined
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (obj as any).material;
    if (!raw) return undefined;
    const m: THREE.Material = Array.isArray(raw) ? raw[0] : raw;
    if (!m) return undefined;

    const result: SceneMaterialData = { opacity: m.opacity, transparent: m.transparent };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = (m as any).color;
    if (col instanceof THREE.Color) result.color = '#' + col.getHexString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('wireframe' in m) result.wireframe = (m as any).wireframe as boolean;

    return result;
  }

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

    // Render annotations from GLB root extras: dimension lines as 3D arrows
    // (geometry) + HTML overlay value text; labels as HTML overlay elements
    // (optionally with a CSS leader line/arrow). Projected each frame.
    const { htmlLabels } = await applyAnnotations(gltf, model);
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
      }));
    }
    this._dirty = true; // ensure a frame so labels appear/position

    // Ensure LineMaterial resolution is set for pixel-accurate line width
    this._resize();

    // Pre-populate hiddenNodes with any nodes the exporter marked as default-hidden
    // so the scene explorer shows them with eye-slash and they start invisible.
    const initiallyHidden = new Set<string>();
    model.traverse((n) => { if (n.userData.defaultVisible === false) initiallyHidden.add(n.uuid); });
    if (initiallyHidden.size > 0)
    {
      hiddenNodes.set(initiallyHidden);
      this._pendingHiddenNodes = initiallyHidden;
      this._lastAppliedHiddenNodes = initiallyHidden;
    }

    // Publish scene tree for the scene explorer (after edges are attached).
    // Skip the Three.js gltf.scene Group wrapper; start from the GLTFBuilder
    // 'root' node directly and label it 'Scene'.
    const contentRoot = model.children.find(c => !c.userData.isViewerHelper) ?? model;
    const treeRoot = this._buildSceneTree(contentRoot);
    treeRoot.name = 'Scene';
    setSceneTree(treeRoot);

    // Re-apply current view style to newly loaded geometry
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

    // Clear scene explorer state; new UUIDs after reload won't match old hidden set
    clearSceneState();

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
