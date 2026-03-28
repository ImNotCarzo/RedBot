module.exports = {
  /** Number of connection attempts before giving up. */
  retryAttempts: 5,

  /** Base delay (ms) between retry attempts; doubles on each failure. */
  retryDelay: 2000,

  /** Mongoose connection options. */
  options: {
    serverSelectionTimeoutMS: 10_000,
  },
};
