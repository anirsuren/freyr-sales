import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
} from "@google/genai";
import type { AgentToolDef } from "./claude";

const DEFAULT_LOCATION = "global";
const DEFAULT_MODEL = "gemini-3.5-flash";

export type VertexConfig = {
  project: string;
  location: string;
  model: string;
};

export type VertexAgentResult = {
  text: string;
  dids: string[];
  truncated: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    modelCalls: number;
  };
};

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_VERTEX_STATUS__:
    | { ok: boolean; at: string; error?: string }
    | undefined;
}

let client: GoogleGenAI | null = null;
let clientKey = "";

export function vertexConfig(): VertexConfig | null {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) return null;
  return {
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_LOCATION,
    model: process.env.VERTEX_AI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function isVertexConfigured(): boolean {
  return vertexConfig() !== null;
}

function getClient(): { client: GoogleGenAI; config: VertexConfig } {
  const config = vertexConfig();
  if (!config) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured");
  }
  const key = `${config.project}:${config.location}`;
  if (!client || clientKey !== key) {
    // Authentication deliberately uses Application Default Credentials. Local
    // development can use `gcloud auth application-default login`; AWS ECS
    // uses a Workload Identity Federation credential configuration. No static
    // Google service-account key belongs in this application.
    client = new GoogleGenAI({
      enterprise: true,
      project: config.project,
      location: config.location,
      apiVersion: "v1",
    });
    clientKey = key;
  }
  return { client, config };
}

function noteVertexCall(ok: boolean, error?: unknown) {
  globalThis.__FREYR_VERTEX_STATUS__ = {
    ok,
    at: new Date().toISOString(),
    ...(ok
      ? {}
      : {
          error:
            error instanceof Error
              ? `${error.name}: ${error.message}`.slice(0, 200)
              : String(error).slice(0, 200),
        }),
  };
}

export function vertexStatus(): string {
  if (!isVertexConfigured()) return "not configured";
  const last = globalThis.__FREYR_VERTEX_STATUS__;
  if (!last) return "not called yet";
  return last.ok ? "working" : `failing (${last.error})`;
}

function toolDeclarations(tools: AgentToolDef[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.input_schema,
  }));
}

function addUsage(
  total: VertexAgentResult["usage"],
  response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
) {
  const usage = response.usageMetadata;
  total.inputTokens += usage?.promptTokenCount || 0;
  total.outputTokens += usage?.candidatesTokenCount || 0;
  total.cacheReadTokens += usage?.cachedContentTokenCount || 0;
  total.modelCalls += 1;
}

