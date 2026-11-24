/** Indian digit grouping: 261461 -> 2,61,461 */
export function indian(n: number, digits = 0): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Full rupee amount: ₹2,61,461 */
export function inr(n: number): string {
  return (n < 0 ? "-₹" : "₹") + indian(Math.abs(n));
}

/** Short rupee amount in crore / lakh, the way Indian finance teams speak. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toLocaleString("en-IN", { maximumFractionDigits: a >= 1e9 ? 0 : 1 })} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
  return sign + inr(a);
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number): string {
  return indian(n);
}
