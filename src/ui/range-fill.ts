import type { CSSProperties } from 'react';

/** Firefox fills via ::-moz-range-progress; the Chrome gradient uses --ds-fill. */
export function rangeFillStyle(percent: number): CSSProperties | undefined {
  if (typeof CSS !== 'undefined' && CSS.supports('-moz-appearance', 'none')) {
    return undefined;
  }
  const fill = Math.min(100, Math.max(0, percent));
  return { ['--ds-fill' as string]: `${fill}%` };
}
