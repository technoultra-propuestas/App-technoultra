import { signOutAction } from "@/app/(auth)/actions";
import { IconLogout } from "@/components/ui/icons";

/** Salir de la sesión (la acción de servidor cierra la sesión y revoca la cookie). Dos presentaciones: ícono (riel) y fila (menú «Más»). */
export function SignOutIcon({ dark = false }: { dark?: boolean }) {
  return (
    <form action={signOutAction}>
      <button type="submit" aria-label="Cerrar sesión" className={`press flex h-11 w-11 items-center justify-center rounded-[14px] ${dark ? "text-[#C9C9C5] hover:bg-[#1F1F1F]" : "border border-line bg-white text-ink"}`}>
        <IconLogout width={20} height={20} />
      </button>
    </form>
  );
}

export function SignOutRow() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="press flex min-h-[56px] w-full items-center justify-center gap-2 rounded-card border border-line bg-white text-[15px] font-extrabold text-ink shadow-card">
        <IconLogout width={20} height={20} />
        Cerrar sesión
      </button>
    </form>
  );
}
