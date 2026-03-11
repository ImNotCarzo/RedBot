const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: "AIzaSyBG3pP8YwEDrNnYbJW6Dh8B5v5vEYulaU4"
});

async function main() {
  const models = await ai.models.list();
  for await (const model of models) {
    console.log(model.name);
  }
}
main();