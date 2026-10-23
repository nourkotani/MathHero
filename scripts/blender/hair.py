"""The hero's hair, built in Blender on each body's skull (ADR 0013).

Every Hair Style and every Form's mane is a set of spikes: tapered,
bent cones rooted on the scalp. A spike's root is found by a ray from the
skull's core through the scalp, so each piece fits whatever head Tripo
made; its growth leans from the scalp's normal toward the style's flow
(up, or up and back), and its tip curls. The sizes are shares of the
skull's width, so the same table fits both bodies. The body's own painted
buzz cut shows between the spikes (masks.py recolors it with the hair
color), so no piece needs a scalp cap, and the short buzz cut is no piece
at all. The long buzz cut is a shell over the scalp with short tufts
(hero.py, from the scalp's own faces).

The shapes are DBZ-inspired and original: a crown of spikes (spiky), a
wave swept back (flame), a tail with side bangs (ponytail); the manes are
bigger than any style, so an ascension reads at a glance. No spike points
at the face: the fringe rises from the hairline.

A piece is one mesh, smooth-shaded, under the face budget, rigid on the
body's hair bone (hero.py skins it). Every number here is fixed: a bake
from an unchanged script gives the same mesh.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

# A spike: rings along its length, segments around it.
RINGS = 7
SEGMENTS = 7
# How far the root sinks under the scalp, in hero units.
SINK = 0.03
# A spike's thickness across the scalp, as a share of its width.
FLAT = 0.55
# The long buzz cut: tufts over the scalp, (azimuths step, elevations).
TUFT_STEP = 24.0
TUFT_ELEVATIONS = (14.0, 32.0, 50.0, 68.0, 84.0)

STYLES = ("spiky", "flame", "ponytail")
LENGTHS = ("short", "long")
MANES = ("wild", "crimson", "rose", "legend")


def hair_name(style, length):
    return f"Hair_{style}_{length}"


def mane_name(mane):
    return f"Hair_mane_{mane}"


def skull(body, prefix, on_bone, floor=None):
    """The head, for the hair: the top centre and the width of its upper
    part, the crown's centre and half width, the ears' top, the brow, the
    hairline (front, side, back), and the core the roots are cast from.
    on_bone(body, bone) -> bool array of the vertices a bone carries.
    floor: a height below which the head's vertices do not count (long
    hair on the head bone falls to the back)."""
    on_head = on_bone(body, prefix + "head")
    co = np.empty(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    if floor is not None:
        on_head = on_head & (co[:, 2] > floor)
    head = co[on_head]
    top = float(head[:, 2].max())
    height = top - float(head[:, 2].min())
    upper = head[head[:, 2] > top - 0.45 * height]
    crown = head[head[:, 2] > top - 0.2]
    crown_x = 0.5 * float(crown[:, 0].min() + crown[:, 0].max())
    lateral = np.abs(head[:, 0] - crown_x)
    ear_top = float(head[lateral > 0.92 * lateral.max(), 2].max())
    drop = top - ear_top
    width = float(upper[:, 0].max() - upper[:, 0].min())
    centre = Vector((0.5 * float(upper[:, 0].min() + upper[:, 0].max()), 0.5 * float(upper[:, 1].min() + upper[:, 1].max()), top))
    return {
        "centre": centre,
        "width": width,
        "height": height,
        "crown_x": crown_x,
        "crown_y": 0.5 * float(crown[:, 1].min() + crown[:, 1].max()),
        "half_width": 0.5 * float(crown[:, 0].max() - crown[:, 0].min()),
        "ear_top": ear_top,
        "brow": ear_top + 0.03,
        "hairline": (top - 0.35 * drop, ear_top + 0.02, ear_top - 0.12),
        "core": Vector((crown_x, centre.y, ear_top + 0.45 * drop)),
        "faces": on_head,
    }


def hairline(sk):
    """The hairline's height around the head, for masks.scalp_faces: high
    on the forehead, over the ears, low at the nape, a + b cos(angle) +
    c cos(2 angle), the angle from the front."""
    front, side, back = sk["hairline"]
    a = 0.5 * (side + 0.5 * (front + back))
    b = 0.5 * (front - back)
    cc = 0.5 * (front + back) - a
    cx, cy = sk["crown_x"], sk["crown_y"]

    def line(x, y, z):
        r = np.hypot(x - cx, y - cy) + 1e-9
        ahead = -(y - cy) / r
        return a + b * ahead + cc * (2.0 * ahead * ahead - 1.0)

    return line


FACE_CONE = 0.5  # cos 60 degrees: the face is the front of the head


def mask_line(sk):
    """The hair boundary for the masks (masks.scalp_faces): the hairline at
    the front of the head (within FACE_CONE of straight ahead), and no
    boundary at all at the sides and the back, so a bob, a mane down the
    back, or a buzz cut recolors whole. Skin anywhere stays skin (masks
    sorts the scalp's pixels by skin first)."""
    front = sk["hairline"][0]
    cx, cy = sk["crown_x"], sk["crown_y"]

    def line(x, y, z):
        r = np.hypot(x - cx, y - cy) + 1e-9
        ahead = -(y - cy) / r
        return np.where(ahead > FACE_CONE, front, -1e9)

    return line


class Scalp:
    """Rays from the skull's core to the scalp, on the head's faces."""

    def __init__(self, body, sk):
        bm = bmesh.new()
        bm.from_mesh(body.data)
        bm.verts.ensure_lookup_table()
        on = sk["faces"]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(on[v.index] for v in f.verts)], context="FACES")
        self.tree = BVHTree.FromBMesh(bm)
        bm.free()
        self.sk = sk

    def root(self, azimuth, elevation):
        """The scalp point and normal in the direction (azimuth from the
        front toward the hero's right, elevation from level), from the core."""
        a, e = math.radians(azimuth), math.radians(elevation)
        d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        hit, normal, _, _ = self.tree.ray_cast(self.sk["core"], d, 2.0)
        if hit is None:
            hit = self.sk["core"] + d * self.sk["half_width"]
            normal = d
        return hit, normal.normalized()


