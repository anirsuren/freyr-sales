import "server-only";
import { getMaterialServeUrl } from "./materialStorage";

import { docsStorage } from "./docsStorage";
import { contentTypeForFilename, mirrorMaterialToSupabase } from "./materialStorage";
import { extractFileContent, isReadableFile } from "./fileText";
import {
  isTranscribableFile,
  transcribeMaterial,
} from "./videoTranscribe";
import { saveMaterialText } from "./materialText";

/**
 * TWO SEPARATE JOBS, AND ONLY THE FIRST ONE IS "THE UPLOAD".
 *
 * Anir, Aug 13, after uploads failed on him repeatedly:
 *   "It's two separate things: 1. Get it in the fucking system. 2. Train the
 *    AI on it. At least get it uploaded first before even trying to do the AI
 *    thing."
 *
 * He is right, and this file is that split. Storing the bytes is the upload:
 * the moment storage has the file, the rep is done and the route answers.
 * Reading the words out of it — which is what lets the assistant answer from a
 * deck (Wajeed, Jul 29) — is a SECOND job that happens afterwards and is
 * allowed to fail quietly.
 *
 * Before this, extraction ran inside the upload request. One corrupt pptx, one
 * PDF with a broken xref, one slow read-back, and the endpoint threw 500 and
 * told the rep "Upload failed" about a file that was already sitting safely in
 * the bucket. That is the whole reason sales materials "broke every day".
 *
 * Nothing in here throws. It cannot: every caller invokes it with `void`, and
 * the response has already gone out by then.
 */

/** Documents get read; past this a file is stored but not indexed. No real
 *  deck or transcript comes close, and the ceiling stops one enormous file
 *  from tying up a worker. */
const EXTRACT_LIMIT_BYTES = 150 * 1024 * 1024;
/** The bucket mirror tolerates bigger files than the text reader does. */
const MIRROR_LIMIT_BYTES = EXTRACT_LIMIT_BYTES * 3;

export type IndexOutcome = {
  /** Whether this format can hold text at all. */
  supported: boolean;
  /** Whether we actually got words out of it this time. */
  readable: boolean;
  words: number;
};

/**
 * Read a stored material and save its text, then mirror the bytes into the
 * workspace's own bucket. Safe to call with bytes already in hand (the server
 * upload path has them) or without (the direct-to-S3 path does not).
 *
 * Never throws, never rejects.
 */