export function visibleResponseText(
  response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
): string {
  return (response.candidates?.[0]?.content?.parts || [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

function generationConfig(
  systemInstruction: string,
  withTools: boolean,
  declarations: FunctionDeclaration[] = []
): GenerateContentConfig {
  return {
    systemInstruction,
    maxOutputTokens: 1800,
    temperature: 0.2,
    // Agent questions are usually retrieval and routing tasks. Minimal
    // thinking keeps them responsive, while the tool results remain the
    // source of truth. Thought parts are also explicitly excluded below.
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.MINIMAL,
      includeThoughts: false,
    },
    ...(withTools && declarations.length
      ? { tools: [{ functionDeclarations: declarations }] }
      : {}),
  };
}

function normalizeTurns(
  turns: { role: "user" | "assistant"; content: string }[]
): Content[] {
  const contents: Content[] = [];
  for (const turn of turns) {
    const text = turn.content?.trim();
    if (!text) continue;
    const role = turn.role === "assistant" ? "model" : "user";
    const previous = contents[contents.length - 1];
    if (previous?.role === role && previous.parts?.[0]?.text) {
      previous.parts[0].text += `\n\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  while (contents[0]?.role === "model") contents.shift();
  return contents;
}

/**
 * Gemini/Vertex equivalent of the existing Claude read-only tool loop.
 * The route can switch providers with AGENT_PROVIDER=vertex without changing
 * any data-access tool or permission boundary.
 */
export async function vertexConverseAgentic(
  system: string,
  turns: { role: "user" | "assistant"; content: string }[],
  tools: AgentToolDef[],
  runTool: (
    name: string,
    input: unknown
  ) => Promise<{ content: string; did?: string }>,
  maxSteps = 4,
  onText?: (delta: string) => void,
): Promise<VertexAgentResult | null> {
  const contents = normalizeTurns(turns);
  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return null;
  }

  const usage: VertexAgentResult["usage"] = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    modelCalls: 0,
  };
  const dids: string[] = [];

  try {
    const { client: vertex, config } = getClient();
    const declarations = toolDeclarations(tools);
    if (!declarations.length && onText) {
      const stream = await vertex.models.generateContentStream({
        model: config.model,
        contents,
        config: generationConfig(system, false),
      });
      let answer = "";
      let finalChunk: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>> | null = null;
      for await (const chunk of stream) {
        finalChunk = chunk;
        // Streaming chunks are fragments, so preserve their leading/trailing
        // spaces. visibleResponseText trims complete responses and would glue
        // adjacent words together here.
        const delta = (chunk.candidates?.[0]?.content?.parts || [])
          .filter((part) => !part.thought && typeof part.text === "string")
          .map((part) => part.text)
          .join("");
        if (delta) {
          answer += delta;
          onText(delta);
        }
      }
      answer = answer.trim();
      if (!answer) throw new Error("Vertex returned no written answer");
      if (finalChunk) addUsage(usage, finalChunk);
      noteVertexCall(true);
      return {
        text: answer,
        dids,
        truncated: finalChunk?.candidates?.[0]?.finishReason === "MAX_TOKENS",
        usage,
      };
    }
    for (let step = 0; step < maxSteps; step++) {
      const response = await vertex.models.generateContent({
        model: config.model,
        contents,
        config: generationConfig(system, true, declarations),
      });
      addUsage(usage, response);
      const calls = response.functionCalls || [];
      if (!calls.length) {
        const text = visibleResponseText(response);
        if (!text) throw new Error("Vertex returned no written answer");
        noteVertexCall(true);
        return {
          text,
          dids,
          truncated:
            response.candidates?.[0]?.finishReason === "MAX_TOKENS",
          usage,
        };
      }

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);
      const resultParts: NonNullable<Content["parts"]> = [];
      for (const call of calls) {
        const name = call.name || "";
        let result: { content: string; did?: string };
        try {
          result = await runTool(name, call.args || {});
        } catch {
          result = { content: `Couldn't run ${name} right now.` };
        }
        if (result.did) dids.push(result.did);
        resultParts.push({
          functionResponse: {
            id: call.id,
            name,
            response: { output: result.content },
          },
        });
      }
      contents.push({ role: "user", parts: resultParts });
    }

    contents.push({
      role: "user",
      parts: [
        {
          text:
            "Write the final answer now using the information gathered. Do not call another tool.",
        },
      ],
    });
    const final = await vertex.models.generateContent({
      model: config.model,
      contents,
      config: generationConfig(system, false),
    });
    addUsage(usage, final);
    const text = visibleResponseText(final);
    if (!text) throw new Error("Vertex returned no final answer");
    noteVertexCall(true);
    return {
      text,
      dids,
      truncated: final.candidates?.[0]?.finishReason === "MAX_TOKENS",
      usage,
    };
  } catch (error) {
    noteVertexCall(false, error);
    console.error(
      "[agent] Vertex call failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export async function verifyVertexConnection(): Promise<{
  project: string;
  location: string;
  model: string;
  response: string;
}> {
  const { client: vertex, config } = getClient();
  try {
    const response = await vertex.models.generateContent({
      model: config.model,
      contents: "Reply with exactly: vertex-ready",
      config: { maxOutputTokens: 128, temperature: 0 },
    });
    const text = response.text?.trim() || "";
    if (text.toLowerCase() !== "vertex-ready") {
      throw new Error(`Unexpected verification response: ${text || "empty"}`);
    }
    noteVertexCall(true);
    return { ...config, response: text };
  } catch (error) {
    noteVertexCall(false, error);
    throw error;
  }
}
