import ifcopenshell
import json
from pathlib import Path
from ifcopenshell.util.element import get_container, get_material, get_psets

print("🚀 RelatorioPRO BIM Engine")

# Caminho IFC
IFC_FILE = "sample.ifc"

# Verifica se existe
if not Path(IFC_FILE).exists():
    print(f"❌ Arquivo não encontrado: {IFC_FILE}")
    exit()

# Abre IFC
ifc = ifcopenshell.open(IFC_FILE)

def first_value(values):
    return values[0] if values else None


def safe_name(entity):
    return getattr(entity, "Name", None)


def safe_global_id(entity):
    return getattr(entity, "GlobalId", None)


def safe_level(entity):
    container = get_container(entity)
    return getattr(container, "Name", None) if container else None


def safe_material(entity):
    material = get_material(entity)
    if material is None:
        return None

    return getattr(material, "Name", None) or str(material)


def extract_quantity(entity, keys):
    psets = get_psets(entity)
    for pset in psets.values():
        if not isinstance(pset, dict):
            continue

        for key in keys:
            value = pset.get(key)
            if isinstance(value, (int, float)):
                return value

    return 0


def safe_float(value):
    return value if isinstance(value, (int, float)) else 0


element_types = [
    "IfcWall",
    "IfcSlab",
    "IfcBeam",
    "IfcColumn",
    "IfcDoor",
    "IfcWindow",
]

elements = []

for element_type in element_types:
    for element in ifc.by_type(element_type):
        elements.append({
            "id": safe_global_id(element),
            "name": safe_name(element),
            "type": element.is_a(),
            "level": safe_level(element),
            "material": safe_material(element),
            "volume": safe_float(extract_quantity(element, ["NetVolume", "GrossVolume", "Volume"])),
            "area": safe_float(extract_quantity(element, ["NetArea", "GrossArea", "Area"]))
        })

# Cria pasta JSON
output_dir = Path("json")
output_dir.mkdir(exist_ok=True)

# Exporta JSON
with open(output_dir / "elements.json", "w", encoding="utf-8") as f:
    json.dump(elements, f, indent=2)

print(f"✅ {len(elements)} elementos exportados")
print("✅ elements.json gerado")