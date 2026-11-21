// STEP 4 — several agents often report the same problem. Merge duplicates before posting.
// Same file + overlapping line range + similar normalized title → one finding.
import type { Finding, Severity } from './schema.ts';

export interface MergedFinding extends Finding {
  /** Every agent that reported this problem. */
  agents: string[];
}

const RANK: Record<Severity, number> = { SUGGESTION: 1, WARNING: 2, CRITICAL: 3 };
const STOP = new Set(['the', 'and', 'for', 'with', 'not', 'without', 'that', 'this', 'from', 'are', 'can', 'may', 'when']);

/** "SQL injection in coupon lookup!" → Set { 'sql', 'injection', 'coupon', 'lookup' } */
export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Jaccard similarity of the two titles' word sets, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const x = titleWords(a);
  const y = titleWords(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / (x.size + y.size - common);
}

const range = (f: Finding) => [Math.min(f.start_line, f.end_line), Math.max(f.start_line, f.end_line)] as const;

function sameProblem(a: Finding, b: Finding): boolean {
  if (a.file !== b.file) return false;
  const [alo, ahi] = range(a);
  const [blo, bhi] = range(b);
  return alo <= bhi && blo <= ahi && titleSimilarity(a.title, b.title) >= 0.4;
}

export function dedupFindings(perAgent: { agent: string; findings: Finding[] }[]): MergedFinding[] {
  const merged: MergedFinding[] = [];
  for (const { agent, findings } of perAgent) {
    for (const finding of findings) {
      const i = merged.findIndex((m) => sameProblem(m, finding));
      if (i === -1) {
        merged.push({ ...finding, agents: [agent] });
        continue;
      }
      const agents = merged[i].agents.includes(agent) ? merged[i].agents : [...merged[i].agents, agent];
      merged[i] = RANK[finding.severity] > RANK[merged[i].severity] ? { ...finding, agents } : { ...merged[i], agents };
    }
  }
  return merged.sort(
    (a, b) => RANK[b.severity] - RANK[a.severity] || a.file.localeCompare(b.file) || a.start_line - b.start_line,
  );
}