# A head face farther out than the first surface a ray from the core
# meets, by this much (hero units), is hair over the skin.
SHELL = 0.012


def shell_faces(body, sk, head):
    """The head's faces that are a shell over the skin: Tripo models hair
    as a surface outside the head, so a ray from the skull's core meets the
    skin first and the hair beyond it. A fringe over the forehead and the
    strands framing the face are hair, not features, whatever their
    paint. head: bool array over the faces (masks.head_faces)."""
    scalp = Scalp(body, sk)
    count = len(body.data.polygons)
    centres = np.empty(count * 3, dtype=np.float32)
    body.data.polygons.foreach_get("center", centres)
    centres = centres.reshape(-1, 3)
    shell = np.zeros(count, dtype=bool)
    core = sk["core"]
    for i in np.nonzero(head)[0]:
        centre = Vector(centres[i])
        away = centre - core
        reach = away.length
        if reach < 1e-6:
            continue
        hit, _, _, distance = scalp.tree.ray_cast(core, away / reach, reach + 1.0)
        if hit is not None and reach > distance + SHELL:
            shell[i] = True
    print(f"SHELL {body.name}: {int(shell.sum())} of {int(head.sum())} head faces are hair over the skin")
    return shell


UP = Vector((0.0, 0.0, 1.0))
BACK = Vector((0.0, 1.0, 0.0))
FRONT = Vector((0.0, -1.0, 0.0))


def _frame(tangent):
    """Two axes across a spike at a point, from its tangent."""
    t = tangent.normalized()
    ref = UP if abs(t.dot(UP)) < 0.9 else BACK
    u = t.cross(ref).normalized()
    v = u.cross(t).normalized()
    return u, v


def spike(bm, root, normal, direction, curl, length, radius, flow=0.6, belly=0.15, rings=RINGS, segments=SEGMENTS, flat=FLAT):
    """One spike into bm: a quadratic curve from the root (sunk under the
    scalp) along the growth, which leans from the normal toward direction
    by flow, and bends toward curl at the tip; its radius tapers to a
    point, with a slight belly. A spike is a flat blade: wide along the
    scalp, thin across it (flat)."""
    growth = (normal * (1.0 - flow) + direction.normalized() * flow).normalized()
    p0 = root - normal * min(SINK, 0.3 * length)
    p1 = p0 + growth * (0.5 * length)
    p2 = p0 + (growth + curl).normalized() * length
    ring_verts = []
    for i in range(rings):
        t = i / rings
        point = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
        tangent = 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)
        u, v = _frame(tangent)
        r = radius * (1.0 - t) ** 0.8 * (1.0 + belly * math.sin(math.pi * t))
        ring = []
        for s in range(segments):
            ang = 2 * math.pi * s / segments
            ring.append(bm.verts.new(point + u * (r * math.cos(ang)) + v * (r * flat * math.sin(ang))))
        ring_verts.append(ring)
    tip = bm.verts.new(p2)
    for i in range(rings - 1):
        a, b = ring_verts[i], ring_verts[i + 1]
        for s in range(segments):
            bm.faces.new((a[s], b[s], b[(s + 1) % segments], a[(s + 1) % segments]))
    last = ring_verts[-1]
    for s in range(segments):
        bm.faces.new((last[s], tip, last[(s + 1) % segments]))
    bm.faces.new(tuple(ring_verts[0]))


