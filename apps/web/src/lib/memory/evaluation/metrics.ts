export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1))
  ];
}
export function quality(
  expected: readonly string[],
  returned: readonly string[],
) {
  const relevant = new Set(expected),
    seen = new Set<string>();
  const flags: number[] = returned.map((id) => {
    const hit = relevant.has(id) && !seen.has(id);
    seen.add(id);
    return hit ? 1 : 0;
  });
  const rank = flags.indexOf(1);
  const recall = (k: number) =>
    expected.length
      ? flags.slice(0, k).reduce((a, b) => a + b, 0) / relevant.size
      : null;
  const dcg = flags
    .slice(0, 10)
    .reduce((sum, hit, i) => sum + hit / Math.log2(i + 2), 0);
  const ideal = Array.from(
    { length: Math.min(10, relevant.size) },
    (_, i) => 1 / Math.log2(i + 2),
  ).reduce((a, b) => a + b, 0);
  return {
    recallAt1: recall(1),
    recallAt5: recall(5),
    recallAt10: recall(10),
    mrr: expected.length ? (rank < 0 ? 0 : 1 / (rank + 1)) : null,
    ndcgAt10: ideal ? dcg / ideal : null,
    precisionAt5: flags.slice(0, 5).reduce((a, b) => a + b, 0) / 5,
    empty: returned.length === 0,
  };
}
export function pairedBootstrap(differences: number[], rounds = 2000) {
  let state = 39017;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const means = Array.from(
    { length: rounds },
    () =>
      differences.reduce(
        (sum) => sum + differences[Math.floor(random() * differences.length)],
        0,
      ) / differences.length,
  );
  return {
    mean: differences.reduce((a, b) => a + b, 0) / differences.length,
    low: percentile(means, 0.025),
    high: percentile(means, 0.975),
    rounds,
  };
}
