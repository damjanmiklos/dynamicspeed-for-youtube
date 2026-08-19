import type { WordToken } from '../transcript/types';
import { clamp, resolveDynamics, type Dynamics } from './feel';
import { gaussianSmooth, emaSmooth } from './gaussian';
import { movingMedian, type Sample } from './median';
import { pchipEvaluate, pchipSlopes } from './pchip';
import {
  excludeLongPauseTails,
  SPOKEN_DUTY_WINDOW_SEC,
  wpmWithSpokenDuty,
} from './spoken-duty';
import { effectiveWords } from './syllables';
import { wpmAdjustmentCalibration } from './wpm-calibration';

export type CurveBuildOptions = {
  targetWpm: number;
  minSpeed: number;
  maxSpeed: number;
  minChunkSec: number;
  wpmFloor: number;
  wpmCeil: number;
  longPauseSec: number;
  bRollAcceleration: boolean;
  treatMusicAsBRoll: boolean;
  syllableWeighting: boolean;
  jargonCompensation: number;
  spokenDutyStrength: number;
  causal?: boolean;
  durationHint?: number;
} & Dynamics;

export type SpeedCurve = {
  duration: number;
  knotT: number[];
  knotR: number[];
  slopes: number[];
  wpmT: number[];
  wpmV: number[];
  wpmSlopes: number[];
};

export type SpeechChunk = {
  t0: number;
  t1: number;
  t: number;
  wEff: number;
  wpm: number;
};

type Interval = { t0: number; t1: number; kind: 'speech' | 'pause' | 'music' };

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function mergeShortChunks(
  tokens: WordToken[],
  minChunkSec: number,
  options: Pick<CurveBuildOptions, 'syllableWeighting' | 'jargonCompensation'>,
): SpeechChunk[] {
  const speech = tokens.filter((token) => !token.meta);
  const chunks: SpeechChunk[] = [];
  let acc: SpeechChunk | null = null;

  const flush = () => {
    if (!acc) {
      return;
    }
    acc.t = (acc.t0 + acc.t1) / 2;
    chunks.push(acc);
    acc = null;
  };

  for (const token of speech) {
    const wEff = effectiveWords({
      syllables: token.syllables,
      jargon: token.jargon,
      syllableWeighting: options.syllableWeighting,
      jargonCompensation: options.jargonCompensation,
    });
    if (!acc) {
      acc = { t0: token.t0, t1: token.t1, t: 0, wEff, wpm: 0 };
      continue;
    }

    const gap = token.t0 - acc.t1;
    const accDur = acc.t1 - acc.t0;
    const tokenDur = token.t1 - token.t0;
    const shouldStartNew =
      gap > minChunkSec || (accDur >= minChunkSec && tokenDur >= minChunkSec);

    if (shouldStartNew) {
      flush();
      acc = { t0: token.t0, t1: token.t1, t: 0, wEff, wpm: 0 };
      continue;
    }

    acc.t1 = Math.max(acc.t1, token.t1);
    acc.wEff += wEff;
  }
  flush();
  return chunks;
}

export function instantaneousWpm(
  chunks: SpeechChunk[],
  wpmFloor: number,
  wpmCeil: number,
): SpeechChunk[] {
  return chunks.map((chunk) => {
    const dt = Math.max(chunk.t1 - chunk.t0, 1e-3);
    const raw = (chunk.wEff / dt) * 60;
    const wpm = clamp(finite(raw, wpmFloor), wpmFloor, wpmCeil);
    return { ...chunk, wpm };
  });
}

export function musicIntervals(tokens: WordToken[]): Interval[] {
  return tokens
    .filter((token) => token.meta)
    .map((token) => ({ t0: token.t0, t1: token.t1, kind: 'music' as const }));
}

