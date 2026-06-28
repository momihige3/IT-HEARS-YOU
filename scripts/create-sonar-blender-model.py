import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "model_review" / "sonar_blender_v1"
OUT.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mat(name, color, roughness=0.42, metallic=0.0, specular=0.65):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = color[3]
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = specular
        elif "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = specular
    return material


SKIN = mat("wet black green-gray skin / 濡れた黒緑灰色の皮膚", (0.055, 0.072, 0.058, 1), 0.26, 0.0, 0.9)
DARK_SKIN = mat("oily blind black face / 目の無い黒い顔面", (0.005, 0.006, 0.005, 1), 0.18, 0.0, 1.0)
EAR = mat("thin red ear membrane / 赤黒い耳膜", (0.33, 0.045, 0.032, 1), 0.38, 0.0, 0.65)
MOUTH = mat("dark wet red mouth interior / 暗赤色の口腔", (0.16, 0.006, 0.004, 1), 0.2, 0.0, 0.9)
BONE = mat("dirty gray bone claws / 灰白色の爪", (0.55, 0.51, 0.43, 1), 0.48, 0.0, 0.35)


def bz(co):
    # Authoring coordinates use Three.js style Y-up: (x, height, depth).
    # Blender is Z-up: (x, depth, height).
    return (co[0], co[2], co[1])


def bz_scale(co):
    return (co[0], co[2], co[1])


def shade_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    finally:
        obj.select_set(False)
    return obj


def add_modifier(obj, kind, name, **kwargs):
    mod = obj.modifiers.new(name, kind)
    for key, value in kwargs.items():
        setattr(mod, key, value)
    return mod


def add_ellipsoid(name, loc, scale, material, segments=64, rings=32, displace=0.018):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=bz(loc))
    obj = bpy.context.object
    obj.name = name
    obj.scale = bz_scale(scale)
    obj.data.materials.append(material)
    shade_smooth(obj)
    add_modifier(obj, "SUBSURF", "review_smooth_subdivision", levels=1, render_levels=1)
    if displace:
        tex = bpy.data.textures.new(f"{name}_pores_noise", "VORONOI")
        tex.noise_scale = 0.72
        tex.intensity = 0.28
        tex.contrast = 1.8
        disp = add_modifier(obj, "DISPLACE", "wet_skin_micro_surface", strength=displace)
        disp.texture = tex
    return obj


