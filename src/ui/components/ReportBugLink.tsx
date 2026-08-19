const BUG_REPORT_URL =
  'https://github.com/damjanmiklos/dynamicspeed-for-youtube/issues/new?labels=bug';

export function ReportBugLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href={BUG_REPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Report a bug on GitHub"
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:brightness-110 ${
        compact
          ? 'bg-ds-accent px-3 py-1.5 text-xs'
          : 'w-full bg-ds-accent px-3 py-2.5 text-sm'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <circle cx="12" cy="16.2" r="0.8" fill="currentColor" stroke="none" />
      </svg>
      Report a bug
    </a>
  );
}
