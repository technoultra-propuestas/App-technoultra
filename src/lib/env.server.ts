import "server-only";
import { z } from "zod";

/** Secretos: solo se evalúan en servidor. Cada grupo se valida al usarlo (no bloquea fases anteriores). */
const supabaseServer = z.object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(20) });
const aiOpenRouter = z.object({ AI_PROVIDER: z.literal("openrouter"), OPENROUTER_API_KEY: z.string().min(10), AI_MODEL: z.string().min(1) });
const aiGemini = z.object({ GEMINI_API_KEY: z.string().min(10), GEMINI_MODEL: z.string().min(1) });
const mercadopago = z.object({
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(10),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(10),
});
const email = z.object({ RESEND_API_KEY: z.string().min(10), EMAIL_FROM: z.string().min(3) });
const cloudinary = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
});

export const serverEnv = {
  supabase: () => supabaseServer.parse(process.env),
  /** Proveedor de IA: `AI_PROVIDER=openrouter` (por defecto si está definido) o Gemini. Siempre solo en servidor. */
  ai: () => {
    if (process.env.AI_PROVIDER === "openrouter") {
      const c = aiOpenRouter.parse(process.env);
      return { provider: "openrouter" as const, apiKey: c.OPENROUTER_API_KEY, model: c.AI_MODEL };
    }
    const c = aiGemini.parse(process.env);
    return { provider: "gemini" as const, apiKey: c.GEMINI_API_KEY, model: c.GEMINI_MODEL };
  },
  mercadopago: () => mercadopago.parse(process.env),
  email: () => email.parse(process.env),
  cloudinary: () => cloudinary.parse(process.env),
};
