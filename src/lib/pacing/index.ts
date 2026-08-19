export { clamp, lerp, smoothstep, resolveDynamics } from './feel';
export type { Dynamics } from './feel';
export { slewStep, RATE_JUMP_EPSILON, introRate, isSeekJump } from './slew';
export { pchipEvaluate, pchipSlopes, cosineInterpolate } from './pchip';
export { median, movingMedian } from './median';
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
  curveBuildInputFromSettings,
} from './curve';
export type { SpeedCurve, CurveBuildOptions, SpeechChunk } from './curve';
export {
  estimateVoicedSec,
  spokenDutyMultiplier,
  excludeLongPauseTails,
  wpmWithSpokenDuty,
  ARTICULATION_REF_WPM,
  ARTICULATION_SEC_PER_WORD,
  SPOKEN_DUTY_WINDOW_SEC,
} from './spoken-duty';
export {
  countSyllables,
  isEasyWord,
  isJargonWord,
  isEnglishLanguageCode,
  easyWordListSize,
  effectiveWords,
  AVG_SYLLABLES_PER_WORD,
} from './syllables';
