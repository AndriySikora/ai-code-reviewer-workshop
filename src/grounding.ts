// STEP 1 — the grounding gate.
// A finding survives ONLY if its file is in the diff and its line range touches a real hunk.
// Everything else is a hallucinated location, so we drop it and say why.
import type { UnifiedDiff } from './diff.ts';
import type { Finding } from './schema.ts';

export interface Dropped {
  finding: Finding;
  reason: string;
}

/** file path → set of NEW-side line numbers covered by the diff */
export function buildLineIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (const file of diff.files) {
    const lines = new Set<number>();
    for (const hunk of file.hunks) for (const n of hunk.newLineNumbers) lines.add(n);
    index.set(file.path, lines);
  }
  return index;
}

export function groundFindings(findings: Finding[], diff: UnifiedDiff): { kept: Finding[]; dropped: Dropped[] } {
  const index = buildLineIndex(diff);
  const kept: Finding[] = [];
  const dropped: Dropped[] = [];
  for (const finding of findings) {
    const lines = index.get(finding.file);
    if (!lines) {
      dropped.push({ finding, reason: `file '${finding.file}' is not in the diff` });
      continue;
    }
    const lo = Math.min(finding.start_line, finding.end_line);
    const hi = Math.max(finding.start_line, finding.end_line);
    let touches = false;
    for (let n = lo; n <= hi && !touches; n++) touches = lines.has(n);
    if (touches) kept.push(finding);
    else dropped.push({ finding, reason: `lines ${lo}-${hi} do not touch any hunk in '${finding.file}'` });
  }
  return { kept, dropped };
}
