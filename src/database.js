const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;
const { dbOptions } = require("./config");

const guildSchema = new Schema({
  guildId:        { type: String, required: true, unique: true },
  prefix:         { type: String, default: ".", trim: true, minlength: 1, maxlength: 3 },
  lang:           { type: String, enum: ["es", "en", null], default: null },
  langSource:     { type: String, enum: ["auto", "oauth", "manual"], default: "auto" },
  aiContext:      { type: String, default: "", maxlength: 1000 },
  warnThreshold:  { type: Number, default: 0, min: 0, max: 50 },
  warnMuteMs:     { type: Number, default: 10 * 60 * 1000, min: 60_000, max: 28 * 24 * 60 * 60 * 1000 },
  dramaChannelId: { type: String, default: null },
  voiceHubId:     { type: String, default: null },
  voiceHubCategoryId: { type: String, default: null },
  voiceHubTemplate: { type: String, default: "Sala de {user}", maxlength: 80 },
  voiceAutoStatus: { type: Boolean, default: false },
  welcomeConfig: {
    enabled:      { type: Boolean, default: false },
    channelId:    { type: String, default: null },
    message:      { type: String, default: "¡Bienvenido {user} a **{server}**! Contigo somos {memberCount}.", maxlength: 2000 },
    templateName: { type: String, default: null },
    dmEnabled:    { type: Boolean, default: false },
    dmMessage:    { type: String, default: "", maxlength: 2000 },
  },
  goodbyeConfig: {
    enabled:      { type: Boolean, default: false },
    channelId:    { type: String, default: null },
    message:      { type: String, default: "**{user.tag}** ha salido de **{server}**.", maxlength: 2000 },
    templateName: { type: String, default: null },
  },
  ticketConfig: {
    enabled:          { type: Boolean, default: false },
    categoryId:       { type: String, default: null },
    logChannelId:     { type: String, default: null },
    supportRoleId:    { type: String, default: null },
    welcomeMessage:   { type: String, default: "Describe tu consulta y un miembro del equipo te atenderá pronto.", maxlength: 1500 },
    panelPlaceholder: { type: String, default: "Abrir Tickets", maxlength: 100 },
    categories: [{
      id:            { type: String, required: true },
      label:         { type: String, required: true, maxlength: 80 },
      description:   { type: String, default: "", maxlength: 100 },
      bodyText:      { type: String, default: "", maxlength: 300 },
      emoji:         { type: String, default: null },
      categoryId:    { type: String, default: null },
      supportRoleId: { type: String, default: null },
    }],
    counter:          { type: Number, default: 0 },
  },
  automodConfig: {
    enabled:         { type: Boolean, default: false },
    antiSpam:        { type: Boolean, default: false },
    antiLinks:       { type: Boolean, default: false },
    antiInvites:     { type: Boolean, default: false },
    antiCaps:        { type: Boolean, default: false },
    antiMentions:    { type: Boolean, default: false },
    blockedWords:    { type: [String], default: [] },
    action:          { type: String, enum: ["delete", "warn", "mute", "kick"], default: "warn" },
    muteMs:          { type: Number, default: 5 * 60 * 1000, min: 60_000, max: 28 * 24 * 60 * 60 * 1000 },
    customMessage:   { type: String, default: "", maxlength: 400 },
    ignoredChannels: { type: [String], default: [] },
    ignoredRoles:    { type: [String], default: [] },
  },
  birthdayConfig: {
    enabled:   { type: Boolean, default: false },
    channelId: { type: String, default: null },
    roleId:    { type: String, default: null },
    message:   { type: String, default: "🎂 ¡Feliz cumpleaños {user}! Que tengas un gran día en **{server}**.", maxlength: 1000 },
  },
}, { timestamps: true });

const userConfigSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  lang:   { type: String, enum: ["es", "en"], required: true },
}, { timestamps: true });

const modCaseSchema = new Schema({
  guildId:    { type: String, required: true },
  userId:     { type: String, required: true },
  moderator:  { type: String, required: true },
  type:       {
    type: String,
    required: true,
    enum: ["warn", "mute", "unmute", "kick", "ban", "tempban", "softban", "unban", "auto_mute"],
  },
  reason:     { type: String, default: "Sin razón", maxlength: 500 },
  durationMs: { type: Number, default: null },
  caseId:     { type: String, required: true },
  createdAt:  { type: Date, default: Date.now },
});
modCaseSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });

const joinRoleSchema = new Schema({
  guildId:    { type: String, required: true, unique: true },
  roleId:     { type: String, required: true },
  ignoreBots: { type: Boolean, default: false },
}, { timestamps: true });

