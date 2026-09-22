import { GoogleGenAI } from "@google/genai";

const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
const model = process.env.VERTEX_AI_MODEL?.trim() || "gemini-3.5-flash";

if (!project) {
  console.error("Vertex AI verification failed: GOOGLE_CLOUD_PROJECT is missing");
  process.exit(1);
}

try {
  const client = new GoogleGenAI({
    enterprise: true,
    project,
    location,
    apiVersion: "v1",
  });
  const response = await client.models.generateContent({
    model,
    contents: "Reply with exactly: vertex-ready",
    // Gemini may spend part of this budget on internal reasoning before emitting
    // the visible three-token response, so keep the smoke-test budget nontrivial.
    config: { maxOutputTokens: 128, temperature: 0 },
  });
  const text = response.text?.trim() || "";
  if (text.toLowerCase() !== "vertex-ready") {
    throw new Error(`Unexpected verification response: ${text || "empty"}`);
  }
  console.log(`Vertex AI is ready: ${project} / ${location} / ${model}`);
} catch (error) {
  console.error(
    "Vertex AI verification failed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
}
