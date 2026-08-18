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

  return samples.map((sample) => {
    let weightSum = 0;
    let valueSum = 0;
    for (const other of samples) {
      const dt = other.t - sample.t;
      if (Math.abs(dt) > radius) {
        continue;
      }
      const weight = Math.exp(-(dt * dt) / twoSigma2);
      weightSum += weight;
      valueSum += weight * other.value;
    }
    return {
      t: sample.t,
      value: weightSum === 0 ? sample.value : valueSum / weightSum,
    };
  });
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
