export { clamp, lerp, smoothstep, resolveDynamics } from './feel';
export type { Dynamics } from './feel';
export { slewStep, slewLimitForStep, RATE_JUMP_EPSILON, introRate, isSeekJump } from './slew';
export { pchipEvaluate, pchipSlopes, cosineInterpolate } from './pchip';
export { median, movingMedian, weightedMedian } from './median';
export { gaussianSmooth, emaSmooth } from './gaussian';
export {
  buildSpeedCurve,
  rateAt,
  wpmAt,
  emptyCurve,
  clampCurve,
  mapWpmToRate,
  mergeShortChunks,
  instantaneousWpm,
  splitSpeechSegments,
  pauseApproachLeadSec,
  curveBuildInputFromSettings,
} from './curve';
export type { SpeedCurve, CurveBuildOptions, SpeechChunk } from './curve';
export {
  spokenDutyMultiplier,
  wpmWithSpokenDuty,
  WPM_WINDOW_SEC,
  SPOKEN_DUTY_WINDOW_SEC,
} from './spoken-duty';
export {
  wpmAdjustmentCalibration,
  wpmAdjustmentsActive,
  jargonCalibration,
  spokenDutyCalibration,
  SYLLABLE_WEIGHTING_CALIBRATION,
  JARGON_WEIGHT_SHARE,
  TYPICAL_SPOKEN_DUTY_RATIO,
} from './wpm-calibration';
export {
  countSyllables,
  isEasyWord,
  isJargonWord,
  isEnglishLanguageCode,
  easyWordListSize,
  effectiveWords,
  AVG_SYLLABLES_PER_WORD,
} from './syllables';
