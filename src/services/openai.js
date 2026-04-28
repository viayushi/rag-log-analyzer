import OpenAI from "openai";

import { getConfig } from "../config/index.js";

let cachedOpenAI = null;
let cachedApiKey = "";

export function getOpenAIClient(configOverride = getConfig()) {
  if (!cachedOpenAI || cachedApiKey !== configOverride.openaiApiKey) {
    cachedOpenAI = new OpenAI({
      apiKey: configOverride.openaiApiKey,
    });
    cachedApiKey = configOverride.openaiApiKey;
  }

  return cachedOpenAI;
}