const logSchema = new Schema({
  guildId:   { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
}, { timestamps: true });

const tempBanSchema = new Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, required: true },
  unbanAt: { type: Date,   required: true },
}, { timestamps: true });
tempBanSchema.index({ guildId: 1, userId: 1 }, { unique: true });
tempBanSchema.index({ unbanAt: 1 });

const warnSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  moderator: { type: String, required: true },
  reason:    { type: String, default: "Sin razón", trim: true, maxlength: 512 },
  warnId:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
warnSchema.index({ guildId: 1, warnId: 1 }, { unique: true });
warnSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

const afkSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  reason:    { type: String, default: "AFK", trim: true, maxlength: 256 },
  createdAt: { type: Date, default: Date.now },
});
afkSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const reminderSchema = new Schema({
  userId:    { type: String, required: true },
  guildId:   { type: String, default: null },
  channelId: { type: String, default: null },
  text:      { type: String, required: true, trim: true, maxlength: 500 },
  remindAt:  { type: Date, required: true },
}, { timestamps: true });
reminderSchema.index({ userId: 1 });
reminderSchema.index({ remindAt: 1 });

const releaseNoticeSchema = new Schema({
  userId:  { type: String, required: true },
  version: { type: String, required: true },
}, { timestamps: true });
releaseNoticeSchema.index({ userId: 1, version: 1 }, { unique: true });

const imageHistorySchema = new Schema({
  targetType: { type: String, required: true, enum: ["avatar", "server_avatar", "banner", "server_logo", "server_banner"] },
  targetId:   { type: String, required: true },
  url:        { type: String, required: true },
  hash:       { type: String, required: true },
  imageData:  { type: Buffer, default: null },
  mimeType:   { type: String, default: "image/png" },
}, { timestamps: true });
imageHistorySchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

const aiSessionSchema = new Schema({
  sessionKey:       { type: String, required: true, unique: true },
  userId:           { type: String, required: true },
  scope:            { type: String, default: "global" },
  historial:        { type: [Schema.Types.Mixed], default: [] },
  lastBotMessageId: { type: String, default: null },
  expiresAt:        { type: Date, required: true },
}, { timestamps: true });
aiSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const autopurgeSchema = new Schema({
  guildId:      { type: String, required: true },
  channelId:    { type: String, required: true, unique: true },
  maxAgeMs:     { type: Number, required: true },
  ignorePinned: { type: Boolean, default: true },
  filter:       { type: String, enum: ["all", "bots", "humans"], default: "all" },
}, { timestamps: true });
autopurgeSchema.index({ guildId: 1 });

const stickyMessageSchema = new Schema({
  guildId:       { type: String, required: true },
  channelId:     { type: String, required: true, unique: true },
  content:       { type: String, default: "", maxlength: 2000 },
  templateName:  { type: String, default: null },
  lastMessageId: { type: String, default: null },
  enabled:       { type: Boolean, default: true },
}, { timestamps: true });
stickyMessageSchema.index({ guildId: 1 });

