const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;
const { dbOptions } = require("./config");

const guildSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  prefix: { type: String, default: ".", trim: true, minlength: 1, maxlength: 3 },
}, { timestamps: true });

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

const GuildConfig = models.GuildConfig || model("GuildConfig", guildSchema);
const JoinRole    = models.JoinRole    || model("JoinRole", joinRoleSchema);
const Log         = models.Log         || model("Log", logSchema);
const TempBan     = models.TempBan     || model("TempBan", tempBanSchema);
const Warn        = models.Warn        || model("Warn", warnSchema);
const Afk         = models.Afk         || model("Afk", afkSchema);

async function connectDatabase(uri, log) {
  const { retryAttempts, retryDelay, options } = dbOptions;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      await mongoose.connect(uri, options);
      log?.info("Base de datos conectada", { attempt });
      return;
    } catch (err) {
      if (attempt === retryAttempts) {
        log?.error("No se pudo conectar a la base de datos tras varios intentos", { err: err.message });
        throw err;
      }
      const waitMs = retryDelay * Math.pow(2, attempt - 1);
      log?.warn(`Error conectando a DB (intento ${attempt}/${retryAttempts}), reintentando en ${waitMs}ms`, {
        err: err.message,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function closeDatabase(log) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close().catch((err) => {
      log?.error("Error al cerrar la conexión de base de datos", { err: err.message });
    });
    log?.info("Conexión de base de datos cerrada");
  }
}

module.exports = {
  connectDatabase,
  closeDatabase,
  GuildConfig,
  JoinRole,
  Log,
  TempBan,
  Warn,
  Afk,
};
