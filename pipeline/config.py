"""Shared paths and business assumptions for the RiskRadar pipeline.

Every number a stakeholder might challenge lives here, in one place, so the
business case can be re-run with different assumptions without touching code.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
DB_PATH = ROOT / "data" / "riskradar.db"
SQL_DIR = ROOT / "sql"
REPORTS_DIR = ROOT / "reports"
DASHBOARD_DATA_DIR = ROOT / "dashboard" / "public" / "data"

SEED = 42

# Portfolio shape
N_BORROWERS = 60_000
OBSERVATION_DATE = "2025-06-30"      # features use history up to this date
HISTORY_MONTHS = 6                   # Jan-Jun 2025 instalments feed the model
OUTCOME_WINDOW_MONTHS = 12           # target: 90+ DPD between Jul 2025 and Jun 2026

# Collections business case (see docs/assumptions.md for the reasoning)
CALL_CAPACITY = 0.20                 # team can proactively contact 20% of the book per cycle
CURE_RATE_IF_CONTACTED = 0.30        # share of would-be defaulters an early call prevents
LOSS_GIVEN_DEFAULT = 0.65            # share of exposure lost when an account defaults
COST_PER_CONTACT_INR = 120           # blended cost of one structured outreach

# Risk tiers on predicted 12-month default probability
RISK_TIERS = [
    ("Low", 0.00, 0.05),
    ("Medium", 0.05, 0.15),
    ("High", 0.15, 0.35),
    ("Critical", 0.35, 1.01),
]

# Attributes the model may NOT use; they are only used to audit fairness
PROTECTED_ATTRIBUTES = ["gender", "age"]
