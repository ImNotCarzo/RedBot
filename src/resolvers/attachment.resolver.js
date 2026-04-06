/**
 * Build a pseudo-attachment object from a raw HTTP/S URL.
 *
 * @param {string|null} input - Raw string that might be a URL.
 * @returns {{ name: string, url: string, contentType: string|null, size: number }|null}
 */
function buildAttachmentFromUrl(input) {
  if (!input || !/^https?:\/\//i.test(input)) return null;

  const name = input.split("/").pop()?.split("?")[0] ?? "archivo";
  const ext  = name.split(".").pop()?.toLowerCase() ?? "";

  const imageTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  const audioTypes = { mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm", m4a: "audio/mp4", flac: "audio/flac" };

  return {
    name,
    url:         input,
    contentType: imageTypes[ext] ?? audioTypes[ext] ?? null,
    size:        0,
  };
}

/**
 * Return the first attachment from a prefixed command context:
 * the actual Discord attachment if present, otherwise a URL-derived object.
 *
 * @param {import("gralonium").Context} ctx - Command context.
 * @param {string|null} input           - Fallback URL token from args.
 * @returns {{ name: string, url: string, contentType: string|null, size: number }|import("discord.js").Attachment|null}
 */
function resolveAttachmentInput(ctx, input) {
  const attached = ctx.message?.attachments?.first?.();
  if (attached) return attached;
  return buildAttachmentFromUrl(input);
}

module.exports = { buildAttachmentFromUrl, resolveAttachmentInput };
