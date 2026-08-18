/**
 * Monotone cubic interpolation (Fritsch–Carlson PCHIP).
 * Does not overshoot; two-point segments stay in the convex hull.
 */

export function pchipSlopes(x: number[], y: number[]): number[] {
  const n = x.length;
  const m = new Array<number>(n).fill(0);
  if (n < 2) {
    return m;
  }

  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    h[i] = x[i + 1] - x[i];
    d[i] = h[i] === 0 ? 0 : (y[i + 1] - y[i]) / h[i];
  }

  m[0] = d[0];
  m[n - 1] = d[n - 2];

  for (let i = 1; i < n - 1; i += 1) {
    if (d[i - 1] === 0 || d[i] === 0 || d[i - 1] * d[i] < 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }

  for (let i = 0; i < n - 1; i += 1) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }

  return m;
}

export function pchipEvaluate(
  x: number[],
  y: number[],
  m: number[],
  t: number,
): number {
  if (x.length === 0) {
    return 1;
  }
  if (x.length === 1) {
    return y[0];
  }
  if (t <= x[0]) {
    return y[0];
  }
  if (t >= x[x.length - 1]) {
    return y[x.length - 1];
  }

  let lo = 0;
  let hi = x.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x[mid + 1] < t) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const i = lo;
  const h = x[i + 1] - x[i];
  if (h === 0) {
    return y[i];
  }
  const s = (t - x[i]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * y[i] +
    (s3 - 2 * s2 + s) * h * m[i] +
    (-2 * s3 + 3 * s2) * y[i + 1] +
    (s3 - s2) * h * m[i + 1]
  );
}

export function cosineInterpolate(y0: number, y1: number, u: number): number {
  const t = (1 - Math.cos(Math.PI * u)) / 2;
  return y0 * (1 - t) + y1 * t;
}