def _direction(azimuth, elevation):
    """A unit vector: azimuth from the front toward the right, elevation up."""
    a, e = math.radians(azimuth), math.radians(elevation)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


def _outward(root, sk):
    """Level and away from the skull's axis at a root."""
    out = Vector((root.x - sk["crown_x"], root.y - sk["crown_y"], 0.0))
    return out.normalized() if out.length > 1e-6 else FRONT


# ---------------------------------------------------------------- the styles
#
# A spike row: (azimuth, elevation) of the root on the scalp; the growth
# direction as (flow toward it, azimuth, elevation) or a vector; the curl
# vector; the length and the radius in skull widths.


def _crown(scalp, sk, bm, w, azimuths, elevation, length, radius, lean=0.55, curl_up=0.35, taper=0.0):
    """A ring of spikes around the crown, each leaning outward and up,
    curling up at the tip; taper shortens the ones toward the back."""
    for az in azimuths:
        root, normal = scalp.root(az, elevation)
        out = _outward(root, sk)
        direction = (out * 0.6 + UP * 1.0).normalized()
        share = 1.0 - taper * (1.0 - math.cos(math.radians(az))) / 2.0
        spike(bm, root, normal, direction, UP * curl_up, length * w * share, radius * w, flow=lean)


def _fringe(scalp, sk, bm, w, azimuths, elevation, length, radius):
    """Short licks over the forehead: they rise and curl forward, so the
    hairline reads, and never cover the brow."""
    for az in azimuths:
        root, normal = scalp.root(az, elevation)
        direction = (UP * 1.0 + FRONT * 0.45 + _outward(root, sk) * 0.3).normalized()
        spike(bm, root, normal, direction, UP * 0.3 + FRONT * 0.2, length * w, radius * w, flow=0.7)


def _temples(scalp, sk, bm, w, length, radius, elevation=18.0, back=0.3):
    """Spikes past the ears, out and a little back: they widen the head."""
    for side in (-1, 1):
        root, normal = scalp.root(side * 88.0, elevation)
        direction = (_outward(root, sk) * 1.0 + UP * 0.35 + BACK * back).normalized()
        spike(bm, root, normal, direction, UP * 0.25, length * w, radius * w, flow=0.75)


def _hanging(scalp, sk, bm, w, azimuths, elevation, length, radius, down=1.2):
    """Long spikes from the back of the head, hanging down and out."""
    for az in azimuths:
        root, normal = scalp.root(az, elevation)
        direction = (_outward(root, sk) * 0.5 + BACK * 0.4 - UP * down).normalized()
        spike(bm, root, normal, direction, -UP * 0.4, length * w, radius * w, flow=0.8, belly=0.1)


def _swept(scalp, sk, bm, w, rows, radius, lift=1.0, back=0.9):
    """Spikes swept up and back like a flame: rows of (azimuths,
    elevation, length)."""
    for azimuths, elevation, length in rows:
        for az in azimuths:
            root, normal = scalp.root(az, elevation)
            direction = (UP * lift + BACK * back + _outward(root, sk) * 0.25).normalized()
            spike(bm, root, normal, direction, BACK * 0.5 + UP * 0.1, length * w, radius * w, flow=0.8, belly=0.2)


def _tail(scalp, sk, bm, w, length, radius, count=4, droop=0.8):
    """A ponytail: a band at the occiput and a bundle of spikes hanging
    from it, splayed a little."""
    root, normal = scalp.root(180.0, 42.0)
    band_axis = (normal * 0.4 + BACK).normalized()
    # The band: a short cuff around the bundle's root, just off the scalp.
    band = bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=radius * w * 1.15, radius2=radius * w * 1.0, depth=0.1 * w)
    turn = band_axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, verts=band["verts"], matrix=Matrix.Translation(root + band_axis * (0.1 * w)) @ turn)
    for i in range(count):
        a = (i - (count - 1) / 2.0) / max(count - 1, 1)
        offset = Vector((a * radius * w * 1.6, 0.0, 0.0))
        direction = (BACK * 0.5 - UP * droop + Vector((a * 0.35, 0.0, 0.0))).normalized()
        spike(bm, root + offset + band_axis * (0.05 * w), band_axis, direction, -UP * 0.5, length * w * (1.0 - 0.15 * abs(a)), radius * w * 0.75, flow=0.9, belly=0.25)


