"""Run with Blender --background --python scripts/blender/create_assets.py.

Creates original Splendor assets; no external textures or asset licenses needed.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / '3d'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.36, .42, .55, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45

def material(name, rgb, metal=0, rough=.22):
    mat = bpy.data.materials.new('MAT-' + name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = .38 if not metal else .0
    mat.diffuse_color = (*rgb, 1)
    return mat

gold = material('brushed-gold', (.83, .57, .20), 1, .24)
velvet = material('midnight-velvet', (.012, .028, .027), 0, .86)
enamel = material('ivory-enamel', (.82, .75, .58), 0, .27)
palette = {'white': (.77, .87, .94), 'blue': (.025, .16, .68),
           'green': (.025, .40, .17), 'red': (.64, .025, .068),
           'black': (.042, .049, .065), 'gold': (.92, .58, .14)}
gems = {c: material(c, rgb, 1 if c == 'gold' else 0, .16) for c, rgb in palette.items()}

def assign(obj, name, mat):
    obj.name = 'GEO-' + name
    obj.data.materials.append(mat)
    return obj

def cylinder(name, radius, depth, loc, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = assign(bpy.context.object, name, mat)
    bevel = obj.modifiers.new('Soft machined edge', 'BEVEL')
    bevel.width = .025
    bevel.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

def ring(name, radius, z, mat, center=(0, 0), minor=.016):
    bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=8, major_radius=radius,
                                   minor_radius=minor, location=(*center, z))
    obj = assign(bpy.context.object, name, mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj

def gem(color, location=(0, 0, 0), scale=1):
    # Closed, flat-shaded brilliant cut with table, crown, girdle and pavilion.
    n = {'white': 8, 'blue': 6, 'green': 8, 'red': 4, 'black': 10, 'gold': 8}[color]
    aspect = (1, .76) if color == 'green' else (1, 1)
    rings = [(.48, .48), (1, .15), (1, .08), (.40, -.38)]
    verts = []
    for radius, z in rings:
        for i in range(n):
            a = 2 * math.pi * i / n + math.pi / 4
            verts.append((radius * math.cos(a) * aspect[0], radius * math.sin(a) * aspect[1], z))
    verts.append((0, 0, -.62))
    faces = [tuple(range(n))]
    for j in range(3):
        for i in range(n):
            k = (i + 1) % n
            if j == 1:
                faces.append((j*n+i, (j+1)*n+i, (j+1)*n+k, j*n+k))
            else:
                faces.extend([(j*n+i, (j+1)*n+i, j*n+k), (j*n+k, (j+1)*n+i, (j+1)*n+k)])
    for i in range(n):
        faces.append((3*n+i, 4*n, 3*n+(i+1)%n))
    mesh = bpy.data.meshes.new('MESH-' + color + '-brilliant')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('GEO-' + color + '-gem', mesh)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.scale = (scale, scale, scale)
    obj.data.materials.append(gems[color])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    return obj

def token(color, x=0, y=0, z=0):
    before = set(bpy.data.objects)
    cylinder(color + '-token', .70, .14, (x, y, z), gems[color])
    cylinder(color + '-inlay', .55, .025, (x, y, z+.082), velvet if color == 'gold' else enamel)
    ring(color + '-gold-rim', .64, z+.07, gold, (x,y))
    ring(color + '-inner-rim', .48, z+.10, gold, (x,y), .012)
    gem(color, (x,y,z+.23), .34)
    for i in range(12):
        a = i * math.tau / 12
        cylinder(color + '-edge-stud', .026, .018, (x+.61*math.cos(a), y+.61*math.sin(a), z+.086), gold, 8)
    return list(set(bpy.data.objects) - before)

def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def light(name, loc, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    point_at(obj, (0,0,0))

light('LIGHT-key', (-3,-4,6), 650, 4, (1,.91,.75))
light('LIGHT-fill', (4,1,4), 450, 3, (.64,.79,1))
light('LIGHT-rim', (-2,4,3), 700, 2, (1,.76,.40))
bpy.ops.object.camera_add(location=(0,-4,6))
camera = bpy.context.object
camera.name = 'CAMERA-product'
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.65
point_at(camera, (0,0,0))
scene.camera = camera

def render(name, objects, size=256):
    meshes = [o for o in scene.objects if o.type == 'MESH']
    for o in meshes:
        o.hide_render = o not in objects
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    for o in meshes:
        o.hide_render = False

for color in palette:
    obj = gem(color)
    render('gem-' + color, [obj])
    bpy.data.objects.remove(obj, do_unlink=True)
    parts = token(color)
    render('token-' + color, parts)
    for obj in parts:
        bpy.data.objects.remove(obj, do_unlink=True)

# Collector's display: velvet inset, double gilded rim, six cut stones and tokens.
cylinder('display-base', 3.25, .26, (0,0,-.22), velvet, 96)
cylinder('display-gold-edge', 3.27, .08, (0,0,-.30), gold, 96)
ring('display-outer-inlay', 3.10, -.078, gold, minor=.023)
ring('display-inner-inlay', 2.95, -.078, gold, minor=.012)
positions = [(-1.65,.6), (0,1.2), (1.65,.6), (-1.55,-1.15), (0,-1.45), (1.55,-1.15)]
for (color, (x,y)) in zip(palette, positions):
    cylinder(color+'-pedestal-rim', .83, .09, (x,y,0), gold)
    cylinder(color+'-pedestal', .79, .16, (x,y,.055), velvet)
    gem(color, (x,y,.53), .63)
    for j in range(2):
        token(color, x*.89+.18, y+.65, .12+j*.16)
for i in range(32):
    a = math.tau*i/32
    cylinder('display-stud', .025, .02, (3.02*math.cos(a),3.02*math.sin(a),-.06), gold, 8)

bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'merchant-display.glb'), export_format='GLB',
                          use_selection=True, export_apply=True, export_animations=False,
                          export_yup=True, export_materials='EXPORT')
camera.location = (7,-10,11)
point_at(camera, (0,0,.15))
camera.data.ortho_scale = 8.5
render('merchant-display', [o for o in scene.objects if o.type == 'MESH'], 1000)
sources = ROOT/'assets'/'blender'
sources.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(sources/'splendor-assets.blend'))
print('SPLENDOR: assets exported to', OUT)
