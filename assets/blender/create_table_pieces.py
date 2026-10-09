"""Blender-made web pieces. Run with Blender --background --python this-file.py."""
import bpy
import math
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0, rough=.3):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = .25 if not metal else 0
    return mat

# Each cut has a matching body recess; no textures, rims, or extra downloads.
shapes = json.loads((ROOT / 'src/components/game/gemShapes.json').read_text())
enamel = material('MAT-token', (.025, .25, .105), rough=.6)
enamel.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = .07
symbol = material('MAT-gem', (.9, .93, .87), rough=.8)
symbol.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 0

def export(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT / name), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_animations=False)
    print(f'EXPORTED {name}: {(OUT / name).stat().st_size} bytes')

token_objects = []
for color, points in shapes.items():
    group = bpy.data.objects.new('GEO-token_' + color, None)
    bpy.context.collection.objects.link(group)
    token_objects.append(group)
    segments = 32
    profile = [(.46, -.07), (.482, -.062), (.49, -.042), (.49, .039),
               (.482, .057), (.461, .07), (.30, .067)]
    verts = [(r * math.cos(i * math.tau / segments), r * math.sin(i * math.tau / segments), z)
             for r, z in profile for i in range(segments)]
    faces = [tuple(reversed(range(segments))), tuple(range((len(profile)-1)*segments, len(profile)*segments))]
    for row in range(len(profile)-1):
        for i in range(segments):
            j = (i+1) % segments
            faces.append((row*segments+i, row*segments+j, (row+1)*segments+j, (row+1)*segments+i))
    mesh = bpy.data.meshes.new('MESH-clay-' + color)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    body = bpy.data.objects.new('GEO-token_body_' + color, mesh)
    bpy.context.collection.objects.link(body)
    body.parent = group
    body.data.materials.append(enamel)
    for face in mesh.polygons:
        face.use_smooth = face.index > 1
    outline = [(x*.25, -y*.25) for x, y in points]
    n = len(outline)
    cutverts = [(x, y, z) for z in [.056, .09] for x, y in outline]
    cutfaces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
    for i in range(n):
        j = (i+1) % n
        cutfaces.append((i, j, j+n, i+n))
    cutmesh = bpy.data.meshes.new('MESH-stamp-cutter')
    cutmesh.from_pydata(cutverts, [], cutfaces)
    cutmesh.update()
    cutter = bpy.data.objects.new('GEO-stamp-cutter', cutmesh)
    bpy.context.collection.objects.link(cutter)
    bpy.context.view_layer.objects.active = cutter
    cutter.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    cutter.select_set(False)
    bpy.context.view_layer.objects.active = body
    stamp = body.modifiers.new('Recessed gem stamp', 'BOOLEAN')
    stamp.operation = 'DIFFERENCE'
    stamp.object = cutter
    bpy.ops.object.modifier_apply(modifier=stamp.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    # A central table surrounded by cut facets, with fine engraved gaps.
    inner = [(x*.46, y*.46) for x, y in outline]
    facets = [inner]
    facets.extend([outline[i], outline[(i+1)%n], inner[(i+1)%n], inner[i]] for i in range(n))
    verts, faces = [], []
    for polygon in facets:
        cx = sum(x for x, y in polygon) / len(polygon)
        cy = sum(y for x, y in polygon) / len(polygon)
        inset = [(cx+(x-cx)*.93, cy+(y-cy)*.93, .0565) for x, y in polygon]
        start = len(verts)
        verts.extend(reversed(inset))
        faces.append(tuple(range(start, len(verts))))
    mesh = bpy.data.meshes.new('MESH-inlaid-' + color)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('GEO-cut_jewel_' + color, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = group
    mesh.materials.append(symbol)
    token_objects.extend([body, obj])
export('gemcourt-token.glb', token_objects)
# Separate variants in the editable source only, after the origin-centered export.
for index, color in enumerate(shapes):
    bpy.data.objects['GEO-token_' + color].location = ((index%3)*1.15, (index//3)*1.15, 0)
# Thin ivory paper with generous rounded corners; one shared mesh for every card.
paper = material('MAT-card-stock', (.72, .68, .56), rough=.88)
paper.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 0
radius = .075
points = []
for x, y, angle in [(.61-radius, .854-radius, 0), (-.61+radius, .854-radius, 90),
                    (-.61+radius, -.854+radius, 180), (.61-radius, -.854+radius, 270)]:
    for i in range(5):
        a = math.radians(angle + i*22.5)
        points.append((x+radius*math.cos(a), y+radius*math.sin(a)))
verts = [(x, y, z) for z in [-.014, .014] for x, y in points]
n = len(points)
faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
faces.extend((i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n))
mesh = bpy.data.meshes.new('MESH-rounded-paper-stock')
mesh.from_pydata(verts, [], faces)
mesh.update()
card = bpy.data.objects.new('GEO-card_stock', mesh)
bpy.context.collection.objects.link(card)
mesh.materials.append(paper)
export('gemcourt-card.glb', [card])
card.location.x = 2
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets' / 'blender' / 'gemcourt-pieces.blend'))
