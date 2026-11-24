export type Tier = "Low" | "Medium" | "High" | "Critical";

export interface Summary {
  as_of: string;
  outcome_window: string;
  accounts: number;
  exposure: number;
  default_rate: number;
  expected_loss: number;
  high_or_critical: number;
  currently_delinquent: number;
  auc: number;
  gini: number;
  ks: number;
  uplift_vs_rule: number;
  uplift_vs_rule_pct: number;
  calls: number;
  handed_to_recoveries: number;
  handed_to_recoveries_arrears: number;
}

export interface GroupRow {
  name: string;
  accounts: number;
  exposure: number;
  avg_pd: number;
  actual_rate: number;
  expected_loss: number;
}

export interface Portfolio {
  tiers: GroupRow[];
  products: GroupRow[];
  employment: GroupRow[];
  city_tier: GroupRow[];
  regions: GroupRow[];
  channels: GroupRow[];
  cohorts: GroupRow[];
  pd_histogram: { from: number; to: number; accounts: number; defaults: number }[];
}

export interface Driver {
  feature: string;
  text: string;
  impact: number;
}

export interface Account {
  rank: number;
  loan_id: string;
  borrower_id: string;
  product: string;
  region: string;
  city_tier: number;
  employment: string;
  channel: string;
  income: number;
  emi: number;
  principal: number;
  ead: number;
  pd: number;
  pd_lr: number;
  tier: Tier;
  expected_loss: number;
  current_dpd: number;
  late_months: number;
  bureau_score: number;
  emi_to_income: number;
  reasons: Driver[];
  drivers: Driver[];
  history: { month: string; due: number; paid: number; dpd: number }[];
  outcome: number;
}

export interface ModelMetrics {
  auc: number;
  gini: number;
  ks: number;
  pr_auc: number;
  brier: number | null;
  capture_at_capacity: number;
}

export interface ModelData {
  validation: string;
  metrics: Record<"lightgbm" | "logistic_regression" | "rule_based", ModelMetrics>;
  roc: Record<"lightgbm" | "logistic_regression" | "rule_based", { fpr: number; tpr: number }[]>;
  deciles: { decile: number; accounts: number; defaults: number; avg_pd: number; actual_rate: number; cum_capture: number; lift: number }[];
  calibration: { predicted: number; actual: number; accounts: number }[];
  importance: { feature: string; key: string; mean_abs_shap: number }[];
  trees_per_fold: number[];
  features_used: number;
}

export interface FairRow {
  group: string;
  accounts: number;
  actual_rate: number;
  avg_pd: number;
  flag_rate: number;
  tpr: number;
  fpr: number;
  tpr_pd_only: number;
  avg_exposure: number;
  auc: number;
  tpr_gap_vs_largest: number;
  calibration_ratio: number | null;
}

export interface Fairness {
  policy: string;
  note: string;
  gender: FairRow[];
  age_band: FairRow[];
}

export interface CurvePoint {
  capacity: number;
  defaulters_reached: number;
  loss_prevented: number;
  net_benefit: number;
}

export interface Business {
  assumptions: {
    call_capacity: number;
    cure_rate_if_contacted: number;
    loss_given_default: number;
    cost_per_contact_inr: number;
    accounts: number;
  };
  total_expected_loss_if_no_action: number;
  curves: Record<string, CurvePoint[]>;
  headline: {
    capacity: number;
    model_loss_prevented: number;
    rule_loss_prevented: number;
    random_loss_prevented: number;
    uplift_vs_rule: number;
    uplift_vs_rule_pct: number;
    model_defaulters_reached: number;
    rule_defaulters_reached: number;
    calls: number;
  };
}

export interface DataQuality {
  checks: { check: string; severity: string; description: string; failing_rows: number; status: string }[];
  rows_loaded: Record<string, number>;
}

export interface AppData {
  summary: Summary;
  portfolio: Portfolio;
  queue: Account[];
  model: ModelData;
  fairness: Fairness;
  business: Business;
  dq: DataQuality;
}

export interface Override {
  id: string;
  at: string;
  loan_id: string;
  from_tier: Tier;
  to_tier: Tier;
  reason: string;
  note: string;
  analyst: string;
}
