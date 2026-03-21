const THINKING_TEXT = "<a:typing:1484407380291616778>  RedBot está pensando...";

async function sendThinkingReply(ctx) {
  return ctx.send({
    content: THINKING_TEXT,
    allowedMentions: { repliedUser: false },
  });
}

async function editThinkingReply(thinking, payload) {
  if (!thinking) return null;
  return thinking.edit(payload);
}

module.exports = { THINKING_TEXT, sendThinkingReply, editThinkingReply };
