# Why the board reads flat — diagnosis, 10 August 2026

A blind critic scored our render 67 against Catan Universe's 78 and named the
gap: *"A has no key light. The scene is lit by flat ambient with a painted
vignette faking falloff."*

That diagnosis is **wrong about the cause but right about the effect**. Measured
against the live renderer rather than the source:

| Check | Result |
|---|---|
| `renderer.shadowMap.enabled` | `true` |
| Shadow map allocated | yes, 2048×2048 |
| Shadow casters in scene | 4 |
| Shadow receivers in scene | 5 |
| Materials | `MeshStandardMaterial` throughout, no unlit materials |
| Lights | hemisphere + key (castShadow) + fill + rim, all present |

So the rig is real and shadows do render. Three things actually cause the flat read:

1. **Every tile top is coplanar and up-facing.** A directional light illuminates
   all of them identically, no matter where it is placed. Moving the key changes
   the side walls and the table, never the tops. This is physically correct and
   is why parameter tweaking cannot fix it.

2. **The key sat at `+z`, the same side as the camera.** Every shadow it cast
   fell *behind* its object, hidden by the object itself. Now moved to
   `(-1.5R, 1.0R, -0.4R)`.

3. **Fill and rim were filling the key's own falloff back in.** At the measured
   spec values (0.35 / 0.50) plus hemisphere 0.55, the unlit side retained ~0.95
   of lit luminance instead of the ~0.58 the benchmark measures. Hemisphere is
   now 0.40, fill 0.22, rim 0.30.

## What still needs doing, and it is geometry not lighting

- Bevel the tile top edges so the top face is not perfectly planar and catches a
  highlight along the key-facing edge.
- Raise the board carcass enough that it casts a visible shadow onto the table.
- Give tokens and dice tight contact shadows that touch their base with no gap.
- Increase camera tilt and shorten focal length; near and far rows are currently
  near-identical in scale, which reads orthographic.

## Method note

The first probe of this produced a false negative: the render loop idles when
nothing is animating, so changing a light and screenshotting returned a stale
frame. Any probe must force `renderer.render()` after mutating the scene.
See `scripts/probe-light.mjs`.
