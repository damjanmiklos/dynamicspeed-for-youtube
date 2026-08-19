import { clamp } from './feel';

/**
 * Fitted on exported YouTube transcripts (scratch/dynamicspeed-transcript-*.json):
 * geometric mean of duration-weighted chunk WPM vs raw word WPM.
 *
 * These are functions of the *settings*, not of the current video, so relative
 * effects of each tool stay intact and Target WPM can stay in ordinary
 * words-per-minute units.
 */
export const SYLLABLE_WEIGHTING_CALIBRATION = 1.032;
/** Share of effective-word mass that is jargon, so C(j) = 1 + (j − 1) × share. */
export const JARGON_WEIGHT_SHARE = 0.033;
/** Typical voiced fraction of caption-covered speech (not long pauses). */
export const TYPICAL_SPOKEN_DUTY_RATIO = 0.57;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function jargonCalibration(jargonCompensation: number): number {
  const extra = Math.max(0, finite(jargonCompensation, 1) - 1);
  return 1 + extra * JARGON_WEIGHT_SHARE;
}

export function spokenDutyCalibration(strength: number): number {
  const s = clamp(finite(strength, 0), 0, 1);
  if (s <= 0) {
    return 1;
  }
  const rho = clamp(TYPICAL_SPOKEN_DUTY_RATIO, 0.05, 1);
  return 1 - s + s / rho;
}

export function wpmAdjustmentCalibration(input: {
  syllableWeighting: boolean;
  jargonCompensation: number;
  spokenDutyStrength: number;
}): number {
  const syllable = input.syllableWeighting ? SYLLABLE_WEIGHTING_CALIBRATION : 1;
  return (
    syllable *
    jargonCalibration(input.jargonCompensation) *
    spokenDutyCalibration(input.spokenDutyStrength)
  );
}

export function wpmAdjustmentsActive(input: {
  syllableWeighting: boolean;
  jargonCompensation: number;
  spokenDutyStrength: number;
}): boolean {
  return (
    input.syllableWeighting ||
    finite(input.jargonCompensation, 1) > 1 + 1e-9 ||
    finite(input.spokenDutyStrength, 0) > 1e-9
  );
}
