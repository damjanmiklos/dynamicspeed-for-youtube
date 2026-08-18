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
  return samples.map((sample, index) => {
    const windowValues: number[] = [];
    for (let j = 0; j < samples.length; j += 1) {
      if (Math.abs(samples[j].t - sample.t) <= half) {
        windowValues.push(samples[j].value);
      }
    }
    if (windowValues.length === 0) {
      windowValues.push(sample.value);
    }
    return { t: sample.t, value: median(windowValues) };
  });
}
