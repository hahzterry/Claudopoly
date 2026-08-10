import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('bench/shots/light2', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);

async function shot(name, pos, hemi, keyI) {
  await p.evaluate(([pos, hemi, keyI]) => {
    const { scene, renderer, camera } = window.__scene;
    scene.traverse(o => {
      if (o.isHemisphereLight) o.intensity = hemi;
      if (o.isDirectionalLight && o.castShadow) {
        o.position.set(pos[0], pos[1], pos[2]);
        o.intensity = keyI;
        o.target.position.set(0, 0, 0);
        o.target.updateMatrixWorld();
        o.shadow.bias = -0.0002;
        o.shadow.normalBias = 0.01;
        o.shadow.radius = 2;
      }
    });
    renderer.shadowMap.needsUpdate = true;
    renderer.autoClear = true;
    renderer.render(scene, camera);
  }, [pos, hemi, keyI]);
  await p.waitForTimeout(220);
  await p.screenshot({ path: `bench/shots/light2/${name}.png` });
  console.log('  ' + name, pos.join(','), 'hemi', hemi, 'key', keyI);
}

const R = 10;
await shot('a-current',   [-0.8*R, 1.8*R,  0.6*R], 0.55, 1.35);
await shot('b-farside',   [-0.9*R, 1.5*R, -0.9*R], 0.45, 1.9);
await shot('c-lateral',   [-1.5*R, 1.0*R, -0.4*R], 0.40, 2.1);
await shot('d-lowfar',    [-1.2*R, 0.9*R, -1.2*R], 0.35, 2.3);
await b.close();
