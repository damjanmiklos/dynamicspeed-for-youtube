/** Feel-pack mapping for the responsiveness knob. Pure math only. */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export type Dynamics = {
  gaussianSigma: number;
  medianWindowSec: number;
  slewRateLimit: number;
};

export function resolveDynamics(input: {
  responsiveness: number;
  customDynamicsUnlocked: boolean;
  gaussianSigma: number;
  medianWindowSec: number;
  slewRateLimit: number;
}): Dynamics {
  if (input.customDynamicsUnlocked) {
    return {
      gaussianSigma: input.gaussianSigma,
      medianWindowSec: input.medianWindowSec,
      slewRateLimit: input.slewRateLimit,
    };
  }
  const u = smoothstep(input.responsiveness);
  return {
    gaussianSigma: lerp(18, 5, u),
    medianWindowSec: lerp(10, 3, u),
    slewRateLimit: lerp(0.12, 0.9, u),
  };
}