export function splitSpeechSegments(
  chunks: SpeechChunk[],
  longPauseSec: number,
): SpeechChunk[][] {
  if (chunks.length === 0) {
    return [];
  }
  const segments: SpeechChunk[][] = [[chunks[0]]];
  for (let i = 1; i < chunks.length; i += 1) {
    const gap = chunks[i].t0 - chunks[i - 1].t1;
    if (gap > longPauseSec) {
      segments.push([chunks[i]]);
    } else {
      segments[segments.length - 1].push(chunks[i]);
    }
  }
  return segments;
}

function samplesFrom(chunks: SpeechChunk[]): Sample[] {
  return chunks.map((chunk) => ({ t: chunk.t, value: chunk.wpm }));
}

function applySamples(chunks: SpeechChunk[], samples: Sample[]): SpeechChunk[] {
  return chunks.map((chunk, index) => ({
    ...chunk,
    wpm: samples[index]?.value ?? chunk.wpm,
  }));
}

function scaleChunkWpm(
  chunks: SpeechChunk[],
  scale: number,
  wpmFloor: number,
  wpmCeil: number,
): SpeechChunk[] {
  const s = finite(scale, 1);
  if (!(s > 1e-6) || Math.abs(s - 1) < 1e-9) {
    return chunks;
  }
  return chunks.map((chunk) => ({
    ...chunk,
    wpm: clamp(finite(chunk.wpm, wpmFloor) / s, wpmFloor, wpmCeil),
  }));
}

export function mapWpmToRate(
  wpm: number,
  targetWpm: number,
  minSpeed: number,
  maxSpeed: number,
): number {
  if (!Number.isFinite(wpm) || wpm <= 0) {
    return maxSpeed;
  }
  return clamp(targetWpm / wpm, minSpeed, maxSpeed);
}

function musicCoversGap(
  music: Interval[],
  index: { value: number },
  gapStart: number,
  gapEnd: number,
): boolean {
  let i = index.value;
  while (i < music.length && music[i].t1 <= gapStart) {
    i += 1;
  }
  index.value = i;
  for (let k = i; k < music.length && music[k].t0 < gapEnd; k += 1) {
    if (music[k].t1 > gapStart) {
      return true;
    }
  }
  return false;
}

function addKnot(
  times: number[],
  values: number[],
  t: number,
  value: number,
): void {
  if (!Number.isFinite(t) || !Number.isFinite(value)) {
    return;
  }
  const last = times[times.length - 1];
  if (last != null && t < last) {
    return;
  }
  if (last != null && t === last) {
    values[values.length - 1] = value;
    return;
  }
  times.push(t);
  values.push(value);
}

/**
 * Video seconds to leave max speed before speech resumes.
 * Matches a downward slew of `slewRateLimit` per second of *video* time
 * (wall-clock slew is scaled by the current rate in the controller).
 */
export function pauseApproachLeadSec(
  gapSec: number,
  fromRate: number,
  toRate: number,
  slewRateLimit: number,
): number {
  const gap = Math.max(finite(gapSec, 0), 0);
  const from = Math.max(finite(fromRate, 1), 0.05);
  const to = Math.max(finite(toRate, 1), 0.05);
  const delta = Math.abs(from - to);
  if (gap <= 0 || delta < 1e-4) {
    return 0;
  }
  const slew = Math.max(finite(slewRateLimit, 0.3), 0.05);
  const exact = (delta / slew) * 1.15;
  const hold = Math.min(0.35, gap * 0.15);
  return Math.min(exact, Math.max(0, gap - hold));
}

function addBRollGapKnots(
  knotT: number[],
  knotR: number[],
  gapStart: number,
  gapEnd: number,
  resumeRate: number,
  maxSpeed: number,
  slewRateLimit: number,
): void {
  const gap = gapEnd - gapStart;
  if (!(gap > 0)) {
    return;
  }
  addKnot(knotT, knotR, gapStart <= 0 ? 0 : gapStart + 1e-3, maxSpeed);
  const lead = pauseApproachLeadSec(gap, maxSpeed, resumeRate, slewRateLimit);
  const approachStart = gapEnd - lead;
  if (approachStart > gapStart + 2e-3) {
    addKnot(knotT, knotR, approachStart, maxSpeed);
  }
  const arriveEarly = Math.min(0.1, lead * 0.2);
  const arriveAt = Math.max(gapStart + 2e-3, gapEnd - arriveEarly);
  addKnot(knotT, knotR, arriveAt, resumeRate);
  if (gapEnd > arriveAt + 1e-4) {
    addKnot(knotT, knotR, gapEnd, resumeRate);
  }
}

