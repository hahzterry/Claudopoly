import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);

async function variant(name, fn) {
  await p.evaluate(fn);
  // The render loop idles when nothing is animating, so force a frame or the
  // screenshot is simply the last stale one.
  await p.evaluate(() => {
    const { renderer, scene, camera } = window.__scene;
    renderer.shadowMap.needsUpdate = true;
    renderer.autoClear = true;
    renderer.render(scene, camera);
  });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `bench/shots/light/${name}.png` });
  console.log('  ' + name);
}
await p.evaluate(() => { require0: 0; });
import { mkdirSync } from 'node:fs'; mkdirSync('bench/shots/light', { recursive: true });

await variant('00-as-is', () => {});
await variant('01-no-ambient', () => {
  const { scene } = window.__scene;
  scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 0.02; });
  window.__scene.renderer.shadowMap.needsUpdate = true;
});
await variant('02-key-only-hard', () => {
  const { scene, renderer } = window.__scene;
  scene.traverse(o => {
    if (o.isDirectionalLight && !o.castShadow) o.intensity = 0;
    if (o.isDirectionalLight && o.castShadow) o.intensity = 3.0;
  });
  renderer.shadowMap.needsUpdate = true;
});
const info = await p.evaluate(() => {
  const { renderer, scene } = window.__scene;
  let key = null;
  scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) key = o; });
  return {
    keyPos: key.position.toArray(),
    keyTarget: key.target.position.toArray(),
    shadowCam: { l: key.shadow.camera.left, r: key.shadow.camera.right,
                 t: key.shadow.camera.top, b: key.shadow.camera.bottom,
                 near: key.shadow.camera.near, far: key.shadow.camera.far },
    mapSize: key.shadow.mapSize.toArray(),
    hasMap: !!key.shadow.map,
    autoUpdate: renderer.shadowMap.autoUpdate,
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
