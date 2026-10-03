import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
} from "@google/genai";
import type { AgentToolDef } from "./claude";
import { completeQaVertexRequest, guardedQaVertexRequest } from "./agentQaBudget";

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
  total.outputTokens += (usage?.candidatesTokenCount || 0) + (usage?.thoughtsTokenCount || 0);
  total.cacheReadTokens += usage?.cachedContentTokenCount || 0;
  total.modelCalls += 1;
}

/**
 * WHAT EACH CALL REALLY COSTS, IN DEVELOPMENT ONLY (Anir, Oct 1: "make a
 * change... and then see if there was a decrease in the cost"). One line per
 * model call: prompt, cached and output tokens, and how big each part sent
 * was, so a change to the prompt can be measured instead of guessed.
 * Production never writes it.
 */
function logDevUsage(
  response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>> | null,
  sizes: { system: number; tools: number; turns: number }
) {
  if (process.env.NODE_ENV === "production" || !response) return;
  const u = response.usageMetadata;
  const line = JSON.stringify({
    at: new Date().toISOString(),
    prompt: u?.promptTokenCount ?? 0,
    cached: u?.cachedContentTokenCount ?? 0,
    output: u?.candidatesTokenCount ?? 0,
    thoughts: u?.thoughtsTokenCount ?? 0,
    systemChars: sizes.system,
    toolChars: sizes.tools,
    turns: sizes.turns,
  });
  void import("node:fs")
    .then((fs) => fs.promises.appendFile("/tmp/freyr-agent-usage.jsonl", `${line}\n`))
    .catch(() => undefined);
}

/**
 * "thought\nYou have no upcoming meetings...": the model sometimes writes its
 * reasoning channel's name as the first line of the visible answer, and a
 * rep's briefing opened with the word "thought" (found testing Sep 30). Real
 * thought parts are dropped by their flag; this is the label written as text.
 */
export const LEADING_THOUGHT_LABEL = /^\s*thought\s*\n/i;

export function visibleResponseText(
  response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
): string {
  return (response.candidates?.[0]?.content?.parts || [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .replace(LEADING_THOUGHT_LABEL, "")
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
    const toolChars = process.env.NODE_ENV === "production" ? 0 : JSON.stringify(declarations).length;
    const callConfig = (withTools: boolean): GenerateContentConfig => ({
      ...generationConfig(system, withTools, declarations),
      httpOptions: { timeout: PER_CALL_TIMEOUT_MS },
      ...(signal ? { abortSignal: signal } : {}),
    });

    /* One step of the conversation, streamed to the listener when there is
       one, reassembled into the same shape either way. */
    const step = async (withTools: boolean): Promise<StepResult> => {
      const request = await guardedQaVertexRequest({ model: config.model, contents, config: callConfig(withTools) });
      const sizes = { system: system.length, tools: toolChars, turns: contents.length };
      // Development only, and only while /tmp/freyr-capture-agent exists:
      // keep the exact request so another model can be tried on identical
      // inputs. Production never writes it.
      if (process.env.NODE_ENV !== "production") {
        void import("node:fs").then((fs) => {
          if (!fs.existsSync("/tmp/freyr-capture-agent")) return;
          const { abortSignal: _ignored, httpOptions: _http, ...rest } = request.config as GenerateContentConfig & { abortSignal?: unknown };
          void _ignored; void _http;
          return fs.promises.writeFile(
            `/tmp/freyr-agent-request-${Date.now()}.json`,
            JSON.stringify({ model: request.model, contents: request.contents, config: rest })
          );
        }).catch(() => undefined);
      }
      if (!onText) {
        const response = await vertex.models.generateContent(request);
        completeQaVertexRequest(request, response.usageMetadata);
        addUsage(usage, response);
        logDevUsage(response, sizes);
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
      // The opening words wait until a "thought" label can be told apart, so it never reaches the screen.
      let head = "";
      let headDone = false;
      const emit = (piece: string) => {
        if (!piece) return;
        text += piece;
        emitted = true;
        onText(piece);
      };
      for await (const chunk of stream) {
        last = chunk;
        for (const part of chunk.candidates?.[0]?.content?.parts || []) {
          if (part.thought) continue;
          parts.push(part);
          // Chunks are fragments, so their leading and trailing spaces are
          // real; trimming here glued adjacent words together.
          if (typeof part.text === "string" && part.text) {
            if (headDone) {
              emit(part.text);
              continue;
            }
            head += part.text;
            if (head.length < 12 && !head.includes("\n")) continue;
            headDone = true;
            emit(head.replace(LEADING_THOUGHT_LABEL, ""));
            head = "";
          }
        }
      }
      if (!headDone && head) emit(head.replace(LEADING_THOUGHT_LABEL, ""));
      if (last) {
        completeQaVertexRequest(request, last.usageMetadata);
        addUsage(usage, last);
      }
      logDevUsage(last, sizes);
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
    const request = await guardedQaVertexRequest({
      model: config.model,
      contents: "Reply with exactly: vertex-ready",
      config: { maxOutputTokens: 128, temperature: 0 },
    });
    const response = await vertex.models.generateContent(request);
    completeQaVertexRequest(request, response.usageMetadata);
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

export type VertexReadPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * ONE MULTIMODAL READ: files in, text out. The agent's file reader uses it to
 * read what text extraction cannot: scanned pages, photos, charts, slides and
 * speech. Kept apart from the conversation loop so a file is read once and the
 * text reused on every later question about it.
 */
export async function vertexReadParts(
  parts: VertexReadPart[],
  options: { maxOutputTokens?: number; timeoutMs?: number } = {},
): Promise<{ text: string; inputTokens: number; outputTokens: number; finishReason?: string }> {
  const { client, config } = getClient();
  const request = await guardedQaVertexRequest({
    model: config.model,
    contents: [{ role: "user", parts }],
    config: {
      maxOutputTokens: options.maxOutputTokens ?? 8192,
      temperature: 0,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL, includeThoughts: false },
      httpOptions: { timeout: options.timeoutMs ?? 180_000 },
    },
  });
  const response = await client.models.generateContent(request);
  completeQaVertexRequest(request, response.usageMetadata);
  logDevUsage(response, { system: 0, tools: 0, turns: 1 });
  return {
    text: visibleResponseText(response),
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0),
    finishReason: response.candidates?.[0]?.finishReason,
  };
}
