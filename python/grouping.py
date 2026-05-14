import json
from collections import defaultdict
from pathlib import Path


input_path = Path("json/elements.json")
output_path = Path("json/groups.json")

if not input_path.exists():
    print(f"❌ Arquivo não encontrado: {input_path}")
    raise SystemExit(1)

with open(input_path, "r", encoding="utf-8") as file:
    elements = json.load(file)

groups = defaultdict(list)

for element in elements:
    groups[element.get("type", "Unknown")].append(element)

group_data = []

for group_type, items in sorted(groups.items()):
    group_data.append({
        "type": group_type,
        "count": len(items),
        "elements": items,
    })

with open(output_path, "w", encoding="utf-8") as file:
    json.dump(group_data, file, indent=2, ensure_ascii=False)

print(f"✅ {len(group_data)} grupos gerados")
print("✅ groups.json gerado")