export function emptyCurve(duration = 1): SpeedCurve {
  return {
    duration: Math.max(duration, 0),
    knotT: [0, Math.max(duration, 0.001)],
    knotR: [1, 1],
    slopes: [0, 0],
    wpmT: [0, Math.max(duration, 0.001)],
    wpmV: [0, 0],
    wpmSlopes: [0, 0],
  };
}

export function buildSpeedCurve(
  tokens: WordToken[],
  options: CurveBuildOptions,
): SpeedCurve {
  const duration = Math.max(
    options.durationHint ?? 0,
    tokens.reduce((max, token) => Math.max(max, token.t1), 0),
  );

  if (tokens.length === 0) {
    return emptyCurve(duration);
  }

  const merged = mergeShortChunks(tokens, options.minChunkSec, options);
  const strength = clamp(finite(options.spokenDutyStrength, 0), 0, 1);
  const prepared =
    strength > 0 ? excludeLongPauseTails(merged, options.longPauseSec) : merged;
  const segments = splitSpeechSegments(prepared, options.longPauseSec);

  const smoothedChunks: SpeechChunk[] = [];
  for (const segment of segments) {
    const withWpm =
      strength > 0
        ? wpmWithSpokenDuty(
            segment,
            strength,
            SPOKEN_DUTY_WINDOW_SEC,
            options.wpmFloor,
            options.wpmCeil,
          )
        : instantaneousWpm(segment, options.wpmFloor, options.wpmCeil);
    const medianed = movingMedian(samplesFrom(withWpm), options.medianWindowSec);
    const smoothed = options.causal
      ? emaSmooth(medianed, options.gaussianSigma)
      : gaussianSmooth(medianed, options.gaussianSigma);
    const scaled = scaleChunkWpm(
      applySamples(withWpm, smoothed),
      wpmAdjustmentCalibration(options),
      options.wpmFloor,
      options.wpmCeil,
    );
    smoothedChunks.push(...scaled);
  }

  if (smoothedChunks.length === 0) {
    return emptyCurve(duration);
  }

  const knotT: number[] = [];
  const knotR: number[] = [];
  const wpmT: number[] = [];
  const wpmV: number[] = [];

  const first = smoothedChunks[0];
  const last = smoothedChunks[smoothedChunks.length - 1];
  const firstRate = mapWpmToRate(
    first.wpm,
    options.targetWpm,
    options.minSpeed,
    options.maxSpeed,
  );
  const lastRate = mapWpmToRate(
    last.wpm,
    options.targetWpm,
    options.minSpeed,
    options.maxSpeed,
  );

  const leadingGap = first.t0;
  if (leadingGap > options.longPauseSec && options.bRollAcceleration) {
    addBRollGapKnots(
      knotT,
      knotR,
      0,
      first.t0,
      firstRate,
      options.maxSpeed,
      options.slewRateLimit,
    );
  } else {
    addKnot(knotT, knotR, 0, firstRate);
  }
  addKnot(wpmT, wpmV, 0, first.wpm);

  const scanMusic = options.bRollAcceleration && options.treatMusicAsBRoll;
  const music = scanMusic ? musicIntervals(tokens) : [];
  const musicIndex = { value: 0 };

  for (let i = 0; i < smoothedChunks.length; i += 1) {
    const chunk = smoothedChunks[i];
    const rate = mapWpmToRate(
      chunk.wpm,
      options.targetWpm,
      options.minSpeed,
      options.maxSpeed,
    );
    addKnot(knotT, knotR, chunk.t, rate);
    addKnot(wpmT, wpmV, chunk.t, chunk.wpm);

    const next = smoothedChunks[i + 1];
    if (!next) {
      continue;
    }
    const gap = next.t0 - chunk.t1;
    const musicHit =
      scanMusic && musicCoversGap(music, musicIndex, chunk.t1, next.t0);
    const isPause = gap > options.longPauseSec || musicHit;
    if (isPause && options.bRollAcceleration) {
      const nextRate = mapWpmToRate(
        next.wpm,
        options.targetWpm,
        options.minSpeed,
        options.maxSpeed,
      );
      addBRollGapKnots(
        knotT,
        knotR,
        chunk.t1,
        next.t0,
        nextRate,
        options.maxSpeed,
        options.slewRateLimit,
      );
    }
  }

  const trailingGap = duration - last.t1;
  if (trailingGap > options.longPauseSec && options.bRollAcceleration) {
    addKnot(knotT, knotR, last.t1 + 1e-3, options.maxSpeed);
    addKnot(knotT, knotR, duration, options.maxSpeed);
  } else {
    addKnot(knotT, knotR, duration, lastRate);
  }
  addKnot(wpmT, wpmV, duration, last.wpm);

  if (knotT.length === 1) {
    addKnot(knotT, knotR, knotT[0] + 0.001, knotR[0]);
  }
  if (wpmT.length === 1) {
    addKnot(wpmT, wpmV, wpmT[0] + 0.001, wpmV[0]);
  }

  return {
    duration,
    knotT,
    knotR,
    slopes: pchipSlopes(knotT, knotR),
    wpmT,
    wpmV,
    wpmSlopes: pchipSlopes(wpmT, wpmV),
  };
}

