import math
import os
import random
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "model_review" / "yurei_woman_v1"
PUBLIC_MODEL = ROOT / "public" / "models" / "yurei_woman_v1.glb"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_MODEL.parent.mkdir(parents=True, exist_ok=True)

random.seed(13)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mat(name, color, roughness=0.85, metallic=0.0, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = material.node_tree.nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        material.blend_method = "BLEND"
        material.use_screen_refraction = True
        material.show_transparent_back = True
    return material


def shade(obj, smooth=True, bevel=None, subdivision=None):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if smooth:
        bpy.ops.object.shade_smooth()
    if bevel:
        mod = obj.modifiers.new("soft bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    if subdivision:
        mod = obj.modifiers.new("subtle subdivision", "SUBSURF")
        mod.levels = subdivision
        mod.render_levels = subdivision
    obj.select_set(False)
    return obj


def add_uv_sphere(name, loc, scale, material, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return shade(obj)


def add_capsule_like(name, loc, radius, depth, material, scale=(1, 1, 1), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    body = bpy.context.object
    body.name = name
    body.scale = scale
    body.data.materials.append(material)
    shade(body, bevel=radius * 0.45)
    return body


def add_ellipsoid(name, loc, scale, material):
    return add_uv_sphere(name, loc, scale, material, 32, 16)


def add_cloth_mesh(name, z_offset, material):
    # Tapered, uneven white burial dress. Front hangs lower and ragged.
    levels = [
        (0.00, 0.42, 0.28),
        (0.35, 0.50, 0.31),
        (0.83, 0.45, 0.27),
        (1.28, 0.34, 0.22),
        (1.72, 0.24, 0.19),
    ]
    verts = []
    faces = []
    segs = 40
    for li, (y, rx, rz) in enumerate(levels):
        for i in range(segs):
            a = math.tau * i / segs
            rag = 1.0 + math.sin(a * 3.0 + li) * 0.035 + random.uniform(-0.025, 0.025)
            front_drop = 0.0
            if li == 0 and math.sin(a) < -0.35:
                front_drop = random.uniform(-0.18, -0.04)
            verts.append((math.cos(a) * rx * rag, y + z_offset + front_drop, math.sin(a) * rz * rag))
    for li in range(len(levels) - 1):
        for i in range(segs):
            faces.append((li * segs + i, li * segs + (i + 1) % segs, (li + 1) * segs + (i + 1) % segs, (li + 1) * segs + i))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    shade(obj, smooth=True, bevel=0.015)
    return obj


def add_curve_strand(name, points, material, bevel=0.012):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = Vector(co)
        p.handle_left_type = "AUTO"
        p.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def add_stain(name, loc, scale, material, rot=(0, 0, 0), vertices=7):
    bpy.ops.mesh.primitive_circle_add(vertices=vertices, radius=1, fill_type="TRIFAN", location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def select_model_only(root):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in root.children_recursive:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root


def build_model():
    clear_scene()
    cloth = mat("aged dirty white cotton", (0.74, 0.72, 0.64, 1), 0.96)
    cloth_dark = mat("deep damp cloth shadows", (0.34, 0.34, 0.31, 1), 0.98)
    skin = mat("dead pale skin", (0.62, 0.56, 0.50, 1), 0.92)
    hair = mat("heavy wet black hair", (0.005, 0.004, 0.003, 1), 0.98)
    blood = mat("dried dark red stains", (0.22, 0.015, 0.01, 1), 0.91)
    nail = mat("old gray nails", (0.42, 0.40, 0.35, 1), 0.8)

    root = bpy.data.objects.new("YureiWoman_Root", None)
    bpy.context.collection.objects.link(root)

    torso = add_capsule_like("thin hidden torso", (0, 1.25, 0), 0.22, 1.2, skin, scale=(0.72, 1.0, 0.52), vertices=32)
    torso.parent = root

    dress = add_cloth_mesh("torn long white dress", 0.08, cloth)
    dress.parent = root
    outer = add_cloth_mesh("ragged outer robe panels", -0.03, cloth)
    outer.scale = (1.08, 1.0, 1.08)
    outer.rotation_euler.y = math.radians(7)
    outer.parent = root

    # Damp/shadowed panel down the front, deliberately not a direct costume copy.
    front_shadow = add_stain("vertical damp front shadow", (0, 0.92, -0.305), (0.19, 0.78, 1), cloth_dark, rot=(math.radians(90), 0, 0), vertices=9)
    front_shadow.parent = root
    front_blood = add_stain("old chest stain", (0.02, 1.48, -0.27), (0.11, 0.28, 1), blood, rot=(math.radians(90), 0, 0), vertices=8)
    front_blood.parent = root

    head = add_ellipsoid("hidden pale face oval", (0, 2.12, -0.015), (0.19, 0.255, 0.16), skin)
    head.parent = root
    face_dark = add_stain("face mostly hidden by hair", (0, 2.12, -0.17), (0.145, 0.215, 1), hair, rot=(math.radians(90), 0, 0), vertices=12)
    face_dark.parent = root

    scalp = add_ellipsoid("wet black hair mass", (0, 2.13, -0.005), (0.235, 0.32, 0.22), hair)
    scalp.parent = root

    # Hair curtain: many long irregular strands down the face and chest.
    for i in range(54):
        x = random.uniform(-0.23, 0.23)
        front = random.uniform(-0.18, -0.24)
        y0 = random.uniform(2.22, 2.38)
        length = random.uniform(1.15, 2.0)
        sway = random.uniform(-0.11, 0.11)
        points = [
            (x * 0.65, y0, front + random.uniform(-0.015, 0.02)),
            (x + sway * 0.35, y0 - length * 0.32, front + random.uniform(-0.04, 0.03)),
            (x + sway * 0.7, y0 - length * 0.68, front + random.uniform(-0.03, 0.045)),
            (x + sway, max(0.35, y0 - length), front + random.uniform(-0.02, 0.06)),
        ]
        strand = add_curve_strand(f"front wet hair strand {i:02}", points, hair, random.uniform(0.004, 0.011))
        strand.parent = root

    # Back hair sheet and longer side locks.
    back_hair = add_ellipsoid("long back hair sheet", (0, 1.55, 0.16), (0.28, 0.95, 0.055), hair)
    back_hair.parent = root
    for side in [-1, 1]:
        for i in range(12):
            x = side * random.uniform(0.13, 0.27)
            points = [
                (x * 0.8, 2.22, -0.02),
                (x, 1.72, random.uniform(-0.04, 0.08)),
                (x + side * random.uniform(0.03, 0.13), random.uniform(0.55, 1.0), random.uniform(-0.02, 0.12)),
            ]
            strand = add_curve_strand(f"side hair lock {side}_{i:02}", points, hair, random.uniform(0.006, 0.014))
            strand.parent = root

    for side in [-1, 1]:
        upper = add_capsule_like(f"{side} thin upper arm under sleeve", (side * 0.34, 1.33, -0.02), 0.045, 0.68, cloth, scale=(0.72, 1, 0.72), vertices=16)
        upper.rotation_euler.z = side * math.radians(14)
        upper.parent = root
        lower = add_capsule_like(f"{side} hanging forearm", (side * 0.47, 0.82, -0.02), 0.034, 0.62, skin, scale=(0.68, 1, 0.68), vertices=16)
        lower.rotation_euler.z = side * math.radians(-8)
        lower.parent = root
        hand = add_ellipsoid(f"{side} bony hand", (side * 0.51, 0.43, -0.035), (0.065, 0.095, 0.034), skin)
        hand.rotation_euler.z = side * math.radians(-8)
        hand.parent = root
        for f in range(5):
            fx = side * (0.485 + f * 0.018)
            finger = add_capsule_like(f"{side} long gray finger {f}", (fx, 0.31 - abs(f - 2) * 0.018, -0.052), 0.008, 0.16 + f * 0.006, skin, scale=(0.8, 1, 0.8), vertices=8)
            finger.rotation_euler.z = side * math.radians(-10 + f * 4)
            finger.parent = root
            claw = add_capsule_like(f"{side} dirty nail {f}", (fx + side * 0.006, 0.21 - abs(f - 2) * 0.018, -0.055), 0.006, 0.065, nail, scale=(0.55, 1, 0.55), vertices=6)
            claw.rotation_euler.z = side * math.radians(-10 + f * 4)
            claw.parent = root

    for side in [-1, 1]:
        foot = add_ellipsoid(f"{side} barely visible bare foot", (side * 0.12, 0.035, -0.09), (0.13, 0.035, 0.25), skin)
        foot.parent = root

    # Torn hem strips.
    for i in range(22):
        x = random.uniform(-0.48, 0.48)
        z = random.uniform(-0.24, 0.22)
        strip = add_capsule_like(f"torn hanging hem strip {i:02}", (x, random.uniform(0.06, 0.19), z), random.uniform(0.009, 0.018), random.uniform(0.24, 0.62), cloth, scale=(0.45, 1, 0.25), vertices=8)
        strip.rotation_euler.z = random.uniform(-0.35, 0.35)
        strip.rotation_euler.x = random.uniform(-0.08, 0.08)
        strip.parent = root

    # Dirt and old blood marks on robe.
    for i in range(34):
        a = random.uniform(-1.35, 1.35)
        y = random.uniform(0.22, 1.62)
        rx = 0.34 + (1.55 - y) * 0.12
        loc = (math.sin(a) * rx, y, -0.265 + random.uniform(-0.015, 0.02))
        stain_mat = blood if random.random() < 0.28 else cloth_dark
        stain = add_stain(f"robe dirt stain {i:02}", loc, (random.uniform(0.025, 0.09), random.uniform(0.025, 0.16), 1), stain_mat, rot=(math.radians(90), 0, random.uniform(-0.5, 0.5)), vertices=random.randint(5, 9))
        stain.parent = root

    # A very faint cold glow point exported as empty-compatible light; Three can load it but game lighting is still controlled separately.
    bpy.ops.object.light_add(type="POINT", location=(0, 1.45, -0.1))
    glow = bpy.context.object
    glow.name = "faint cold ghost glow"
    glow.data.color = (0.74, 0.82, 1.0)
    glow.data.energy = 20
    glow.data.shadow_soft_size = 2.0
    glow.parent = root

    root.rotation_euler[1] = 0
    root.scale = (1.0, 1.0, 1.0)

    blend_path = OUT_DIR / "yurei_woman_v1.blend"
    glb_path = OUT_DIR / "yurei_woman_v1.glb"
    select_model_only(root)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )
    bpy.ops.export_scene.gltf(
        filepath=str(PUBLIC_MODEL),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )

    # Camera and previews. Keep these out of the exported runtime GLB.
    bpy.ops.object.light_add(type="AREA", location=(0, 3.3, -3.8))
    area = bpy.context.object
    area.name = "preview softbox"
    area.data.energy = 650
    area.data.size = 4
    bpy.ops.object.camera_add(location=(0, 1.35, -4.4))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.75
    bpy.context.scene.camera = camera
    bpy.context.scene.render.resolution_x = 1100
    bpy.context.scene.render.resolution_y = 1400
    try:
        bpy.context.scene.eevee.taa_render_samples = 64
    except Exception:
        pass

    # Render quick approval previews.
    for name, loc, target in [
        ("preview_front.png", (0, 1.25, -4.4), (0, 1.12, 0)),
        ("preview_side.png", (4.4, 1.25, 0), (0, 1.12, 0)),
        ("preview_back.png", (0, 1.25, 4.4), (0, 1.12, 0)),
    ]:
        camera.location = loc
        look_at(camera, target)
        bpy.context.scene.render.filepath = str(OUT_DIR / name)
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    build_model()
