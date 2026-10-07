/** Optimiza una URL de Cloudinary (formato y calidad automáticos, ancho acotado). Otras URLs se usan tal cual. Módulo neutro: sirve en servidor y cliente. */
export const optimizedImage = (url: string, width: number) =>
  url.includes("/image/upload/") && !/\/image\/upload\/[^/]*(f_auto|w_\d)/.test(url) ? url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width}/`) : url;
