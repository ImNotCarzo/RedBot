const ids = {};

function setId(name, id) {
  ids[name] = id;
}

function getId(name) {
  return ids[name] ?? "0";
}

module.exports = { setId, getId };
