"""Compare exported GM regions with the official OpenMC Python API."""
import json
import pathlib
import sys
import warnings
import openmc

warnings.filterwarnings('ignore', category=openmc.IDWarning)
root = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/gm-exports')
results = []
for directory in sorted(root.iterdir()):
    materials = openmc.Materials.from_xml(directory/'materials.xml')
    geometry = openmc.Geometry.from_xml(directory/'geometry.xml', materials=materials)
    points = json.loads((directory/'points.json').read_text())
    for point in points:
        cells = [x for x in geometry.find(point['point']) if isinstance(x, openmc.Cell)]
        last = cells[-1] if cells else None
        actual = last.id if last and last.fill_type in ['material', 'void'] else None
        assert actual == point['cell'], (directory.name, point, actual)
    geometry.export_to_xml(directory/'roundtrip.xml')
    results.append({'model':directory.name,'parsed':True,'points':len(points),'mismatchCount':0})
print(json.dumps({'openmc':openmc.__version__,'results':results},indent=2))
