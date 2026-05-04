import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { workspace } from '../../state/workspace.js';
import type { ScriptOutputData } from '../../../devlibs/archiyou-core-next/src/execution/types.js';
import { applyEdgeExtensions } from './gltf-edge-extensions.js';

/**
 * <model-viewer> — Three.js GLTF viewer with IBL, spotlight shadows, and AgX tone mapping.
 */
@customElement('model-viewer')
export class ModelViewer extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    // Read signal here so SignalWatcher tracks it and re-renders when workspace changes
    this._pendingGlbOutput = workspace.get().editor.result?.outputs
      ?.find(o => o.path.requestedPath === 'default/model/glb');
    return html`<canvas></canvas>`;
  }

  // ── 3. Lifecycle ──
  override firstUpdated()
  {
    const canvas = this.renderRoot.querySelector('canvas')!;
    this._initRenderer(canvas);
    this._initScene();
    this._initLights();
    this._initGround();
    this._initControls(canvas);
    this._initLoaders();
    this._loop();

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this);
  }

  override updated(_changed: Map<string, unknown>)
  {
    const glbOutput = this._pendingGlbOutput;
    console.log('==== GLB Output changed:', glbOutput);
    if (glbOutput && glbOutput !== this._lastGlbOutput && this._renderer)
    {
      this._lastGlbOutput = glbOutput;
      this._loadGlbOutput(glbOutput);
    }
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    cancelAnimationFrame(this._frameId);
    this._resizeObserver?.disconnect();
    this._controls?.dispose();
    this._renderer?.dispose();
  }

  // ── 4. Behaviour & Methods ──
  private _renderer!: THREE.WebGLRenderer;
  private _scene!: THREE.Scene;
  private _camera!: THREE.PerspectiveCamera;
  private _controls!: OrbitControls;
  private _spotlight!: THREE.SpotLight;
  private _gltfLoader!: GLTFLoader;
  private _resizeObserver?: ResizeObserver;
  private _frameId = 0;
  private _mixer?: THREE.AnimationMixer;
  private _clock = new THREE.Clock();
  private _dirty = true;
  private _currentModel?: THREE.Object3D;
  private _lastGlbOutput?: ScriptOutputData;
  private _pendingGlbOutput?: ScriptOutputData;

  private _initRenderer(canvas: HTMLCanvasElement)
  {
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    r.setClearColor(0xf1f5f9);
    this._renderer = r;
  }

  private _initScene()
  {
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0xf1f5f9);

    // Image-based lighting from a procedural studio-style room environment
    const pmrem = new THREE.PMREMGenerator(this._renderer);
    const envScene = new RoomEnvironment();
    this._scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    pmrem.dispose();

    this._camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this._camera.position.set(3, 2, 3);
  }

  private _initLights()
  {
    // Soft fill that supplements IBL
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.3));

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
    this._controls = c;
  }

  private _initLoaders()
  {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this._gltfLoader = new GLTFLoader();
    this._gltfLoader.setDRACOLoader(draco);
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                          */
  /* ------------------------------------------------------------------ */

  private async _loadGLTFString(data: string | ArrayBuffer)
  {
    this._disposeModel();
    const gltf = await new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>(
      (resolve, reject) =>
      {
        this._gltfLoader.parse(data, '', resolve, reject);
      },
    );
    this._applyGLTF(gltf);
  }

  private async _applyGLTF(gltf: import('three/examples/jsm/loaders/GLTFLoader.js').GLTF)
  {
    const model = gltf.scene;

    // Enable shadow casting / receiving on every mesh
    model.traverse((n) =>
    {
      if ((n as THREE.Mesh).isMesh)
      {
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });

    // Normalize: scale to ~2 units, center horizontally, sit on ground
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 2 / Math.max(size.x, size.y, size.z);

    model.scale.setScalar(scale);
    const scaled = new THREE.Box3().setFromObject(model);
    const sCenter = scaled.getCenter(new THREE.Vector3());
    model.position.x -= sCenter.x;
    model.position.z -= sCenter.z;
    model.position.y -= scaled.min.y;

    this._scene.add(model);
    this._currentModel = model;

    // Aim spotlight at model center
    const mc = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    this._spotlight.target.position.copy(mc);

    this._frameCamera(model);

    // Play animations if present
    if (gltf.animations.length)
    {
      this._mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach(clip => this._mixer!.clipAction(clip).play());
    }

    // Render CAD hard edges from custom GLTF extensions
    await applyEdgeExtensions(gltf, model);

    // Ensure LineMaterial resolution is set for pixel-accurate line width
    this._resize();
    this._dirty = true;
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                          */
  /* ------------------------------------------------------------------ */

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
    else {
      console.error('Unsupported GLB output format:', raw);
    }
  }

  private _disposeModel()
  {
    if (!this._currentModel) return;
    this._scene.remove(this._currentModel);
    this._currentModel.traverse((n) =>
    {
      const obj = n as any;
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material)
      {
        const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => mat.dispose());
      }
    });
    this._currentModel = undefined;
    this._mixer = undefined;
  }

  private _frameCamera(obj: THREE.Object3D)
  {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = (maxDim / (2 * Math.tan((this._camera.fov * Math.PI) / 360))) * 1.5;

    this._controls.target.copy(center);
    this._camera.position.set(
      center.x + dist * 0.7,
      center.y + dist * 0.5,
      center.z + dist * 0.7,
    );
    this._camera.near = dist * 0.01;
    this._camera.far = dist * 20;
    this._camera.updateProjectionMatrix();
    this._controls.update();
  }

  private _resize()
  {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h, false);
    // Keep pixel-accurate line width for LineMaterial edge overlays
    this._currentModel?.traverse((n) =>
    {
      const mat = (n as any).material;
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

    if (this._controls.update()) this._dirty = true;

    if (this._dirty)
    {
      this._renderer.render(this._scene, this._camera);
      this._dirty = false;
    }
  };

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
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
