import bpy
import os
import math
import random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BLEND_PATH = os.path.join(os.path.dirname(__file__), 'gemcourt_board.blend')
GLB_PATH = os.path.join(ROOT, 'public', 'models', 'gemcourt-board.glb')
os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)

def material(name, color, metallic=0.0, roughness=0.45):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if 'Coat Weight' in shader.inputs:
        shader.inputs['Coat Weight'].default_value = 0.24 if metallic == 0 else 0.45
        shader.inputs['Coat Roughness'].default_value = 0.28
    return mat

wood = material('MAT-board_walnut', (0.19, 0.095, 0.038), roughness=0.27)
edge = material('MAT-board_edge_dark', (0.075, 0.034, 0.015), roughness=0.31)
gold = material('MAT-board_brass', (0.72, 0.43, 0.11), metallic=1.0, roughness=0.32)
felt = material('MAT-board_midnight_felt', (0.025, 0.055, 0.12), roughness=0.92)

def surface_texture(mat, name, base, woodgrain=False):
    """Small original image textures export with glTF, unlike procedural shader nodes."""
    rng = random.Random(42)
    size = 256
    image = bpy.data.images.new(name, width=size, height=size)
    pixels = []
    for y in range(size):
        for x in range(size):
            noise = rng.uniform(-.035, .035)
            grain = math.sin(y * .57 + math.sin(x * .035) * 2.8) * .065 if woodgrain else 0
            value = 1 + noise + grain
            pixels.extend([min(1, channel * value) for channel in base] + [1])
    image.pixels = pixels
    image.pack()
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

surface_texture(wood, 'Walnut grain', (.38, .235, .14), True)
surface_texture(felt, 'Woven midnight felt', (.095, .135, .19))

def rounded_box(name, dimensions, location, mat, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Hand softened edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        mod.limit_method = 'ANGLE'
        obj.modifiers.new('Polished face normals', 'WEIGHTED_NORMAL')
    return obj

# Solid wooden game-board body with a beveled, rounded profile.
body = rounded_box('GEO-gameboard_walnut_base', (13.0, 9.5, 0.58), (0, 0, 0), wood, 0.34)
rounded_box('GEO-gameboard_lower_shadow', (12.55, 9.05, 0.18), (0, 0, -0.31), edge, 0.12)

# Recess-like felt center sits below the raised timber lip; it is a separate mesh
# so the board reads as a physical tray under the game's cards and token stacks.
rounded_box('GEO-gameboard_inset_felt', (11.82, 8.32, 0.12), (0, 0, 0.30), felt, 0.22)

# Fine brass pinstripes define the inner edge of the wooden rail.
rounded_box('GEO-board_brass_rail_top', (11.92, 0.024, 0.018), (0, 4.25, 0.355), gold, 0.009)
rounded_box('GEO-board_brass_rail_bottom', (11.92, 0.024, 0.018), (0, -4.25, 0.355), gold, 0.009)
rounded_box('GEO-board_brass_rail_left', (0.024, 8.44, 0.018), (-6.08, 0, 0.355), gold, 0.009)
rounded_box('GEO-board_brass_rail_right', (0.024, 8.44, 0.018), (6.08, 0, 0.355), gold, 0.009)

bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format='GLB', export_apply=True, export_materials='EXPORT', export_image_format='AUTO', export_yup=True, export_animations=False, export_normals=True)
print(f'BLEND:{BLEND_PATH}')
print(f'GLB:{GLB_PATH}:{os.path.getsize(GLB_PATH)} bytes')
