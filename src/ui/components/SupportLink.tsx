const BMC_URL = 'https://www.buymeacoffee.com/damjanmiklos';

export function SupportLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Buy me a coffee"
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium text-[#2a2118] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 ${
        compact
          ? 'bg-[#c4a06a] px-2 py-0.5 text-[10px] leading-none'
          : 'bg-[#c4a06a] px-3 py-1.5 text-xs'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M4 8h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" />
        <path d="M16 9h2.2a2.8 2.8 0 1 1 0 5.6H16" />
        <path d="M8 4s.4 1.4 0 2M11 4s.4 1.4 0 2M14 4s.4 1.4 0 2" />
      </svg>
      Buy me a coffee
    </a>
  );
}
