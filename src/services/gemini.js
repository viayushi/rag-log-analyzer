import { GoogleGenerativeAI } from "@google/generative-ai";

import { getConfig } from "../config/index.js";

let cachedGemini = null;
let cachedApiKey = "";

export function getGeminiClient(configOverride = getConfig()) {
  if (!cachedGemini || cachedApiKey !== configOverride.geminiApiKey) {
    cachedGemini = new GoogleGenerativeAI(configOverride.geminiApiKey);
    cachedApiKey = configOverride.geminiApiKey;
  }

  return cachedGemini;
}
