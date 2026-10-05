import type { Metadata } from "next";
import { AuthShell } from "@/components/ui/AuthShell";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Nueva contraseña", robots: { index: false } };

export default function ResetPage() {
  return (
    <AuthShell title="Nueva contraseña">
      <ResetPasswordForm />
    </AuthShell>
  );
}
