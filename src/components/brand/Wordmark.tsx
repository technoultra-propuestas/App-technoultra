type Props = { size?: number; className?: string };

/** TECHN⏻ULTRA — el glifo de encendido reemplaza la "O", igual que en el diseño aprobado. */
export function Wordmark({ size = 28, className }: Props) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", fontWeight: 800, fontSize: size, lineHeight: 1 }}
    >
      <span>TECHN</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        style={{ margin: "0 1px" }}
      >
        <path d="M12 3v8" />
        <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
      </svg>
      <span style={{ color: "var(--color-brand)" }}>ULTRA</span>
    </span>
  );
}
