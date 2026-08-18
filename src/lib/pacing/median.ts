/** Time-based moving median on irregular samples. Same-segment only. */

export type Sample = {
  t: number;
  value: number;
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
    const windowValues: number[] = [];
    for (let j = lo; j < hi; j += 1) {
      windowValues.push(samples[j].value);
    }
    if (windowValues.length === 0) {
      windowValues.push(samples[i].value);
    }
    out[i] = { t, value: median(windowValues) };
  }
  return out;
}
