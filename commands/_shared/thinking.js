const THINKING_TEXT = "<a:typing:1484407380291616778>  RedBot está pensando...";

async function sendThinkingReply(ctx) {
  const msg = await ctx.send({
    content: THINKING_TEXT,
    allowedMentions: { repliedUser: false },
  });
  if (ctx && msg) ctx._thinkingMessage = msg;
  return msg;
}

async function editThinkingReply(thinking, payload) {
  if (!thinking) return null;
  return thinking.edit(payload);
}

module.exports = { THINKING_TEXT, sendThinkingReply, editThinkingReply };
