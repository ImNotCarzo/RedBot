// Arranque en modo desarrollo multiplataforma (sin depender de sintaxis de shell).
process.env.NODE_ENV = "development";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "debug";

require("../src/index.js");