const tempChannelSchema = new Schema({
  guildId:   { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  ownerId:   { type: String, default: null },
  kind:      { type: String, enum: ["timed", "voice_hub"], default: "timed" },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });
tempChannelSchema.index({ guildId: 1 });
tempChannelSchema.index({ expiresAt: 1 }, { sparse: true });

const voiceLinkSchema = new Schema({
  guildId:        { type: String, required: true },
  voiceChannelId: { type: String, required: true }, // "any" o channelId
  targetType:     { type: String, enum: ["text", "role"], required: true },
  targetId:       { type: String, required: true },
}, { timestamps: true });
voiceLinkSchema.index({ guildId: 1, voiceChannelId: 1, targetType: 1, targetId: 1 }, { unique: true });

const reactionRolePanelSchema = new Schema({
  guildId:    { type: String, required: true },
  panelId:    { type: String, required: true },
  channelId:  { type: String, required: true },
  messageId:  { type: String, default: null },
  title:      { type: String, default: "Roles", maxlength: 200 },
  description:{ type: String, default: "", maxlength: 2000 },
  mode:       { type: String, enum: ["normal", "unique", "verify", "temp"], default: "normal" },
  durationMs: { type: Number, default: null },
  entries: [{
    key:    { type: String, required: true },
    emoji:  { type: String, default: null },
    label:  { type: String, default: null },
    roleId: { type: String, required: true },
  }],
}, { timestamps: true });
reactionRolePanelSchema.index({ guildId: 1, panelId: 1 }, { unique: true });
reactionRolePanelSchema.index({ messageId: 1 }, { sparse: true });

const tempRoleSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  roleId:    { type: String, required: true },
  source:    { type: String, default: "manual" },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
tempRoleSchema.index({ guildId: 1, userId: 1, roleId: 1 }, { unique: true });
tempRoleSchema.index({ expiresAt: 1 });

const ticketSchema = new Schema({
  guildId:   { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  openerId:  { type: String, required: true },
  claimedBy: { type: String, default: null },
  number:    { type: Number, default: 1 },
  category:  { type: String, default: "General", maxlength: 80 },
  status:    { type: String, enum: ["open", "closed"], default: "open" },
}, { timestamps: true });
ticketSchema.index({ guildId: 1, openerId: 1, status: 1 });

const embedTemplateSchema = new Schema({
  guildId:     { type: String, required: true },
  name:        { type: String, required: true, maxlength: 64 },
  title:       { type: String, default: "", maxlength: 256 },
  description: { type: String, default: "", maxlength: 4000 },
  color:       { type: String, default: "#ff383d" },
  image:       { type: String, default: "" },
  thumbnail:   { type: String, default: "" },
  footer:      { type: String, default: "", maxlength: 2048 },
  authorName:  { type: String, default: "", maxlength: 256 },
}, { timestamps: true });
embedTemplateSchema.index({ guildId: 1, name: 1 }, { unique: true });

const customCommandSchema = new Schema({
  guildId:          { type: String, required: true },
  trigger:          { type: String, required: true, maxlength: 64 },
  matchType:        { type: String, enum: ["exact", "startswith", "contains", "regex"], default: "exact" },
  response:         { type: String, default: "", maxlength: 2000 },
  templateName:     { type: String, default: null },
  authorId:         { type: String, default: null },
  grantRoleAllowed: { type: Boolean, default: false },
}, { timestamps: true });
customCommandSchema.index({ guildId: 1, trigger: 1 }, { unique: true });

const autoTimerSchema = new Schema({
  guildId:      { type: String, required: true },
  timerId:      { type: String, required: true },
  channelId:    { type: String, required: true },
  intervalMs:   { type: Number, required: true },
  nextRunAt:    { type: Date, required: true },
  message:      { type: String, default: "", maxlength: 2000 },
  templateName: { type: String, default: null },
  enabled:      { type: Boolean, default: true },
}, { timestamps: true });
autoTimerSchema.index({ guildId: 1, timerId: 1 }, { unique: true });
autoTimerSchema.index({ nextRunAt: 1 });

const autoRuleSchema = new Schema({
  guildId:        { type: String, required: true },
  name:           { type: String, required: true, maxlength: 64 },
  event:          { type: String, enum: ["message", "member_join", "voice_join"], required: true },
  conditionType:  { type: String, required: true },
  conditionValue: { type: String, default: "", maxlength: 200 },
  actionType:     { type: String, required: true },
  actionValue:    { type: String, default: "", maxlength: 1500 },
  enabled:        { type: Boolean, default: true },
}, { timestamps: true });
autoRuleSchema.index({ guildId: 1, name: 1 }, { unique: true });

const socialFeedSchema = new Schema({
  guildId:       { type: String, required: true },
  platform:      { type: String, enum: ["youtube", "twitch", "tiktok", "reddit", "kick"], required: true },
  account:       { type: String, required: true, maxlength: 128 },
  channelId:     { type: String, required: true },
  customMessage: { type: String, default: "", maxlength: 1000 },
  lastItemId:    { type: String, default: null },
  isLive:        { type: Boolean, default: false },
}, { timestamps: true });
socialFeedSchema.index({ guildId: 1, platform: 1, account: 1 }, { unique: true });

const birthdaySchema = new Schema({
  guildId:            { type: String, required: true },
  userId:             { type: String, required: true },
  day:                { type: Number, required: true, min: 1, max: 31 },
  month:              { type: Number, required: true, min: 1, max: 12 },
  year:               { type: Number, default: null },
  lastCelebratedYear: { type: Number, default: null },
}, { timestamps: true });
birthdaySchema.index({ guildId: 1, userId: 1 }, { unique: true });
birthdaySchema.index({ month: 1, day: 1 });

const inviteStatSchema = new Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, required: true },
  regular: { type: Number, default: 0 },
  fake:    { type: Number, default: 0 },
  bonus:   { type: Number, default: 0 },
  left:    { type: Number, default: 0 },
}, { timestamps: true });
inviteStatSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const inviteJoinSchema = new Schema({
  guildId:   { type: String, required: true },
  memberId:  { type: String, required: true },
  inviterId: { type: String, required: true },
  code:      { type: String, default: null },
  isFake:    { type: Boolean, default: false },
}, { timestamps: true });
inviteJoinSchema.index({ guildId: 1, memberId: 1 }, { unique: true });

