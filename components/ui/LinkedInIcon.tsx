// The actual LinkedIn mark (brand blue tile, white "in"), the same treatment
// TeamsIcon gets — a real logo rather than a generic link glyph, so a row of
// contact actions reads at a glance without labels.
export function LinkedInIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <circle cx="6.6" cy="6.6" r="1.9" fill="#fff" />
      <rect x="4.8" y="9.6" width="3.6" height="9.6" rx="0.5" fill="#fff" />
      <path
        d="M10.6 9.6h3.4v1.4a3.6 3.6 0 0 1 3.1-1.6c2.3 0 3.5 1.4 3.5 4v5.8h-3.6v-5.2c0-1.3-.5-2-1.5-2s-1.7.7-1.7 2v5.2h-3.2V9.6Z"
        fill="#fff"
      />
    </svg>
  );
}
