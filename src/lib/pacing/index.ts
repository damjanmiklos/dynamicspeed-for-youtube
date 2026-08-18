export { clamp, lerp, smoothstep, resolveDynamics } from './feel';
export type { Dynamics } from './feel';
export { slewStep, RATE_JUMP_EPSILON } from './slew';
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
  countSyllables,
  isEasyWord,
  isJargonWord,
  effectiveWords,
  AVG_SYLLABLES_PER_WORD,
} from './syllables';