export async function indexStoredMaterial(args: {
  offeringId: string;
  path: string;
  filename: string;
  /** Bytes, when the caller already has them — saves a download. */
  bytes?: Buffer | null;
}): Promise<IndexOutcome> {
  const { offeringId, path, filename } = args;
  const supported = isReadableFile(filename);
  let bytes = args.bytes ?? null;
  let readable = false;
  let words = 0;

  try {
    if (!bytes) {
      /**
       * READ IT BACK WITH RETRIES.
       *
       * The object was committed a moment ago and this is a fresh presign
       * against it; asking immediately can lose that race. The first version
       * of this treated one unlucky GET as "this file has no text", wrote an
       * empty entry, and told the owner their PDF was unreadable — it happened
       * to Anir on a PDF that extracts perfectly (Jul 29): 0 words stored, 195
       * words on a retry of the same file 108 seconds later.
       */
      for (const waitMs of [0, 400, 1200, 3000]) {
        if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
        try {
          const presignUrl = await getMaterialServeUrl(path);
          const res = await fetch(presignUrl);
          if (!res.ok) continue;
          const size = Number(res.headers.get("content-length") || 0);
          if (size > MIRROR_LIMIT_BYTES) return { supported, readable, words };
          bytes = Buffer.from(await res.arrayBuffer());
          break;
        } catch {
          // try the next backoff
        }
      }
    }
    if (!bytes) return { supported, readable, words };

    if (supported && bytes.length <= EXTRACT_LIMIT_BYTES) {
      // Extraction is the part most likely to throw on a real-world file.
      // Its failure costs searchability and nothing else.
      let extracted: { text: string; contentDate?: string; archiveMembers?: unknown } =
        { text: "" };
      try {
        extracted = extractFileContent(bytes, filename);
      } catch {
        extracted = { text: "" };
      }
      const text = extracted.text;
      readable = text.length > 0;
      words = text.match(/\S+/g)?.length ?? 0;
      // Only record what we actually read: writing an empty entry for a file
      // we simply could not read would cache the failure, and the assistant
      // would treat a perfectly readable deck as wordless for good.
      if (readable) {
        await saveMaterialText(path, {
          offeringId,
          filename,
          text,
          bytes: bytes.length,
          extractedAt: new Date().toISOString(),
          ...(extracted.contentDate ? { contentDate: extracted.contentDate } : {}),
          ...(extracted.archiveMembers
            ? { archiveMembers: extracted.archiveMembers as never }
            : {}),
        }).catch(() => undefined);
      }
    }

    // MIRROR INTO THE WORKSPACE'S OWN BUCKET (Anir, Aug 12: "store them in
    // supabase storage as well"). Freya.Docs stays the source of truth, so a
    // mirror failure is a no-op — the next backfill picks it up.
    if (bytes.length <= MIRROR_LIMIT_BYTES) {
      await mirrorMaterialToSupabase(
        path,
        bytes,
        contentTypeForFilename(filename)
      ).catch(() => undefined);
    }

    /**
     * A VIDEO HAS NO TEXT TO EXTRACT, SO LISTEN TO IT INSTEAD.
     *
     * extractFileContent returns nothing for a recording, which is what left
     * demo videos reaching the assistant as a filename. Anything with an audio
     * track now goes to speech-to-text and stores the words it hears, so the
     * rest of the app treats a video exactly like a readable document.
     *
     * Last, and awaited inside the same try, because it is the slowest step
     * and everything above it is worth having even if this fails.
     */
    let blockedReason: string | undefined;
    if (!readable && isTranscribableFile(filename)) {
      const heard = await transcribeMaterial({
        offeringId,
        path,
        filename,
        bytes,
      }).catch(() => null);
      if (heard?.transcribed) {
        readable = true;
        words = heard.words;
      } else if (heard?.failure === "blocked") {
        blockedReason = heard.reason;
      } else if (!heard) {
        blockedReason = "the transcriber crashed on this file";
      }
    }

    /**
     * A DEFINITIVE "NOTHING TO READ" IS AN ANSWER, NOT A FAILURE (Anir,
     * Aug 20: his image-only PDF sat on "Freyr AI is reading it…" forever).
     *
     * The no-empty-entries rule above exists so a TRANSIENT failed fetch can
     * never permanently mark a readable deck wordless. But here the bytes
     * were in hand and extraction and transcription both ran and found
     * nothing — asking again gets the same answer. Record it, with the size,
     * so the row can say "no readable text" instead of pretending forever.
     *
     * A BLOCKED TRANSCRIPTION IS NOT THAT ANSWER (Saras, Aug 28: "the videos
     * aren't even working, even though you transcribe it"). Whisper refused
     * every video because the OpenAI account had run out of credit, and each
     * one was filed here as "no readable text" — a permanent verdict on a
     * perfectly good recording, recorded without anyone being told. When we
     * were the thing that failed, the reason is stored INSTEAD, so the file
     * reads as "not transcribed yet, here is why" and can be retried.
     */
    if (!readable) {
      await saveMaterialText(path, {
        offeringId,
        filename,
        text: "",
        bytes: bytes.length,
        extractedAt: new Date().toISOString(),
        ...(blockedReason ? { unreadableReason: blockedReason } : {}),
      }).catch(() => undefined);
    }
  } catch {
    // Indexing is a bonus. The file is stored either way.
  }
  return { supported, readable, words };
}

/** Fire-and-forget wrapper: start indexing and return immediately. The ECS
 *  container keeps running after the response, so the work still completes. */
export function indexStoredMaterialInBackground(args: {
  offeringId: string;
  path: string;
  filename: string;
  bytes?: Buffer | null;
}): void {
  void indexStoredMaterial(args).catch(() => undefined);
}
