const ids = new Map();

function setId(name, id) {
  if (!name || typeof name !== "string") return;
  ids.set(name, id ?? "0");
}

function getId(name) {
  if (!name || typeof name !== "string") return "0";
  return ids.get(name) ?? "0";
}

module.exports = { setId, getId };
