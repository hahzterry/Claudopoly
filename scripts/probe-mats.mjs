import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
const out = await p.evaluate(() => {
  const { scene } = window.__scene;
  const rows = [];
  scene.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(m => { if (!m) return; rows.push({
      mesh: o.name || o.geometry?.type || '?',
      mat: m.type,
      vertexColors: !!m.vertexColors,
      emissive: m.emissive ? '#' + m.emissive.getHexString() : null,
      emissiveIntensity: m.emissiveIntensity,
      roughness: m.roughness, metalness: m.metalness,
      envMapIntensity: m.envMapIntensity,
      cast: !!o.castShadow, recv: !!o.receiveShadow,
      visible: o.visible,
    }); });
  });
  return { count: rows.length, casters: rows.filter(r=>r.cast).map(r=>r.mesh), receivers: rows.filter(r=>r.recv).map(r=>r.mesh), allMeshes: rows.map(r=>r.mesh+(r.cast?" [cast]":"")+(r.recv?" [recv]":"")),
           envSet: !!scene.environment, envType: scene.environment?.constructor?.name || null };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
