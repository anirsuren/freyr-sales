export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-text-secondary mt-1">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