def make_curve_tube(name, points, radius, material, bevel_resolution=5, resolution=4):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = bevel_resolution
    spl = curve.splines.new("POLY")
    spl.points.add(len(points) - 1)
    for p, co in zip(spl.points, points):
        mapped = bz(co)
        p.co = (mapped[0], mapped[1], mapped[2], 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def make_bezier_tube(name, points, radius, material, bevel_resolution=5):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 20
    curve.bevel_depth = radius
    curve.bevel_resolution = bevel_resolution
    spl = curve.splines.new("BEZIER")
    spl.bezier_points.add(len(points) - 1)
    for i, (bp, co) in enumerate(zip(spl.bezier_points, points)):
        bp.co = Vector(bz(co))
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def convert_curves_to_mesh():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "CURVE":
            obj.select_set(True)
    if bpy.context.selected_objects:
        bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
        bpy.ops.object.convert(target="MESH")
        for obj in bpy.context.selected_objects:
            shade_smooth(obj)


def make_ear(name, side):
    # Thick sculpted membrane, not a flat plane.  The grid is cupped, then solidified.
    verts = []
    faces = []
    rows = 30
    cols = 42
    root_x = side * 0.19
    for r in range(rows + 1):
        v = r / rows
        y = 2.17 + (v - 0.5) * 0.86
        width = math.sin(v * math.pi) * 0.68
        for c in range(cols + 1):
            u = c / cols
            lateral = (u - 0.28) * width
            cup = -0.19 * math.sin(u * math.pi) * math.sin(v * math.pi)
            curl = 0.04 * math.sin(v * math.pi * 2.0)
            x = root_x + side * (0.17 + lateral)
            z = 0.03 + cup + curl
            verts.append(bz((x, y, z)))
    stride = cols + 1
    for r in range(rows):
        for c in range(cols):
            a = r * stride + c
            faces.append((a, a + stride, a + 1))
            faces.append((a + 1, a + stride, a + stride + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(EAR)
    shade_smooth(obj)
    solid = add_modifier(obj, "SOLIDIFY", "real_membrane_thickness", thickness=0.045, offset=0)
    solid.use_quality_normals = True
    add_modifier(obj, "SUBSURF", "soft_membrane_surface", levels=1, render_levels=1)

    rim_points = []
    for t in range(72):
        a = t / 72 * math.tau
        rx = side * (0.47 + math.cos(a) * 0.38)
        ry = 2.17 + math.sin(a) * 0.43
        rz = -0.035 + math.sin(abs(math.sin(a)) * math.pi) * -0.12
        rim_points.append((rx, ry, rz))
    rim_points.append(rim_points[0])
    make_bezier_tube(f"{name}_thick_outer_rim", rim_points, 0.025, MOUTH, 4)
    make_bezier_tube(
        f"{name}_root_cartilage",
        [(side * 0.13, 2.12, 0.035), (side * 0.3, 2.17, 0.0), (side * 0.47, 2.17, -0.02)],
        0.055,
        SKIN,
        5,
    )
    for i in range(8):
        y = 1.84 + i * 0.1
        make_bezier_tube(
            f"{name}_raised_inner_vein_{i}",
            [
                (side * 0.38, y, 0.0),
                (side * (0.48 + i * 0.028), y + 0.05, -0.08),
                (side * (0.66 + i * 0.018), y + 0.14, -0.03),
            ],
            0.0065,
            MOUTH,
            2,
        )
    return obj


def add_claw(name, base, direction, length=0.34, radius=0.022):
    end = Vector(base) + Vector(direction).normalized() * length
    mid = Vector(base).lerp(end, 0.62) + Vector((0, -0.04, 0.02))
    make_bezier_tube(name, [base, mid, end], radius, BONE, 2)


def build_model():
    clear_scene()

    # Core silhouette from the three-view: tall, narrow, wet, light-bodied.
    add_ellipsoid("skull_smooth_eyeless_head", (0, 2.16, 0.045), (0.18, 0.27, 0.16), SKIN, 72, 36, 0.01)
    add_ellipsoid("oily_black_blind_face_plate", (0, 2.16, 0.185), (0.11, 0.18, 0.035), DARK_SKIN, 48, 24, 0.0)
    make_ear("left_giant_sculpted_ear", -1)
    make_ear("right_giant_sculpted_ear", 1)

    add_ellipsoid("long_sunken_torso", (0, 1.31, 0.0), (0.23, 0.72, 0.15), SKIN, 80, 42, 0.02)
    add_ellipsoid("raised_rib_chest_plate", (0, 1.64, 0.07), (0.29, 0.31, 0.105), SKIN, 72, 34, 0.015)
    add_ellipsoid("narrow_pelvis", (0, 0.59, -0.015), (0.2, 0.17, 0.13), SKIN, 56, 28, 0.012)
    add_ellipsoid("left_back_scapula", (-0.14, 1.64, -0.15), (0.14, 0.22, 0.035), SKIN, 36, 18, 0.006)
    add_ellipsoid("right_back_scapula", (0.14, 1.64, -0.15), (0.14, 0.22, 0.035), SKIN, 36, 18, 0.006)

    # Vertical split mouth, not a painted line.
    make_bezier_tube("left_torn_vertical_mouth_lip", [(-0.045, 2.02, 0.22), (-0.08, 1.63, 0.25), (-0.06, 1.13, 0.235), (-0.03, 0.82, 0.18)], 0.021, MOUTH, 4)
    make_bezier_tube("right_torn_vertical_mouth_lip", [(0.045, 2.02, 0.22), (0.08, 1.63, 0.25), (0.06, 1.13, 0.235), (0.03, 0.82, 0.18)], 0.021, MOUTH, 4)
    add_ellipsoid("deep_red_open_mouth_interior", (0, 1.43, 0.245), (0.045, 0.62, 0.038), MOUTH, 32, 22, 0.004)
    for i in range(18):
        y = 1.96 - i * 0.062
        sx = -1 if i % 2 else 1
        add_claw(f"inner_mouth_needle_tooth_{i}", (sx * 0.022, y, 0.29), (sx * 0.15, -0.12, 0.5), 0.09, 0.006)

    # Spine, ribs, tendons.
    make_bezier_tube("exposed_knuckled_spine", [(0, 2.0, -0.18), (0, 1.5, -0.23), (0, 0.83, -0.19)], 0.026, MOUTH, 4)
    for i in range(12):
        add_ellipsoid(f"raised_spine_bone_{i}", (0, 0.82 + i * 0.1, -0.225), (0.04, 0.028, 0.026), SKIN, 24, 12, 0.002)
    for i in range(8):
        y = 1.78 - i * 0.1
        w = 0.1 + i * 0.018
        make_bezier_tube(f"left_visible_rib_{i}", [(-0.02, y, 0.13), (-w, y - 0.03, 0.09), (-w - 0.075, y - 0.07, -0.02)], 0.009, MOUTH, 2)
        make_bezier_tube(f"right_visible_rib_{i}", [(0.02, y, 0.13), (w, y - 0.03, 0.09), (w + 0.075, y - 0.07, -0.02)], 0.009, MOUTH, 2)
    for side in (-1, 1):
        make_bezier_tube(f"{side}_back_long_tendon", [(side * 0.1, 1.9, -0.17), (side * 0.15, 1.42, -0.24), (side * 0.1, 0.92, -0.17)], 0.011, MOUTH, 2)

    # Limbs: curves with bevel depth produce real thickness, not planes.
    for side in (-1, 1):
        label = "left" if side < 0 else "right"
        add_ellipsoid(f"{label}_bony_shoulder", (side * 0.28, 1.72, 0.01), (0.075, 0.085, 0.058), SKIN, 30, 16, 0.006)
        make_bezier_tube(f"{label}_long_upper_arm", [(side * 0.28, 1.68, 0.02), (side * 0.42, 1.16, 0.035), (side * 0.52, 0.78, 0.055)], 0.052, SKIN, 5)
        add_ellipsoid(f"{label}_dark_elbow_joint", (side * 0.535, 0.72, 0.06), (0.052, 0.052, 0.042), MOUTH, 26, 14, 0.003)
        make_bezier_tube(f"{label}_floor_reaching_forearm", [(side * 0.54, 0.72, 0.06), (side * 0.61, 0.26, 0.09), (side * 0.66, -0.13, 0.13)], 0.036, SKIN, 5)
        add_ellipsoid(f"{label}_long_withered_hand", (side * 0.67, -0.22, 0.15), (0.055, 0.095, 0.045), SKIN, 30, 16, 0.004)
        for i, spread in enumerate((-0.18, -0.06, 0.06, 0.18)):
            add_claw(f"{label}_long_finger_claw_{i}", (side * (0.63 + i * 0.035), -0.29, 0.16), (side * spread, -0.82, 0.34), 0.42, 0.013)
        add_claw(f"{label}_opposing_thumb_claw", (side * 0.59, -0.25, 0.1), (-side * 0.3, -0.75, 0.2), 0.32, 0.012)

        make_bezier_tube(f"{label}_sinewy_thigh", [(side * 0.12, 0.51, 0), (side * 0.18, 0.13, 0.03), (side * 0.19, -0.14, 0.08)], 0.062, SKIN, 5)
        add_ellipsoid(f"{label}_soft_dark_knee", (side * 0.2, -0.18, 0.08), (0.048, 0.058, 0.04), MOUTH, 26, 14, 0.003)
        make_bezier_tube(f"{label}_digitigrade_shin", [(side * 0.2, -0.18, 0.08), (side * 0.22, -0.58, 0.2), (side * 0.2, -0.83, 0.37)], 0.04, SKIN, 5)
        add_ellipsoid(f"{label}_almost_heelless_long_foot", (side * 0.2, -0.89, 0.5), (0.075, 0.04, 0.18), SKIN, 32, 16, 0.004)
        for i, spread in enumerate((-0.08, 0.0, 0.08)):
            add_claw(f"{label}_toe_claw_{i}", (side * (0.15 + i * 0.045), -0.91, 0.62), (side * spread, -0.04, 0.7), 0.2, 0.011)

    convert_curves_to_mesh()

    empty = bpy.data.objects.new("SONAR_height_reference_2_4m", None)
    bpy.context.collection.objects.link(empty)


def setup_lighting_camera(view="front"):
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 42
    positions = {
        "front": (0, -6.7, 0.72),
        "side": (6.7, 0.05, 0.72),
        "back": (0, 6.7, 0.72),
    }
    cam.location = positions[view]
    target = Vector((0, 0, 0.75))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    cam_dir = (target - cam.location).normalized()
    key_pos = cam.location + Vector((0, 0, 1.45))
    bpy.ops.object.light_add(type="AREA", location=key_pos)
    light = bpy.context.object
    light.name = "large_softbox_camera_side"
    light.data.energy = 860
    light.data.size = 5.4
    light.rotation_euler = cam.rotation_euler

    rim_pos = target + cam_dir * 2.4 + Vector((0, 0, 1.6))
    bpy.ops.object.light_add(type="POINT", location=rim_pos)
    rim = bpy.context.object
    rim.name = "cool_back_rim"
    rim.data.energy = 150


def render_preview(view):
    setup_lighting_camera(view)
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.eevee.taa_render_samples = 64
    bpy.context.scene.render.resolution_x = 1400
    bpy.context.scene.render.resolution_y = 1800
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.view_settings.exposure = 0
    bpy.context.scene.view_settings.gamma = 1
    bpy.context.scene.world.color = (0.015, 0.016, 0.014)
    bpy.context.scene.render.filepath = str(OUT / f"preview_{view}.png")
    bpy.ops.render.render(write_still=True)
    # Remove camera/lights so each render can set its own clean view.
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)


def export_files():
    blend_path = OUT / "sonar_blender_v1.blend"
    glb_path = OUT / "sonar_blender_v1.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", export_yup=True, export_apply=True)
    (OUT / "README.md").write_text(
        "# SONAR Blender v1 review model\n\n"
        "Game implementation is intentionally not changed.\n\n"
        "Files:\n"
        "- sonar_blender_v1.blend\n"
        "- sonar_blender_v1.glb\n"
        "- preview_front.png / preview_side.png / preview_back.png\n\n"
        "Created from the provided three-view concept with thick sculpted ears, organic torso, long arms, claws, digitigrade legs, wet black-green skin, red ear membranes, vertical mouth, ribs, spine, and tendons.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build_model()
    export_files()
    for camera_view in ("front", "side", "back"):
        render_preview(camera_view)
    print(f"Wrote Blender SONAR review model to: {OUT}")
