/** Time-based moving median on irregular samples. Same-segment only. */

export type Sample = {
  t: number;
  value: number;
  /** Caption span, for duration-weighted smoothing. Defaults to 1. */
  weight?: number;
};

export function median(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function sampleWeight(sample: Sample): number {
  const weight = sample.weight;
  return Number.isFinite(weight) && (weight as number) > 0 ? (weight as number) : 1;
}

export function weightedMedian(items: Array<{ value: number; weight: number }>): number {
  if (items.length === 0) {
    return Number.NaN;
  }
  const total = items.reduce((sum, item) => sum + Math.max(item.weight, 0), 0);
  if (!(total > 0)) {
    return median(items.map((item) => item.value));
  }
  const sorted = [...items].sort((a, b) => a.value - b.value);
  let acc = 0;
  const half = total / 2;
  for (const item of sorted) {
    acc += Math.max(item.weight, 0);
    if (acc >= half) {
      return item.value;
    }
  }
  return sorted[sorted.length - 1].value;
}

export function movingMedian(
  samples: Sample[],
  windowSec: number,
): Sample[] {
  if (samples.length === 0) {
    return [];
  }
  const half = Math.max(windowSec, 0) / 2;
  const n = samples.length;
  const out: Sample[] = new Array(n);
  let lo = 0;
  let hi = 0;

  for (let i = 0; i < n; i += 1) {
    const t = samples[i].t;
    while (lo < n && t - samples[lo].t > half) {
      lo += 1;
    }
    if (hi < lo) {
      hi = lo;
    }
    while (hi < n && samples[hi].t - t <= half) {
      hi += 1;
    }
    const windowItems: Array<{ value: number; weight: number }> = [];
    for (let j = lo; j < hi; j += 1) {
      windowItems.push({ value: samples[j].value, weight: sampleWeight(samples[j]) });
    }
    if (windowItems.length === 0) {
      windowItems.push({ value: samples[i].value, weight: sampleWeight(samples[i]) });
    }
    out[i] = { t, value: weightedMedian(windowItems), weight: samples[i].weight };
  }
  return out;
}
