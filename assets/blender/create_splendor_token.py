import bpy
import bmesh
import math
import os


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BLEND_PATH = os.path.join(os.path.dirname(__file__), 'splendor_token.blend')
GLB_PATH = os.path.join(ROOT, 'public', 'models', 'splendor-token.glb')
os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)

# Start with a clean, reproducible scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)


def principled(name, color, metallic=0.0, roughness=0.3, coat=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1.0)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if 'Coat Weight' in shader.inputs:
        shader.inputs['Coat Weight'].default_value = coat
        shader.inputs['Coat Roughness'].default_value = 0.2
    return material


token_mat = principled('MAT-token', (0.8, 0.8, 0.8), roughness=0.24, coat=0.24)
gold_mat = principled('MAT-gold', (0.83, 0.56, 0.18), metallic=1.0, roughness=0.24)
gem_mat = principled('MAT-gem', (0.92, 0.95, 1.0), roughness=0.12, coat=0.4)
gem_light_mat = principled('MAT-gem-light', (1.0, 1.0, 1.0), roughness=0.14, coat=0.35)
gem_shadow_mat = principled('MAT-gem-shadow', (0.55, 0.62, 0.75), roughness=0.2, coat=0.15)

# Thick, softened chip body.
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.5, depth=0.21, location=(0, 0, 0))
body = bpy.context.object
body.name = 'GEO-token_body'
body.data.materials.append(token_mat)
bevel = body.modifiers.new('Soft machined edge', 'BEVEL')
bevel.width = 0.035
bevel.segments = 3
bevel.affect = 'EDGES'
body.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')

# Thin metallic rings inset into the face give the chip a premium edge.
for name, major, minor, z in [
    ('GEO-gold_outer_inlay', 0.445, 0.012, 0.102),
    ('GEO-gold_inner_inlay', 0.345, 0.007, 0.103),
]:
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=8, location=(0, 0, z))
    ring = bpy.context.object
    ring.name = name
    ring.data.materials.append(gold_mat)
    for face in ring.data.polygons:
        face.use_smooth = True

# Eight raised gold lozenges along the rim echo the inlay marks on physical chips.
for index in range(8):
    angle = math.tau * index / 8
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.397 * math.cos(angle), 0.397 * math.sin(angle), 0.108))
    mark = bpy.context.object
    mark.name = f'GEO-rim_mark_{index + 1:02d}'
    mark.dimensions = (0.038, 0.014, 0.012)
    mark.rotation_euler[2] = angle
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mark.data.materials.append(gold_mat)
    edge = mark.modifiers.new('Rounded mark', 'BEVEL')
    edge.width = 0.004
    edge.segments = 2
    mark.modifiers.new('Mark normals', 'WEIGHTED_NORMAL')

# A compact octagonal brilliant cut, modeled as explicit planar facets.
segments = 8
verts = []
rings = [
    (0.155, 0.105),  # pavilion girdle, nested into the chip face
    (0.225, 0.145),  # widest edge
    (0.205, 0.225),  # crown shoulder
    (0.105, 0.365),  # raised table
]
for radius, z in rings:
    for index in range(segments):
        angle = math.tau * index / segments + math.pi / 8
        verts.append((radius * math.cos(angle), radius * math.sin(angle), z))
verts.append((0.0, 0.0, 0.102))  # pavilion point
faces = []
for ring_index in range(len(rings) - 1):
    lower = ring_index * segments
    upper = (ring_index + 1) * segments
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((lower + index, lower + nxt, upper + nxt, upper + index))
for index in range(segments):
    nxt = (index + 1) % segments
    faces.append((index, segments * 4, nxt))
# Correct explicit top table: fan around the final ring using a center vertex.
verts.append((0.0, 0.0, 0.368))
table_center = len(verts) - 1
for index in range(segments):
    faces.append((segments * 3 + index, segments * 3 + (index + 1) % segments, table_center))
mesh = bpy.data.meshes.new('MESH-cut_jewel')
mesh.from_pydata(verts, [], faces)
mesh.materials.append(gem_mat)
mesh.materials.append(gem_light_mat)
mesh.materials.append(gem_shadow_mat)
bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(mesh)
bm.free()
mesh.validate(verbose=True, clean_customdata=True)
mesh.update()
gem = bpy.data.objects.new('GEO-cut_jewel', mesh)
bpy.context.collection.objects.link(gem)
for polygon in mesh.polygons:
    polygon.use_smooth = False
    height = polygon.center.z
    if height < 0.14:
        polygon.material_index = 2 if polygon.index % 2 == 0 else 0
    elif height < 0.27:
        polygon.material_index = 1 if polygon.index % 2 == 0 else 0
    elif height < 0.36:
        polygon.material_index = 0 if polygon.index % 2 == 0 else 1

# Save the editable Blender project and export only the game-ready chip model.
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_yup=True,
    export_animations=False,
    export_normals=True,
)
print(f'BLEND:{BLEND_PATH}')
print(f'GLB:{GLB_PATH}:{os.path.getsize(GLB_PATH)} bytes')
