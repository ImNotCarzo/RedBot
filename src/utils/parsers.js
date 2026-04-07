const { resolveMemberFlexible } = require("../resolvers/member.resolver");
const { resolveRoleFlexible }   = require("../resolvers/role.resolver");
const { resolveChannelFlexible } = require("../resolvers/channel.resolver");
const { resolveAttachmentInput } = require("../resolvers/attachment.resolver");

async function getReferencedMessage(ctx) {
  const message = ctx?.message;
  if (!message?.reference?.messageId) return null;
  try {
    return await message.fetchReference();
  } catch {
    return null;
  }
}

/**
 * Parse positional args from a prefixed command context and map them to the
 * named parameters of the equivalent slash command.
 *
 * @param {import("gralonium").Context} ctx
 * @param {object} slashCommand - The loaded slash command module.
 * @param {string} slashName    - Slash command name (used for special-cases like "translate").
 * @returns {Promise<{ values: Record<string, any>, missingRequired: boolean }>}
 */
async function parsePrefixedArgsForSlash(ctx, slashCommand, slashName) {
  const defs = slashCommand?.params?.params ?? [];
  const args = [...(ctx.args ?? [])];
  const replyMsg = await getReferencedMessage(ctx);
  const values = {};
  let missingRequired = false;

  for (let i = 0; i < defs.length; i++) {
    const def    = defs[i];
    const isLast = i === defs.length - 1;
    const token  = args[0];
    let   value  = null;

    if (def.type === 6) {
      // GuildMember
      if (token) {
        value = await resolveMemberFlexible(ctx, token);
        if (value) args.shift();
      } else if (replyMsg?.author?.id) {
        value = await resolveMemberFlexible(ctx, replyMsg.author.id);
      }
    } else if (def.type === 8) {
      // Role
      if (token) {
        value = await resolveRoleFlexible(ctx, token);
        if (value) args.shift();
      }
    } else if (def.type === 7) {
      // Channel
      if (token) {
        value = await resolveChannelFlexible(ctx, token);
        if (value) args.shift();
      }
    } else if (def.type === 11) {
      // Attachment
      value = resolveAttachmentInput(ctx, token);
      if (!value) {
        value = replyMsg?.attachments?.values()?.next()?.value ?? null;
      }
      if (!ctx.message?.attachments?.size && value) args.shift();
    } else if (def.type === 3) {
      // String
      if (args.length) {
        if (slashName === "translate" && def.name === "texto") {
          value = args.splice(0).join(" ");
        } else if (isLast || slashName === "resume") {
          value = args.splice(0).join(" ");
        } else {
          value = args.shift();
        }
      } else if (def.required && replyMsg?.content?.trim()) {
        value = replyMsg.content.trim();
      }
    } else if (args.length) {
      value = args.shift();
    }

    const normalizedValue = value ?? null;
    values[def.name] = normalizedValue;
    if (def.required && normalizedValue === null) missingRequired = true;
  }

  return { values, missingRequired };
}

module.exports = { parsePrefixedArgsForSlash };
