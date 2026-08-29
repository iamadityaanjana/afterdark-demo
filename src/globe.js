import * as THREE from "three";
import {
  noiseVert,
  noiseFrag,
  coronaFrag,
  blendFrag,
} from "./shaders.js";

function hexToColor(hex) {
  return new THREE.Color(hex);
}

function latLngToVec3(lat, lng, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function wrapDeg180(v) {
  return ((((v + 180) % 360) + 360) % 360) - 180;
}

function wrapDeg360(v) {
  return ((v % 360) + 360) % 360;
}

export class AfterDarkGlobe {
  constructor(root, { cities, onMarkerClick } = {}) {
    this.root = root;
    this.cities = cities || [];
    this.onMarkerClick = onMarkerClick || (() => {});
    this.canvasWrap = root.querySelector(".globe__canvas");
    this.markersWrap = root.querySelector(".globe__markers");
    this.markerRefs = {};
    this.cityMarkers = [];
    this.clock = new THREE.Clock();
    this.mouse01 = new THREE.Vector2(-1, -1);
    this.mouseDir = new THREE.Vector2(0, 0);
    this.mouseSpeed = 0;
    this._mousePrev = new THREE.Vector2(-1, -1);
    this.hitN = new THREE.Vector3(0, 0, 1);
    this.hitValid = 0;
    this.pointerNDC = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hoveredTag = null;
    this.pauseRotate = false;
    this.dragging = false;
    this.spinVel = new THREE.Vector2();
    this.params = {
      globeRadius: 1.56,
      cameraOrthoSize: 1.95,
      autoRotateEnabled: true,
      autoRotateSpeed: 6,
      hoverExpandIncr: 0.2,
      hoverDisplIncr: 0.0005,
      pulseEnabled: false,
      pulseStrength: 0.15,
      pulseRadius: 0.03,
      pulseFrequency: 1,
      displFactor: 0.002,
      expandFactor: 1.5,
      noiseSeed: 1235,
      noiseScale: 5,
      noiseSpeed: 0.03,
      noiseEvolveSpeed: 1.3,
      mouseInteract: true,
      mouseStrength: 0.95,
      mouseRadius: 0.12,
      trailAmount: 0.28,
      globeCover: 0.8,
      scaleFactor: 0.22,
      mixFactor: 0.1,
      levelsBlack: 0,
      levelsWhite: 1,
      gamma: 1,
      sphereMaskBlur: 8,
      mapStrength: 1.2,
      mapBlur: 1.1,
      sphereInvert: 1,
      sphereAdd: 1,
      innerNoiseAmount: 0.7,
      innerNoiseBlur: 8,
      innerNoiseBlack: 0,
      innerNoiseWhite: 0.8,
      innerNoiseGamma: 1.6,
      landBoost: 1.0,
      color1: "#f11111",
      color2: "#e453e4",
      background: "#000000",
      objectRotationX: 0,
      objectRotationY: -50,
      objectRotationZ: 0,
    };
    this.hoverMode = 0;
    this.debugView = 0;
    this.debugViews = ["Final", "Noise", "Globe Map", "Corona", "Sphere Mask"];
    this.rtSize = 512;
    this.shaderSize = 512;
    this.frameCount = 0;
    this._onResize = () => this.resize();
    this.init();
  }

  setHoverMode(id) {
    this.hoverMode = Math.max(0, Math.min(9, Number(id) || 0));
    if (this.noiseMaterial?.uniforms?.uHoverMode) {
      this.noiseMaterial.uniforms.uHoverMode.value = this.hoverMode;
    }
    if (this.coronaMaterial?.uniforms?.uHoverMode) {
      this.coronaMaterial.uniforms.uHoverMode.value = this.hoverMode;
    }
  }

  cycleView() {
    this.debugView = (this.debugView + 1) % this.debugViews.length;
    if (this.blendMaterial?.uniforms?.uDebugView) {
      this.blendMaterial.uniforms.uDebugView.value = this.debugView;
    }
    return this.debugViews[this.debugView];
  }

  applyParams() {
    const p = this.params;
    const noise = this.noiseMaterial?.uniforms;
    const corona = this.coronaMaterial?.uniforms;
    const blend = this.blendMaterial?.uniforms;
    if (noise) {
      noise.noiseSeed.value = p.noiseSeed;
      noise.noiseScale.value = p.noiseScale;
      noise.noiseSpeed.value = p.noiseSpeed;
    }
    if (corona) {
      corona.uDisplaceFactor.value = p.displFactor;
      corona.uExpandFactor.value = p.expandFactor;
    }
    if (blend) {
      blend.uColor1.value.set(p.color1);
      blend.uColor2.value.set(p.color2);
    }
  }

  get markerDistance() {
    return this.params.globeRadius;
  }

  getOrthoSize() {
    return this.params.globeRadius / this.params.globeCover;
  }

  async init() {
    this.params.cameraOrthoSize = this.getOrthoSize();
    const { width, height } = this.measure();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 1);
    this.canvasWrap.appendChild(this.renderer.domElement);

    const aspect = width / height;
    const ortho = this.params.cameraOrthoSize;
    this.camera = new THREE.OrthographicCamera(
      -ortho * aspect,
      ortho * aspect,
      ortho,
      -ortho,
      0.1,
      2000
    );
    this.camera.position.set(0, 0, 4);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.buildTrail();
    this.buildSphereMasks();
    this.buildMaterials();
    await this.buildGlobeMap();
    this.buildPasses();
    this.buildScreen();
    if (this.markersWrap) this.buildMarkers();
    this.bindPointer();
    this.bindDrag();
    window.addEventListener("resize", this._onResize);
    this.animate();
  }

  measure() {
    return {
      width: this.canvasWrap.clientWidth || window.innerWidth,
      height: this.canvasWrap.clientHeight || window.innerHeight,
    };
  }

  buildTrail() {
    const size = this.shaderSize;
    this.trailCanvas = document.createElement("canvas");
    this.trailCanvas.width = size;
    this.trailCanvas.height = size;
    this.trailCtx = this.trailCanvas.getContext("2d");
    this.trailCtx.fillStyle = "#000";
    this.trailCtx.fillRect(0, 0, size, size);
    this.trailTexture = new THREE.CanvasTexture(this.trailCanvas);
    this.trailTexture.minFilter = THREE.LinearFilter;
    this.trailTexture.magFilter = THREE.LinearFilter;
    this.trailPrev = null;
  }

  buildSphereMasks() {
    const size = 1024;
    const radius = this.params.globeRadius;
    const halfH = this.params.cameraOrthoSize;
    const px = Math.min(0.5, Math.max(0, 0.5 * (radius / halfH))) * size;

    const sharp = document.createElement("canvas");
    sharp.width = size;
    sharp.height = size;
    const sctx = sharp.getContext("2d");
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, size, size);
    sctx.fillStyle = "#fff";
    sctx.beginPath();
    sctx.arc(size * 0.5, size * 0.5, px, 0, Math.PI * 2);
    sctx.fill();

    const blur = document.createElement("canvas");
    blur.width = size;
    blur.height = size;
    const bctx = blur.getContext("2d");
    bctx.fillStyle = "#000";
    bctx.fillRect(0, 0, size, size);
    bctx.filter = `blur(${this.params.sphereMaskBlur}px)`;
    bctx.drawImage(sharp, 0, 0);

    this.sphereSharp = new THREE.CanvasTexture(sharp);
    this.sphereBlur = new THREE.CanvasTexture(blur);
    this.sphereSharp.minFilter = this.sphereBlur.minFilter = THREE.LinearFilter;
    this.sphereSharp.magFilter = this.sphereBlur.magFilter = THREE.LinearFilter;
  }

  buildMaterials() {
    const res = new THREE.Vector2(this.shaderSize, this.shaderSize);
    this.noiseMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        noiseSeed: { value: this.params.noiseSeed },
        noiseScale: { value: this.params.noiseScale },
        noiseSpeed: { value: this.params.noiseSpeed },
        noiseEvolveSpeed: { value: this.params.noiseEvolveSpeed },
        u_mouse: { value: this.mouse01 },
        u_mouseDir: { value: this.mouseDir },
        u_mouseSpeed: { value: 0 },
        uMouseEnabled: { value: 1 },
        uMouseStrength: { value: this.params.mouseStrength },
        uMouseRadius: { value: this.params.mouseRadius },
        uHoverMode: { value: this.hoverMode },
        uHitN: { value: this.hitN },
        uHitValid: { value: 0 },
        uSphereUvRadius: { value: 0.4 },
        uMouseTrailTex: { value: this.trailTexture },
        uPulseCenter: { value: new THREE.Vector2(-1, -1) },
        uPulseEnabled: { value: 0 },
        uPulseStrength: { value: this.params.pulseStrength },
        uPulseRadius: { value: this.params.pulseRadius },
        uPulseFrequency: { value: this.params.pulseFrequency },
      },
      vertexShader: noiseVert,
      fragmentShader: noiseFrag,
    });

    this.coronaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        iBuffer: { value: null },
        iNoise: { value: null },
        iGlobeSphere: { value: this.sphereBlur },
        uResolution: { value: res.clone() },
        uFrameCount: { value: 0 },
        uDisplaceFactor: { value: this.params.displFactor },
        uMixFactor: { value: this.params.mixFactor },
        uScaleFactor: { value: this.params.scaleFactor },
        uExpandFactor: { value: this.params.expandFactor },
        uUvScale: { value: 1 },
        uTime: { value: 0 },
        u_mouse: { value: this.mouse01 },
        u_mouseDir: { value: this.mouseDir },
        u_mouseSpeed: { value: 0 },
        uMouseEnabled: { value: 1 },
        uMouseStrength: { value: this.params.mouseStrength },
        uMouseRadius: { value: this.params.mouseRadius },
        uHoverMode: { value: this.hoverMode },
        uHitN: { value: this.hitN },
        uHitValid: { value: 0 },
        uSphereUvRadius: { value: 0.4 },
        uMouseTrailTex: { value: this.trailTexture },
      },
      vertexShader: noiseVert,
      fragmentShader: coronaFrag,
    });

    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: res.clone() },
        uUvScale: { value: 1 },
        tDiffuse: { value: null },
        tDisplacementTexture: { value: null },
        tGlobeSphere: { value: this.sphereBlur },
        tGlobeSphereSharp: { value: this.sphereSharp },
        tNoise: { value: null },
        uColor1: { value: hexToColor(this.params.color1) },
        uColor2: { value: hexToColor(this.params.color2) },
        uBackgroundColor: { value: hexToColor(this.params.background) },
        levelsBlack: { value: this.params.levelsBlack },
        levelsWhite: { value: this.params.levelsWhite },
        gamma: { value: this.params.gamma },
        mapStrength: { value: this.params.mapStrength },
        sphereInvert: { value: this.params.sphereInvert },
        sphereAdd: { value: this.params.sphereAdd },
        mapBlur: { value: this.params.mapBlur },
        innerNoiseAmount: { value: this.params.innerNoiseAmount },
        innerNoiseBlur: { value: this.params.innerNoiseBlur },
        innerNoiseBlack: { value: this.params.innerNoiseBlack },
        innerNoiseWhite: { value: this.params.innerNoiseWhite },
        innerNoiseGamma: { value: this.params.innerNoiseGamma },
        landBoost: { value: this.params.landBoost },
        uDebugView: { value: 0 },
      },
      vertexShader: noiseVert,
      fragmentShader: blendFrag,
    });
  }

  async buildGlobeMap() {
    const loader = new THREE.TextureLoader();
    const map = await loader.loadAsync("/textures/world-map.png");
    map.colorSpace = THREE.NoColorSpace;
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;

    this.globeScene = new THREE.Scene();
    const ortho = this.params.cameraOrthoSize;
    this.globeCam = new THREE.OrthographicCamera(-ortho, ortho, ortho, -ortho, 0.1, 1000);
    this.globeCam.position.set(0, 0, 4);
    this.globeCam.lookAt(0, 0, 0);

    const geo = new THREE.SphereGeometry(this.params.globeRadius, 64, 64);
    const mat = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    this.globeSphere = new THREE.Mesh(geo, mat);
    this.globeSphere.rotateY(-Math.PI / 2);
    this.globeScene.add(this.globeSphere);

    this.globeRT = new THREE.WebGLRenderTarget(this.rtSize, this.rtSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  makePass(material) {
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    return { scene, cam };
  }

  buildPasses() {
    this.noisePass = this.makePass(this.noiseMaterial);
    this.noiseRT = new THREE.WebGLRenderTarget(this.shaderSize, this.shaderSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    this.coronaA = new THREE.WebGLRenderTarget(this.shaderSize, this.shaderSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    this.coronaB = new THREE.WebGLRenderTarget(this.shaderSize, this.shaderSize, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    this.coronaPass = this.makePass(this.coronaMaterial);
    this.coronaMaterial.uniforms.iNoise.value = this.noiseRT.texture;
    this.blendMaterial.uniforms.tDiffuse.value = this.globeRT.texture;
    this.blendMaterial.uniforms.tNoise.value = this.noiseRT.texture;
  }

  buildScreen() {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), this.blendMaterial);
    plane.onBeforeRender = () => plane.lookAt(this.camera.position);
    this.scene.add(plane);
    this.screen = plane;
    this.updateScreenScale();
  }

  updateScreenScale() {
    const aspect = this.camera.right / this.camera.top;
    const w = Math.abs(this.camera.right - this.camera.left);
    const h = Math.abs(this.camera.top - this.camera.bottom);
    const size = Math.min(w, h);
    this.screen.scale.set(size / 12, size / 12, 1);
    void aspect;
  }

  buildMarkers() {
    this.markersWrap.innerHTML = "";
    this.markerRefs = {};
    this.cityMarkers = this.cities.map((city) => ({
      city,
      position: latLngToVec3(city.lat, city.lng, this.markerDistance),
    }));
    for (const { city } of this.cityMarkers) {
      const el = document.createElement("div");
      el.className = "city-marker";
      el.dataset.marker = city.tag;
      el.dataset.slug = city.slug;
      el.innerHTML = `
        <button class="city-marker-button" type="button" aria-label="${city.tag}">
          <span class="city-marker-ring" aria-hidden="true">
            <span class="city-marker-ringDot"></span>
          </span>
          <span class="city-marker-label">
            <span class="city-marker-text">${city.tag} <span class="city-marker-textDistance">${city.distanceLabel}</span></span>
          </span>
        </button>
      `;
      el.querySelector("button").addEventListener("click", () => this.onMarkerClick(city));
      el.addEventListener("pointerenter", () => this.setHover(city.tag, el));
      el.addEventListener("pointerleave", () => this.clearHover(el));
      this.markersWrap.appendChild(el);
      this.markerRefs[city.tag] = el;
    }
  }

  setHover(tag, el) {
    this.hoveredTag = tag;
    this.pauseRotate = true;
    this.root.classList.add("is-hovering-marker");
    el.classList.add("is-active");
  }

  clearHover(el) {
    el.classList.remove("is-active");
    this.hoveredTag = null;
    this.root.classList.remove("is-hovering-marker");
    this.pauseRotate = false;
  }

  updateSurfaceHit() {
    this.hitValid = 0;
    if (!this.globeCam || !this.globeSphere || !this.noiseMaterial) return;
    const u = this.mouse01.x;
    const v = this.mouse01.y;
    if (u >= 0 && v >= 0 && u <= 1 && v <= 1) {
      this.pointerNDC.set(u * 2 - 1, -(v * 2 - 1));
      this.raycaster.setFromCamera(this.pointerNDC, this.globeCam);
      const hits = this.raycaster.intersectObject(this.globeSphere);
      if (hits.length) {
        this.hitN.copy(hits[0].point).normalize();
        this.hitValid = 1;
      }
    }
    const radius = 0.5 * (this.params.globeRadius / this.params.cameraOrthoSize);
    this.noiseMaterial.uniforms.uHitValid.value = this.hitValid;
    this.coronaMaterial.uniforms.uHitValid.value = this.hitValid;
    this.noiseMaterial.uniforms.uSphereUvRadius.value = radius;
    this.coronaMaterial.uniforms.uSphereUvRadius.value = radius;
  }

  bindPointer() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const side = Math.min(width, height);
      const u = (e.clientX - rect.left - (width - side) * 0.5) / side;
      const v = (e.clientY - rect.top - (height - side) * 0.5) / side;
      if (this._mousePrev.x >= 0) {
        const dx = u - this._mousePrev.x;
        const dy = v - this._mousePrev.y;
        this.mouseDir.set(dx, dy);
        this.mouseSpeed = Math.min(1, Math.hypot(dx, dy) * 18);
      }
      this._mousePrev.set(u, v);
      this.mouse01.set(u, v);
    });
    canvas.addEventListener("pointerleave", () => {
      this.mouse01.set(-1, -1);
      this._mousePrev.set(-1, -1);
      this.mouseDir.set(0, 0);
      this.mouseSpeed = 0;
    });
  }

  bindDrag() {
    const el = this.renderer.domElement;
    let last = null;
    const onDown = (e) => {
      if (e.target.closest?.(".city-marker-button")) return;
      this.dragging = true;
      last = { x: e.clientX, y: e.clientY };
      this.root.classList.add("is-dragging-globe");
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!this.dragging || !last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      this.params.objectRotationY += dx * 0.18;
      this.params.objectRotationX = wrapDeg180(this.params.objectRotationX + dy * 0.12);
      this.spinVel.set(dy * 2.2, dx * 3.4);
      last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      this.dragging = false;
      last = null;
      el.style.cursor = "grab";
      this.root.classList.remove("is-dragging-globe");
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  updateTrail(dt) {
    const ctx = this.trailCtx;
    const size = this.trailCanvas.width;
    const decay = 1 - Math.exp(-2.4 * Math.max(dt, 1 / 120));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0,0,0,${decay})`;
    ctx.fillRect(0, 0, size, size);
    const { x, y } = this.mouse01;
    if (this.hitValid < 1 || x < 0 || y < 0 || x > 1 || y > 1 || !this.params.mouseInteract) {
      this.trailPrev = null;
      this.trailTexture.needsUpdate = true;
      return;
    }
    const px = x * size;
    const py = y * size;
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + this.mouseSpeed * 0.22})`;
    ctx.lineWidth = Math.max(4, this.params.mouseRadius * size * 0.7);
    ctx.filter = "blur(3px)";
    if (this.trailPrev) {
      ctx.beginPath();
      ctx.moveTo(this.trailPrev.x, this.trailPrev.y);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.filter = "none";
    this.trailPrev = { x: px, y: py };
    this.trailTexture.needsUpdate = true;
  }

  updateMarkers() {
    if (!this.markersWrap || !this.cityMarkers.length) return;
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(this.params.objectRotationX),
      THREE.MathUtils.degToRad(this.params.objectRotationY),
      THREE.MathUtils.degToRad(this.params.objectRotationZ)
    );
    const rot = new THREE.Matrix4().makeRotationFromEuler(euler);
    const camDir = this.camera.position.clone().normalize();
    const w = window.innerWidth;
    const h = this.canvasWrap.clientHeight || window.innerHeight;

    for (const marker of this.cityMarkers) {
      const el = this.markerRefs[marker.city.tag];
      if (!el) continue;
      const n = marker.position.clone().applyMatrix4(rot);
      const dir = n.clone().normalize();
      const world = n.clone();
      if (camDir.angleTo(dir) > Math.PI / 2) {
        const edge = dir.projectOnPlane(camDir).normalize().multiplyScalar(this.markerDistance);
        world.copy(edge);
      }
      const projected = world.project(this.camera);
      const x = projected.x * (w / 2);
      const y = -projected.y * (h / 2);
      el.style.transform = `translate3d(-0.675em, -50%, 0) translateX(${x}px) translateY(${y}px)`;
    }
  }

  pulseUV() {
    if (!this.hoveredTag) return new THREE.Vector2(-1, -1);
    const el = this.markerRefs[this.hoveredTag];
    const ring = el?.querySelector(".city-marker-ring");
    if (!ring) return new THREE.Vector2(-1, -1);
    const r = ring.getBoundingClientRect();
    const c = this.renderer.domElement.getBoundingClientRect();
    const size = Math.max(c.width, c.height);
    const ox = (c.width - size) * 0.5;
    const oy = (c.height - size) * 0.5;
    const x = (r.left + r.width * 0.5 - c.left - ox) / size;
    const y = (r.top + r.height * 0.5 - c.top - oy) / size;
    if (x < 0 || y < 0 || x > 1 || y > 1) return new THREE.Vector2(-1, -1);
    return new THREE.Vector2(x, y);
  }

  animate() {
    this.raf = requestAnimationFrame(() => this.animate());
    const dt = this.clock.getDelta();
    this.frameCount += 1;

    if (this.params.autoRotateEnabled && !this.dragging && !this.pauseRotate) {
      this.params.objectRotationY += this.params.autoRotateSpeed * dt;
    }
    if (!this.dragging) {
      this.params.objectRotationY += this.spinVel.y * dt;
      this.params.objectRotationX = wrapDeg180(this.params.objectRotationX + this.spinVel.x * dt);
      this.spinVel.multiplyScalar(Math.exp(-7.5 * dt));
    }
    this.params.objectRotationY = wrapDeg360(this.params.objectRotationY);

    this.globeSphere.rotation.set(
      THREE.MathUtils.degToRad(this.params.objectRotationX),
      THREE.MathUtils.degToRad(this.params.objectRotationY) - Math.PI / 2,
      THREE.MathUtils.degToRad(this.params.objectRotationZ)
    );
    this.globeSphere.updateMatrixWorld(true);
    this.updateSurfaceHit();
    this.updateTrail(dt);
    this.mouseSpeed *= Math.exp(-3.2 * dt);
    this.mouseDir.multiplyScalar(Math.exp(-4.0 * dt));

    this.noiseMaterial.uniforms.u_mouseSpeed.value = this.mouseSpeed;
    this.coronaMaterial.uniforms.u_mouseSpeed.value = this.mouseSpeed;
    this.coronaMaterial.uniforms.uMouseStrength.value = this.params.mouseStrength;
    this.coronaMaterial.uniforms.uMouseRadius.value = this.params.mouseRadius;
    this.noiseMaterial.uniforms.uMouseStrength.value = this.params.mouseStrength;
    this.noiseMaterial.uniforms.uMouseRadius.value = this.params.mouseRadius;

    const hovering = this.hoveredTag ? 1 : 0;
    this.coronaMaterial.uniforms.uDisplaceFactor.value = Math.max(
      0,
      this.params.displFactor - (hovering ? this.params.hoverDisplIncr : 0)
    );
    this.coronaMaterial.uniforms.uExpandFactor.value = Math.max(
      0,
      this.params.expandFactor - (hovering ? this.params.hoverExpandIncr : 0)
    );
    this.noiseMaterial.uniforms.time.value += dt;
    this.noiseMaterial.uniforms.uPulseCenter.value.copy(this.pulseUV());
    this.coronaMaterial.uniforms.uTime.value += dt;
    this.coronaMaterial.uniforms.uFrameCount.value = this.frameCount;

    this.renderer.setRenderTarget(this.globeRT);
    this.renderer.render(this.globeScene, this.globeCam);

    this.renderer.setRenderTarget(this.noiseRT);
    this.renderer.render(this.noisePass.scene, this.noisePass.cam);

    this.coronaMaterial.uniforms.iBuffer.value = this.coronaA.texture;
    this.renderer.setRenderTarget(this.coronaB);
    this.renderer.render(this.coronaPass.scene, this.coronaPass.cam);
    const tmp = this.coronaA;
    this.coronaA = this.coronaB;
    this.coronaB = tmp;
    this.blendMaterial.uniforms.tDisplacementTexture.value = this.coronaA.texture;

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.updateMarkers();
  }

  resize() {
    const { width, height } = this.measure();
    this.renderer.setSize(width, height);
    const aspect = width / height;
    const ortho = this.params.cameraOrthoSize;
    this.camera.left = -ortho * aspect;
    this.camera.right = ortho * aspect;
    this.camera.top = ortho;
    this.camera.bottom = -ortho;
    this.camera.updateProjectionMatrix();
    this.updateScreenScale();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this._onResize);
    this.renderer?.dispose();
  }
}