def _puffs(sk, bm, w, scalp, rows, radius):
    """Round puffs of hair (the rose mane): spheres on the scalp."""
    for azimuths, elevation in rows:
        for az in azimuths:
            root, normal = scalp.root(az, elevation)
            made = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=radius * w)
            bmesh.ops.transform(bm, verts=made["verts"], matrix=Matrix.Translation(root + normal * (radius * w * 0.55)))


def _build(name, make):
    bm = bmesh.new()
    make(bm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.shade_smooth()
    return obj


def build_style(name, style, long, scalp, sk):
    """One Hair Style, short or long."""
    w = sk["width"]
    sides = lambda *a: [x for v in a for x in (v, -v)]  # noqa: E731

    def spiky(bm):
        # Two rings of spikes over the skull, fanned out, and one on top.
        _crown(scalp, sk, bm, w, [*sides(20.0, 60.0, 100.0, 140.0), 180.0], 42.0, 1.1 if long else 0.9, 0.19, lean=0.7, taper=0.35)
        _crown(scalp, sk, bm, w, [0.0, *sides(45.0, 90.0, 135.0)], 68.0, 1.3 if long else 1.05, 0.2, lean=0.55, taper=0.3)
        root, normal = scalp.root(0.0, 86.0)
        spike(bm, root, normal, UP, FRONT * 0.15, (1.4 if long else 1.15) * w, 0.21 * w, flow=0.8)
        _fringe(scalp, sk, bm, w, sides(22.0), 44.0, 0.5, 0.11)
        _temples(scalp, sk, bm, w, 0.65, 0.13)
        if long:
            _hanging(scalp, sk, bm, w, [180.0, *sides(152.0), *sides(126.0)], 22.0, 1.5, 0.17)
            _hanging(scalp, sk, bm, w, sides(165.0), 2.0, 1.2, 0.14)
        else:
            _hanging(scalp, sk, bm, w, [180.0, *sides(150.0)], 30.0, 0.55, 0.13, down=0.9)

    def flame(bm):
        scale = 1.35 if long else 1.0
        _swept(scalp, sk, bm, w, [
            ([0.0], 74.0, 1.15 * scale),
            (sides(34.0), 70.0, 1.0 * scale),
            (sides(72.0), 60.0, 0.85 * scale),
            (sides(112.0), 55.0, 0.75 * scale),
            (sides(150.0), 50.0, 0.7 * scale),
            ([180.0], 48.0, 0.7 * scale),
        ], 0.19)
        _fringe(scalp, sk, bm, w, sides(16.0), 46.0, 0.5, 0.1)
        _temples(scalp, sk, bm, w, 0.6, 0.12, back=0.6)
        if long:
            _hanging(scalp, sk, bm, w, [180.0, *sides(158.0)], 18.0, 1.6, 0.16, down=1.0)

    def ponytail(bm):
        _fringe(scalp, sk, bm, w, sides(28.0), 42.0, 0.45, 0.1)
        for side in (-1, 1):
            root, normal = scalp.root(side * 62.0, 30.0)
            direction = (_outward(root, sk) * 0.4 - UP * 1.0).normalized()
            spike(bm, root, normal, direction, -UP * 0.3 + FRONT * 0.1, 0.65 * w, 0.11 * w, flow=0.85)
        _tail(scalp, sk, bm, w, 1.8 if long else 0.9, 0.17, count=5 if long else 4, droop=1.0 if long else 0.7)

    make = {"spiky": spiky, "flame": flame, "ponytail": ponytail}[style]
    return _build(name, make)


def build_mane(name, mane, scalp, sk):
    """A Form's shared mane, bigger than any style."""
    w = sk["width"]
    sides = lambda *a: [x for v in a for x in (v, -v)]  # noqa: E731

    def wild(bm):
        _crown(scalp, sk, bm, w, [*sides(25.0, 65.0, 105.0, 145.0), 180.0], 40.0, 1.3, 0.2, lean=0.75, curl_up=0.4, taper=0.25)
        _crown(scalp, sk, bm, w, [0.0, *sides(30.0, 60.0, 90.0, 120.0, 150.0), 180.0], 62.0, 1.7, 0.23, lean=0.6, curl_up=0.5, taper=0.2)
        root, normal = scalp.root(0.0, 86.0)
        spike(bm, root, normal, UP, FRONT * 0.1, 1.8 * w, 0.25 * w, flow=0.85)
        _fringe(scalp, sk, bm, w, sides(20.0), 44.0, 0.6, 0.12)
        _temples(scalp, sk, bm, w, 1.1, 0.17)
        _hanging(scalp, sk, bm, w, [180.0, *sides(155.0), *sides(130.0)], 24.0, 2.2, 0.2)
        _hanging(scalp, sk, bm, w, sides(168.0, 140.0), 4.0, 1.7, 0.17)

    def crimson(bm):
        _swept(scalp, sk, bm, w, [
            ([0.0], 76.0, 1.4),
            (sides(30.0), 72.0, 1.3),
            (sides(62.0), 64.0, 1.15),
            (sides(96.0), 58.0, 1.0),
            (sides(132.0), 52.0, 0.95),
            (sides(165.0), 48.0, 0.95),
        ], 0.18, lift=0.8, back=1.1)
        _fringe(scalp, sk, bm, w, sides(14.0), 47.0, 0.55, 0.1)
        _temples(scalp, sk, bm, w, 0.65, 0.12, back=0.8)
        _tail(scalp, sk, bm, w, 2.8, 0.19, count=5, droop=1.1)

    def rose(bm):
        _puffs(sk, bm, w, scalp, [
            ([0.0, *sides(40.0, 80.0, 120.0, 160.0)], 66.0),
            (sides(50.0, 85.0, 120.0, 155.0), 38.0),
            ([180.0, *sides(150.0)], 14.0),
        ], 0.3)
        _fringe(scalp, sk, bm, w, sides(18.0), 44.0, 0.5, 0.1)

    def legend(bm):
        for az, length in ((0.0, 2.1), (25.0, 1.9), (-25.0, 1.9), (50.0, 1.6), (-50.0, 1.6), (75.0, 1.35), (-75.0, 1.35), (100.0, 1.2), (-100.0, 1.2)):
            root, normal = scalp.root(az, 70.0)
            direction = (UP * 1.0 + _outward(root, sk) * 0.2).normalized()
            spike(bm, root, normal, direction, UP * 0.2 + _outward(root, sk) * 0.15, length * w, 0.21 * w, flow=0.85, belly=0.1)
        _fringe(scalp, sk, bm, w, sides(18.0), 46.0, 0.6, 0.12)
        _temples(scalp, sk, bm, w, 0.95, 0.15, elevation=24.0)
        _hanging(scalp, sk, bm, w, [180.0, *sides(150.0)], 26.0, 2.4, 0.2, down=1.1)
        _hanging(scalp, sk, bm, w, sides(165.0), 6.0, 1.8, 0.16)

    make = {"wild": wild, "crimson": crimson, "rose": rose, "legend": legend}[mane]
    return _build(name, make)


def build_buzz_long(name, scalp, sk):
    """The long buzz cut: short tufts all over the scalp, tipped back."""
    w = sk["width"]
    line = hairline(sk)

    def tufts(bm):
        for elevation in TUFT_ELEVATIONS:
            count = max(1, int(round(360.0 / TUFT_STEP * math.cos(math.radians(elevation)))))
            for i in range(count):
                az = i * 360.0 / count + (elevation * 0.7) % TUFT_STEP
                root, normal = scalp.root(az, elevation)
                if root.z < float(line(np.array([root.x]), np.array([root.y]), np.array([root.z]))[0]) + 0.01:
                    continue
                direction = (normal * 0.5 + UP * 0.6 + BACK * 0.5).normalized()
                spike(bm, root, normal, direction, BACK * 0.3, 0.22 * w, 0.055 * w, flow=0.6, rings=4, segments=5)

    return _build(name, tufts)


def build_all(body, prefix, sk, suffix):
    """Every spike piece of one body: {name: object}, each named
    `<part>-<body>` (suffix). The short buzz cut is no piece."""
    scalp = Scalp(body, sk)
    pieces = {}
    for style in STYLES:
        for length in LENGTHS:
            part = hair_name(style, length)
            pieces[part] = build_style(f"{part}-{suffix}", style, length == "long", scalp, sk)
    pieces[hair_name("buzz", "long")] = build_buzz_long(f"{hair_name('buzz', 'long')}-{suffix}", scalp, sk)
    for mane in MANES:
        part = mane_name(mane)
        pieces[part] = build_mane(f"{part}-{suffix}", mane, scalp, sk)
    for part, obj in pieces.items():
        print(f"HAIR {obj.name}: {len(obj.data.polygons)} faces")
    return pieces
