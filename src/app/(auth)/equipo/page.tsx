import { redirect } from "next/navigation";

/** Ruta anterior del acceso del personal: ahora es /gestion/login. */
export default function StaffLoginLegacy(): never {
  redirect("/gestion/login");
}
