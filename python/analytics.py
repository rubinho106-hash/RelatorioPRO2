import json
from collections import Counter
from pathlib import Path


input_path = Path("json/elements.json")
output_path = Path("json/summary.json")

if not input_path.exists():
    print(f"❌ Arquivo não encontrado: {input_path}")
    raise SystemExit(1)

with open(input_path, "r", encoding="utf-8") as file:
    elements = json.load(file)

type_counts = Counter(element.get("type", "Unknown") for element in elements)
level_counts = Counter(element.get("level") or "Sem nível" for element in elements)

summary = {
    "total_elements": len(elements),
    "by_type": dict(sorted(type_counts.items())),
    "by_level": dict(sorted(level_counts.items())),
}

with open(output_path, "w", encoding="utf-8") as file:
    json.dump(summary, file, indent=2, ensure_ascii=False)

print("✅ summary.json gerado")