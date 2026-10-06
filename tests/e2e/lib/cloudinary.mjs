// Limpieza de los activos que las pruebas suben a Cloudinary (carpetas de tickets de la base LOCAL y la sonda de pruebas).
// Solo borra con prefijos de pruebas explícitos; nunca toca carpetas de tickets que no existan en la base local de pruebas.
export async function deleteTestAssets(env, prefixes) {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = env;
  if (!cloud || !key || !secret) return { deleted: 0, skipped: true };
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  let deleted = 0;
  for (const prefix of prefixes) {
    if (!/^technoultra\/(tickets\/[0-9a-f-]{36}|e2e-probe)$/.test(prefix)) continue;
    for (const type of ["image", "video"]) {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/${type}/authenticated?prefix=${encodeURIComponent(prefix + "/")}`, { method: "DELETE", headers: { Authorization: `Basic ${auth}` } });
      const j = await res.json().catch(() => ({}));
      deleted += Object.keys(j.deleted ?? {}).length;
    }
  }
  return { deleted, skipped: false };
}
