// The actual Microsoft Teams mark (purple squircle + white "T" + person
// bubble) — used on the "message on Teams" buttons instead of a generic chat
// icon (Suren: "put the actual Microsoft Teams logo there").
export function TeamsIcon({
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
      <circle cx="18" cy="6.2" r="3.2" fill="#7B83EB" />
      <path
        d="M21.4 10.6h-3.1v4.9a3.4 3.4 0 003.4 3.4 2 2 0 002-2v-4.9a1.4 1.4 0 00-1.4-1.4z"
        fill="#5059C9"
      />
      <rect x="3" y="6.5" width="13" height="13" rx="2.6" fill="#5059C9" />
      <path
        d="M6.2 10h6.6M9.5 10v6.4"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
