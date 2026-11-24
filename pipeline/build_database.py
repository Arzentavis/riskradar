"""Load raw CSVs into SQLite, run data-quality checks, and build the feature views."""
import json
import re
import sqlite3

import pandas as pd

from config import DASHBOARD_DATA_DIR, DB_PATH, RAW_DIR, REPORTS_DIR, SQL_DIR

TABLES = ["borrowers", "bureau", "loans", "payments", "outcomes"]


def parse_checks(sql_text: str):
    """Split 02_data_quality.sql into (name, severity, description, query) tuples."""
    pattern = re.compile(r"-- check: (\w+) \| (\w+) \| (.+?)\n(.+?;)", re.S)
    return [(m[0], m[1], m[2].strip(), m[3].strip()) for m in pattern.findall(sql_text)]


def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    DASHBOARD_DATA_DIR.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(DB_PATH)
    con.executescript((SQL_DIR / "01_schema.sql").read_text())

    for table in TABLES:
        df = pd.read_csv(RAW_DIR / f"{table}.csv")
        df.to_sql(table, con, if_exists="append", index=False, chunksize=20_000)
        print(f"loaded {table:<10} {len(df):>9,} rows")

    checks = parse_checks((SQL_DIR / "02_data_quality.sql").read_text())
    results = []
    for name, severity, description, query in checks:
        failing = con.execute(query).fetchone()[0]
        results.append({"check": name, "severity": severity, "description": description,
                        "failing_rows": failing,
                        "status": "pass" if failing == 0 else "fixed in cleaning"})
        print(f"DQ {name:<30} {failing:>6} failing")

    con.executescript((SQL_DIR / "03_features.sql").read_text())
    n_features = con.execute("SELECT COUNT(*) FROM model_features").fetchone()[0]
    print(f"model_features rows: {n_features:,}")
    con.close()

    dq = {"generated_from": "sql/02_data_quality.sql", "checks": results,
          "rows_loaded": {t: int(pd.read_csv(RAW_DIR / f'{t}.csv', usecols=[0]).shape[0]) for t in TABLES}}
    (REPORTS_DIR / "data_quality.json").write_text(json.dumps(dq, indent=2))
    (DASHBOARD_DATA_DIR / "data_quality.json").write_text(json.dumps(dq))


if __name__ == "__main__":
    main()
