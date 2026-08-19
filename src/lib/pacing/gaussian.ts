import type { Sample } from './median';

/** Zero-phase Gaussian via Nadaraya–Watson. Call per speech segment only. */
export function gaussianSmooth(samples: Sample[], sigmaSec: number): Sample[] {
  if (samples.length === 0) {
    return [];
  }
  if (samples.length === 1 || sigmaSec <= 0) {
    return samples.map((sample) => ({ ...sample }));
  }

  const twoSigma2 = 2 * sigmaSec * sigmaSec;
  const radius = sigmaSec * 4;
  const n = samples.length;
  const out: Sample[] = new Array(n);
  let lo = 0;
  let hi = 0;

  for (let i = 0; i < n; i += 1) {
    const t = samples[i].t;
    while (lo < n && t - samples[lo].t > radius) {
      lo += 1;
    }
    if (hi < lo) {
      hi = lo;
    }
    while (hi < n && samples[hi].t - t <= radius) {
      hi += 1;
    }
    let weightSum = 0;
    let valueSum = 0;
    for (let j = lo; j < hi; j += 1) {
      const dt = samples[j].t - t;
      const mass = Math.max(samples[j].weight ?? 1, 1e-6);
      const weight = Math.exp(-(dt * dt) / twoSigma2) * mass;
      weightSum += weight;
      valueSum += weight * samples[j].value;
    }
    out[i] = {
      t,
      value: weightSum === 0 ? samples[i].value : valueSum / weightSum,
      weight: samples[i].weight,
    };
  }
  return out;
}

/** Causal EMA for live / incomplete transcripts. */
export function emaSmooth(samples: Sample[], tauSec: number): Sample[] {
  if (samples.length === 0) {
    return [];
  }
  const out: Sample[] = [{ ...samples[0] }];
  for (let i = 1; i < samples.length; i += 1) {
    const dt = Math.max(0, samples[i].t - samples[i - 1].t);
    const alpha = tauSec <= 0 ? 1 : 1 - Math.exp(-dt / tauSec);
    out.push({
      t: samples[i].t,
      value: out[i - 1].value + alpha * (samples[i].value - out[i - 1].value),
    });
  }
  return out;
}
