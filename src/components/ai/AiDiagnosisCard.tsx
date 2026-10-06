import { Card } from "@/components/ui/layout";

type Output = {
  summary?: string;
  causes?: { text: string; likelihood: "high" | "medium" | "low" }[];
};
export type AiRow = Row;
type Row = { id: string; output: Output; urgency: string | null; disclaimer: string; validation_status: string; model: string };

const VALIDATION: Record<string, string> = {
  pending: "Pendiente de validación técnica",
  validated: "Validado por el técnico",
  edited: "Ajustado por el técnico",
  rejected: "Descartado por el técnico",
};

/** Muestra SIEMPRE el aviso de diagnóstico preliminar y el estado de validación humana. */
export function AiDiagnosisCard({ row, audience, children }: { row: Row; audience: "client" | "staff"; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">Diagnóstico preliminar con IA</h2>
        <span className="rounded-full bg-[#FFF0DD] px-3 py-1 text-[12px] font-extrabold text-[#7A3E00]">{VALIDATION[row.validation_status] ?? row.validation_status}</span>
      </div>
      <div className="rounded-[12px] bg-[#FFF0DD] px-3 py-2 text-[13px] font-bold text-[#7A3E00]">{row.disclaimer}</div>
      {row.output.summary ? <p className="m-0 text-[15px] leading-normal">{row.output.summary}</p> : null}
      {(row.output.causes ?? []).length > 0 ? (
        <ul className="m-0 list-disc pl-5 text-[15px]">
          {(row.output.causes ?? []).map((c, i) => (
            <li key={i}>{c.text}</li>
          ))}
        </ul>
      ) : null}
      {audience === "staff" ? <p className="m-0 text-[12px] text-muted">Modelo: {row.model} · Urgencia: {row.urgency ?? "—"}</p> : null}
      {children}
    </Card>
  );
}
