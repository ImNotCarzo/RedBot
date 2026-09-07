function makeSend(ctx, isSlash) {
  return (payload) => isSlash ? ctx.interaction.editReply(payload) : ctx.send(payload);
}

function hierarchyChecks(ctx, member, action = "actuar sobre") {
  if (member.id === ctx.guild.ownerId)
    return `No puedo ${action} al dueño del servidor`;
  if (member.roles.highest.position >= ctx.guild.members.me.roles.highest.position)
    return `No puedo ${action} alguien con igual o mayor rango que el mío`;
  if (member.roles.highest.position >= ctx.member.roles.highest.position)
    return `No puedes ${action} alguien con igual o mayor rango que el tuyo`;
  return null;
}

const modTag = (ctx) => ctx.user?.tag ?? ctx.author?.tag;

module.exports = {
  makeSend,
  hierarchyChecks,
  modTag,
};
