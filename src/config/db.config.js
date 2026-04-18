module.exports = {
  retryAttempts: 5,

  retryDelay: 2000,

  options: {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 15_000,
    maxPoolSize: 15,
  },
};
