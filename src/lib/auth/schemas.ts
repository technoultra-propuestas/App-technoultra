import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Escribe un correo válido.")
  .max(254, "El correo es demasiado largo.");

/** Misma política que supabase/config.toml (mínimo 10, mayúscula, minúscula y número). */
export const password = z
  .string()
  .min(10, "La contraseña debe tener mínimo 10 caracteres.")
  .max(72, "La contraseña es demasiado larga.")
  .regex(/[a-z]/, "Incluye al menos una minúscula.")
  .regex(/[A-Z]/, "Incluye al menos una mayúscula.")
  .regex(/[0-9]/, "Incluye al menos un número.");

export const otpCode = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, "El código tiene 6 dígitos.");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(3, "Escribe tu nombre completo.").max(120),
  email,
  password,
  terms: z.literal("on", { message: "Debes aceptar los términos para continuar." }),
});
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Escribe tu contraseña.").max(72),
});
export const emailOnlySchema = z.object({ email });
export const verifyOtpSchema = z.object({ email, token: otpCode });
export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] });

/** Celular colombiano de 10 dígitos (acepta espacios, guiones y +57). */
export const phoneCO = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?57/, ""))
  .pipe(z.string().regex(/^3[0-9]{9}$/, "El celular debe tener 10 dígitos y empezar por 3."));

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
};
export const initialState: ActionState = { ok: false };

export function zodToState(err: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors };
}
