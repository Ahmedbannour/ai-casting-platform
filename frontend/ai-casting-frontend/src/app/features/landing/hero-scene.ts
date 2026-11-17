/**
 * Vitrine · faisceau de projecteur en Three.js : un cône de lumière jaune tombe sur la planche contact
 * et des grains de poussière y dérivent, plus brillants dans la lumière. La souris déplace doucement la caméra.
 * Chargé à la demande (Three.js n'alourdit pas le reste de l'application) ; s'arrête hors de l'écran.
 */
export async function startHeroScene(canvas: HTMLCanvasElement, host: HTMLElement): Promise<() => void> {
  const THREE = await import('three');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  // Faisceau : de l'angle haut-droit vers la planche
  const beam = { origin: new THREE.Vector2(7.5, 6.5), dir: new THREE.Vector2(-0.5, -1).normalize() };
  const uniforms = {
    uTime: { value: 0 }, uPixel: { value: renderer.getPixelRatio() },
    uO: { value: beam.origin }, uD: { value: beam.dir },
    uPaper: { value: new THREE.Color('#EEEEEA') }, uPencil: { value: new THREE.Color('#F2C230') },
  };
  const beamFn = /* glsl */`
    uniform vec2 uO; uniform vec2 uD;
    float beamAt(vec2 p) {
      vec2 q = p - uO; float t = dot(q, uD); float perp = length(q - uD * t);
      float w = 0.35 + max(t, 0.0) * 0.32;
      return smoothstep(w, w * 0.15, perp) * smoothstep(0.0, 1.5, t) * smoothstep(17.0, 8.0, t);
    }`;

  // Poussière
  const N = window.innerWidth < 700 ? 700 : 1500;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = (Math.random() - 0.5) * 16; pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dust = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPixel; attribute float aSeed; varying float vB; varying float vA;
      ${beamFn}
      void main() {
        vec3 p = position;
        p.y = mod(p.y + 8.0 + uTime * (0.08 + aSeed * 0.18), 16.0) - 8.0;
        p.x += sin(uTime * 0.25 + aSeed * 40.0) * 0.5;
        p.z += cos(uTime * 0.2 + aSeed * 25.0) * 0.4;
        vB = beamAt(p.xy);
        vA = (0.12 + vB * 1.1) * (0.55 + 0.45 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 60.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.6 + aSeed * 3.4 + vB * 2.0) * uPixel * (9.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uPaper; uniform vec3 uPencil; varying float vB; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(mix(uPaper, uPencil, vB * 0.75), a);
      }`,
  });
  scene.add(new THREE.Points(geo, dust));

  // Cône de lumière, très léger
  const plane = new THREE.PlaneGeometry(40, 26);
  const cone = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uPencil; uniform float uTime; varying vec2 vP;
      ${beamFn}
      void main() {
        float b = beamAt(vP);
        float flicker = 0.92 + 0.08 * sin(uTime * 7.0) * sin(uTime * 3.1);
        gl_FragColor = vec4(uPencil, b * 0.11 * flicker);
      }`,
  });
  const coneMesh = new THREE.Mesh(plane, cone);
  coneMesh.position.z = -1;
  scene.add(coneMesh);

  // Taille, souris, visibilité
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  const target = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 1.2; target.y = -((e.clientY - r.top) / r.height - 0.5) * 0.8;
  };
  host.addEventListener('pointermove', onMove);
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); });
  io.observe(host);

  let raf = 0, last = performance.now();
  const loop = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame((now) => {
      if (!visible || document.hidden) return;
      uniforms.uTime.value += Math.min((now - last) / 1000, 0.05); last = now;
      camera.position.x += (target.x - camera.position.x) * 0.04;
      camera.position.y += (target.y - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      loop();
    });
  };
  const onVis = () => { last = performance.now(); if (!document.hidden) loop(); };
  document.addEventListener('visibilitychange', onVis);
  loop();

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    host.removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVis);
    geo.dispose(); dust.dispose(); plane.dispose(); cone.dispose(); renderer.dispose();
  };
}
