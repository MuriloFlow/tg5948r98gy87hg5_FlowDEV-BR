import "server-only";
import { db } from "./db";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const BUCKET = "avatars";

function extensionFor(type: string): string {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/** Envia a foto de perfil para o Supabase Storage e devolve a URL pública. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error("A imagem deve ter no máximo 2 MB.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Formato não suportado. Use JPG, PNG, WebP ou GIF.");
  }

  const path = `${userId}/${Date.now()}.${extensionFor(file.type)}`;
  const body = Buffer.from(await file.arrayBuffer());
  const client = db();

  const { error } = await client.storage.from(BUCKET).upload(path, body, {
    contentType: file.type,
    upsert: true,
    cacheControl: "3600",
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("bucket") && message.includes("not found")) {
      throw new Error(
        "Armazenamento de avatares não configurado. Execute npm run db:push para criar o bucket."
      );
    }
    throw new Error(error.message);
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
