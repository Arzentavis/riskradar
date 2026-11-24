"""Run the whole RiskRadar pipeline: data -> SQL -> model -> dashboard JSON."""
import os
import subprocess
import sys
import time
from pathlib import Path

STEPS = ["generate_data.py", "build_database.py", "train_model.py"]
PIPELINE = Path(__file__).parent / "pipeline"

ENV = {**os.environ, "PYTHONIOENCODING": "utf-8"}  # Windows consoles default to cp1252

for step in STEPS:
    start = time.time()
    print(f"\n=== {step} ===", flush=True)
    subprocess.run([sys.executable, step], cwd=PIPELINE, check=True, env=ENV)
    print(f"--- {step} done in {time.time() - start:.1f}s")

print("\nDashboard data written to dashboard/public/data/. Run: cd dashboard && npm run dev")
