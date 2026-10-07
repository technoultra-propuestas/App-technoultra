import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";

const idList = z.array(z.string().uuid()).min(1).max(30);

/**
 * Datos PÚBLICOS de los productos que hay en el carrito (nombre, marca, precio, imagen, referencia). El navegador solo guarda ids; el precio
 * y la disponibilidad se leen siempre de aquí (RLS: solo productos visibles). Un producto oculto o agotado simplemente no vuelve.
 */
export async function GET(request: NextRequest) {
  const ids = idList.safeParse((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids.success) return NextResponse.json({ products: [] }, { headers: { "Cache-Control": "no-store" } });
  const { data } = await createPublicClient().from("products").select("id, slug, name, brand, price, image_url, source_ref").in("id", ids.data).not("source", "is", null);
  return NextResponse.json({ products: (data ?? []).map((p) => ({ ...p, price: Number(p.price) })) }, { headers: { "Cache-Control": "no-store" } });
}