export function rateAt(curve: SpeedCurve, time: number): number {
  if (!curve.knotT.length) {
    return 1;
  }
  const value = pchipEvaluate(curve.knotT, curve.knotR, curve.slopes, time);
  return finite(value, 1);
}

export function wpmAt(curve: SpeedCurve, time: number): number {
  if (!curve.wpmT.length) {
    return 0;
  }
  const value = pchipEvaluate(curve.wpmT, curve.wpmV, curve.wpmSlopes, time);
  return Math.max(0, finite(value, 0));
}

export function clampCurve(
  curve: SpeedCurve,
  minSpeed: number,
  maxSpeed: number,
): SpeedCurve {
  return {
    ...curve,
    knotR: curve.knotR.map((rate) => clamp(finite(rate, 1), minSpeed, maxSpeed)),
  };
}

export function curveBuildInputFromSettings(
  settings: {
    targetWpm: number;
    minSpeed: number;
    maxSpeed: number;
    minChunkSec: number;
    wpmFloor: number;
    wpmCeil: number;
    longPauseSec: number;
    bRollAcceleration: boolean;
    treatMusicAsBRoll: boolean;
    syllableWeighting: boolean;
    jargonCompensation: number;
    spokenDutyStrength: number;
    responsiveness: number;
    customDynamicsUnlocked: boolean;
    gaussianSigma: number;
    medianWindowSec: number;
    slewRateLimit: number;
  },
  extra?: Partial<CurveBuildOptions>,
): CurveBuildOptions {
  return {
    ...resolveDynamics(settings),
    targetWpm: settings.targetWpm,
    minSpeed: settings.minSpeed,
    maxSpeed: settings.maxSpeed,
    minChunkSec: settings.minChunkSec,
    wpmFloor: settings.wpmFloor,
    wpmCeil: settings.wpmCeil,
    longPauseSec: settings.longPauseSec,
    bRollAcceleration: settings.bRollAcceleration,
    treatMusicAsBRoll: settings.treatMusicAsBRoll,
    syllableWeighting: settings.syllableWeighting,
    jargonCompensation: settings.jargonCompensation,
    spokenDutyStrength: settings.spokenDutyStrength,
    ...extra,
  };
}