const inviteRewardSchema = new Schema({
  guildId:         { type: String, required: true },
  invitesRequired: { type: Number, required: true, min: 1 },
  roleId:          { type: String, required: true },
}, { timestamps: true });
inviteRewardSchema.index({ guildId: 1, invitesRequired: 1 }, { unique: true });

const GuildConfig       = models.GuildConfig       || model("GuildConfig", guildSchema);
const UserConfig        = models.UserConfig        || model("UserConfig", userConfigSchema);
const JoinRole          = models.JoinRole          || model("JoinRole", joinRoleSchema);
const Log               = models.Log               || model("Log", logSchema);
const TempBan           = models.TempBan           || model("TempBan", tempBanSchema);
const Warn              = models.Warn              || model("Warn", warnSchema);
const ModCase           = models.ModCase           || model("ModCase", modCaseSchema);
const Afk               = models.Afk               || model("Afk", afkSchema);
const Reminder          = models.Reminder          || model("Reminder", reminderSchema);
const ReleaseNotice     = models.ReleaseNotice     || model("ReleaseNotice", releaseNoticeSchema);
const ImageHistory      = models.ImageHistory      || model("ImageHistory", imageHistorySchema);
const AiSession         = models.AiSession         || model("AiSession", aiSessionSchema);
const AutopurgeRule     = models.AutopurgeRule     || model("AutopurgeRule", autopurgeSchema);
const StickyMessage     = models.StickyMessage     || model("StickyMessage", stickyMessageSchema);
const TempChannel       = models.TempChannel       || model("TempChannel", tempChannelSchema);
const VoiceLink         = models.VoiceLink         || model("VoiceLink", voiceLinkSchema);
const ReactionRolePanel = models.ReactionRolePanel || model("ReactionRolePanel", reactionRolePanelSchema);
const TempRole          = models.TempRole          || model("TempRole", tempRoleSchema);
const Ticket            = models.Ticket            || model("Ticket", ticketSchema);
const EmbedTemplate     = models.EmbedTemplate     || model("EmbedTemplate", embedTemplateSchema);
const CustomCommand     = models.CustomCommand     || model("CustomCommand", customCommandSchema);
const AutoTimer         = models.AutoTimer         || model("AutoTimer", autoTimerSchema);
const AutoRule          = models.AutoRule          || model("AutoRule", autoRuleSchema);
const SocialFeed        = models.SocialFeed        || model("SocialFeed", socialFeedSchema);
const Birthday          = models.Birthday          || model("Birthday", birthdaySchema);
const InviteStat        = models.InviteStat        || model("InviteStat", inviteStatSchema);
const InviteJoin        = models.InviteJoin        || model("InviteJoin", inviteJoinSchema);
const InviteReward      = models.InviteReward      || model("InviteReward", inviteRewardSchema);

function sanitizeDbError(err) {
  return String(err?.message ?? err ?? "unknown").replace(/(mongodb(?:\+srv)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[REDACTED]@");
}

async function connectDatabase(uri, log) {
  const { retryAttempts, retryDelay, options } = dbOptions;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      await mongoose.connect(uri, options);
      log?.info("Base de datos conectada", { attempt });
      return;
    } catch (err) {
      if (attempt === retryAttempts) {
        log?.error("No se pudo conectar a la base de datos tras varios intentos", { err: sanitizeDbError(err) });
        throw err;
      }
      const waitMs = retryDelay * Math.pow(2, attempt - 1);
      log?.warn(`Error conectando a DB (intento ${attempt}/${retryAttempts}), reintentando en ${waitMs}ms`, {
        err: sanitizeDbError(err),
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function closeDatabase(log) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close().catch((err) => {
      log?.error("Error al cerrar la conexión de base de datos", { err: sanitizeDbError(err) });
    });
    log?.info("Conexión de base de datos cerrada");
  }
}

module.exports = {
  connectDatabase,
  closeDatabase,
  GuildConfig,
  UserConfig,
  JoinRole,
  Log,
  TempBan,
  Warn,
  ModCase,
  Afk,
  Reminder,
  ReleaseNotice,
  ImageHistory,
  AiSession,
  AutopurgeRule,
  StickyMessage,
  TempChannel,
  VoiceLink,
  ReactionRolePanel,
  TempRole,
  Ticket,
  EmbedTemplate,
  CustomCommand,
  AutoTimer,
  AutoRule,
  SocialFeed,
  Birthday,
  InviteStat,
  InviteJoin,
  InviteReward,
};
