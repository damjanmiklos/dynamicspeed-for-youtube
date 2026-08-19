/**
 * Fitted on exported YouTube transcripts (scratch/dynamicspeed-transcript-*.json).
 *
 * Syllable weighting: pooled E[syllables] / 1.5 across speech tokens (word-equal,
 * jackknife SE ≈ 0.024). Not duration-weighted syllables — that would double-count
 * long words. Chunk WPM ratios are noisier because of merging and WPM clamps.
 *
 * Jargon: geometric mean of duration-weighted chunk WPM vs raw.
 *
 * Spoken-time compensation is not calibrated here. It only blends toward
 * timestamp-span WPM when captions actually leave holes between words; YouTube
 * ASR usually has none, and a global 0.57 "duty" scale was inventing pause
 * mass from a 300 WPM prior that flattened slow vs fast talkers.
 *
 * These are functions of the *settings*, not of the current video, so relative
 * effects of each tool stay intact and Target WPM can stay in ordinary
 * words-per-minute units.
 */
export const SYLLABLE_WEIGHTING_CALIBRATION = 1.045;
/** Share of effective-word mass that is jargon, so C(j) = 1 + (j − 1) × share. */
export const JARGON_WEIGHT_SHARE = 0.033;
/** Spoken-duty no longer assumes a typical voiced fraction. */
export const TYPICAL_SPOKEN_DUTY_RATIO = 1;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function jargonCalibration(jargonCompensation: number): number {
  const extra = Math.max(0, finite(jargonCompensation, 1) - 1);
  return 1 + extra * JARGON_WEIGHT_SHARE;
}

export function spokenDutyCalibration(_strength: number): number {
  return 1;
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
