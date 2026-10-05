import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen-dvh pt-safe pb-safe flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-[13px] font-extrabold tracking-[0.08em] text-brand">404</div>
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">No encontramos esa página</h1>
      <p className="m-0 max-w-[360px] text-base leading-normal text-muted">Puede que el enlace haya cambiado o que no tengas acceso a este contenido.</p>
      <Link href="/" className="inline-flex min-h-[52px] items-center rounded-2xl bg-brand px-7 text-[16px] font-extrabold text-ink no-underline">
        Ir al inicio
      </Link>
    </main>
  );
}
