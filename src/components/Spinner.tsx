export function Spinner({
  size = 'sm',
  primary = false,
}: {
  size?: 'sm' | 'lg';
  primary?: boolean;
}) {
  return (
    <span
      className={`spinner ${size === 'lg' ? 'spinner-lg' : ''} ${primary ? 'spinner-primary' : ''}`}
      aria-hidden="true"
    />
  );
}

export function PageLoader({ text = 'Memuat data sistem...' }: { text?: string }) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
      }}
    >
      <Spinner size="lg" primary />
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
        {text}
      </p>
    </div>
  );
}
