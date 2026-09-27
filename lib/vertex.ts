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

/** One model call may not hang the whole question (Anir, Sep 26: a question
 *  ran 205 seconds and never answered; the chat gives up at 90). */
const PER_CALL_TIMEOUT_MS = 45_000;

type StepResult = {
  text: string;
  emitted: boolean;
  calls: { id?: string; name?: string; args?: Record<string, unknown> }[];
  content: Content | null;
  finishReason: string | undefined;
};

/**
 * Gemini/Vertex equivalent of the existing Claude read-only tool loop.
 * The route can switch providers with AGENT_PROVIDER=vertex without changing
 * any data-access tool or permission boundary.
 *
 * WORDS ARRIVE AS THEY ARE WRITTEN, TOOLS OR NOT (Anir, Sep 26: "words don't
 * appear as it thinks"). Every step streams when the caller listens: a step
 * that ends in tool calls clears whatever preamble it wrote (`onReset`), and
 * the step that ends in prose is the answer the person watched being typed.
 * Streaming used to be reserved for tool-less questions, which in practice
 * meant almost never.
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
  onReset?: () => void,
  signal?: AbortSignal,
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
    const callConfig = (withTools: boolean): GenerateContentConfig => ({
      ...generationConfig(system, withTools, declarations),
      httpOptions: { timeout: PER_CALL_TIMEOUT_MS },
      ...(signal ? { abortSignal: signal } : {}),
    });

    /* One step of the conversation, streamed to the listener when there is
       one, reassembled into the same shape either way. */
    const step = async (withTools: boolean): Promise<StepResult> => {
      const request = { model: config.model, contents, config: callConfig(withTools) };
      if (!onText) {
        const response = await vertex.models.generateContent(request);
        addUsage(usage, response);
        return {
          text: visibleResponseText(response),
          emitted: false,
          calls: response.functionCalls || [],
          content: response.candidates?.[0]?.content ?? null,
          finishReason: response.candidates?.[0]?.finishReason,
        };
      }
      const stream = await vertex.models.generateContentStream(request);
      const parts: NonNullable<Content["parts"]> = [];
      let text = "";
      let emitted = false;
      let last: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>> | null = null;
      for await (const chunk of stream) {
        last = chunk;
        for (const part of chunk.candidates?.[0]?.content?.parts || []) {
          if (part.thought) continue;
          parts.push(part);
          // Chunks are fragments, so their leading and trailing spaces are
          // real; trimming here glued adjacent words together.
          if (typeof part.text === "string" && part.text) {
            text += part.text;
            emitted = true;
            onText(part.text);
          }
        }
      }
      if (last) addUsage(usage, last);
      return {
        text: text.trim(),
        emitted,
        calls: parts
          .filter((part) => part.functionCall)
          .map((part) => part.functionCall as StepResult["calls"][number]),
        content: parts.length ? { role: "model", parts } : null,
        finishReason: last?.candidates?.[0]?.finishReason,
      };
    };

    for (let round = 0; round < maxSteps; round++) {
      const result = await step(true);
      if (!result.calls.length) {
        if (!result.text) throw new Error("Vertex returned no written answer");
        noteVertexCall(true);
        return {
          text: result.text,
          dids,
          truncated: result.finishReason === "MAX_TOKENS",
          usage,
        };
      }
      // Anything it said before deciding to look something up is not the
      // answer; take it off the screen so the answer starts clean.
      if (result.emitted) onReset?.();
      if (result.content) contents.push(result.content);
      const resultParts: NonNullable<Content["parts"]> = [];
      for (const call of result.calls) {
        const name = call.name || "";
        let output: { content: string; did?: string };
        try {
          output = await runTool(name, call.args || {});
        } catch {
          output = { content: `Couldn't run ${name} right now.` };
        }
        if (output.did) dids.push(output.did);
        resultParts.push({
          functionResponse: {
            id: call.id,
            name,
            response: { output: output.content },
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
    const final = await step(false);
    if (!final.text) throw new Error("Vertex returned no final answer");
    noteVertexCall(true);
    return {
      text: final.text,
      dids,
      truncated: final.finishReason === "MAX_TOKENS",
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
