/** Destino al abrir un aviso, según el tipo de entidad y el rol. Solo rutas internas fijas (nunca URLs de la base de datos). */
export function notificationHref(role: "client" | "technician" | "admin", entityType: string | null, entityId: string | null): string | null {
  const staff = role !== "client";
  if (!entityType) return null;
  switch (entityType) {
    case "ticket":
      return entityId ? (staff ? `/b/tickets/${entityId}` : `/c/tickets/${entityId}`) : null;
    case "document":
      return entityId && !staff ? `/c/documentos/${entityId}` : null;
    case "order":
      return entityId && !staff ? `/c/pedidos/${entityId}` : staff ? "/b/pedidos" : null;
    case "payment":
      return staff ? "/b/pedidos" : "/c/pedidos";
    case "quote":
      return staff ? "/b/tickets" : "/c/tickets";
    case "maintenance_plan":
      return staff ? null : "/c/solicitar";
    default:
      return null;
  }
}
