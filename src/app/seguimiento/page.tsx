import type { Metadata } from "next";
import { AuthShell } from "@/components/ui/AuthShell";
import { Alert } from "@/components/ui/form";
import { allow, clientIp } from "@/lib/auth/rate-limit";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = { title: "Consulta tu servicio", robots: { index: false } };

type Tracked = {
  code: string;
  status_label: string;
  received_at: string;
  history: { label: string; at: string }[];
};

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const token = ((await searchParams).t ?? "").trim().toLowerCase();
  let result: Tracked | null = null;
  let error: string | null = null;
  if (token) {
    if (!/^[a-z2-9]{12}$/.test(token)) error = "El código no es válido.";
    else if (!(await allow("track-ip", await clientIp(), 20, 600)))
      error = "Demasiados intentos. Espera unos minutos.";
    else {
      const { data } = await createPublicClient().rpc("track_ticket", { p_token: token });
      result = (data as Tracked | null) ?? null;
      if (!result) error = "No encontramos un servicio con ese código.";
    }
  }
  return (
    <AuthShell
      title="Consulta tu servicio"
      back="/"
      subtitle="Escribe el código de 12 caracteres que te enviamos. No necesitas iniciar sesión."
    >
      <form method="get" className="flex flex-col gap-3">
        <input
          name="t"
          defaultValue={token}
          maxLength={12}
          autoComplete="off"
          autoCapitalize="none"
          aria-label="Código de seguimiento"
          placeholder="abcd2345wxyz"
          className="h-14 rounded-[14px] border-[1.5px] border-line-strong bg-white px-4 text-[17px] font-semibold tracking-wider"
        />
        <button
          type="submit"
          className="min-h-[58px] rounded-2xl bg-brand text-[17px] font-extrabold text-ink"
        >
          Consultar
        </button>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {result ? (
        <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-5">
          <div className="text-[13px] font-bold tracking-[0.04em] text-muted">{result.code}</div>
          <div className="text-[22px] font-extrabold">{result.status_label}</div>
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] font-semibold">
            {result.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{h.label}</span>
                <span className="text-muted">
                  {new Date(h.at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </AuthShell>
  );
}
