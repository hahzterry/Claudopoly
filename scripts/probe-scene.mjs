import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForTimeout(3500);
const out = await p.evaluate(() => {
  const r = window.__scene;
  if (!r) return { error: 'window.__scene not exposed' };
  const { renderer, scene } = r;
  const lights = [], shadowCasters = [], receivers = [], mats = new Set();
  scene.traverse(o => {
    if (o.isLight) lights.push({ type: o.type, intensity: o.intensity,
      colour: '#' + o.color.getHexString(), castShadow: !!o.castShadow,
      pos: o.position ? o.position.toArray().map(n=>+n.toFixed(1)) : null });
    if (o.isMesh) {
      if (o.castShadow) shadowCasters.push(o.name || o.geometry.type);
      if (o.receiveShadow) receivers.push(o.name || o.geometry.type);
      const m = Array.isArray(o.material) ? o.material : [o.material];
      m.forEach(x => x && mats.add(x.type + (x.vertexColors ? '+vc' : '')));
    }
  });
  return {
    shadowMapEnabled: renderer.shadowMap.enabled,
    shadowMapType: renderer.shadowMap.type,
    autoUpdate: renderer.shadowMap.autoUpdate,
    needsUpdate: renderer.shadowMap.needsUpdate,
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    renderCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    lights, materials: [...mats],
    casters: shadowCasters.length, receivers: receivers.length,
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
