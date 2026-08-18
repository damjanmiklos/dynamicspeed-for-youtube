export function SpeedConflictBanner() {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="ds-speed-conflict mb-2 rounded-lg border-2 border-[#ff4d4d] bg-[#3a1010] px-2.5 py-2 text-[#ffe8e8]"
    >
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#ff8a8a]">
        Speed conflict
      </div>
      <p className="mt-0.5 text-[12px] font-semibold leading-snug">
        Another extension is forcing a fixed playback speed. Turn off that
        extension's speed control, or DynamicSpeed cannot work properly.
      </p>
    </div>
  );
}
