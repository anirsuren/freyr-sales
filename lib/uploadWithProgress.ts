"use client";

/**
 * POST A FILE AND WATCH IT GO.
 *
 * `fetch` cannot report upload progress — the request body is opaque to it —
 * so anything that shows a percentage has to use XMLHttpRequest. That is why
 * three different upload flows in this app had each grown their own copy of
 * this twenty-line dance; this is the one copy.
 *
 * Anir, Aug 15, on the FDL feature popup: "when I upload an image, first of
 * all, it doesn't look like it's working... it has to show the progress bar.
 * Make sure it shows the progress bar no matter if it's a document or an
 * image." A bare "Uploading…" on a big file is indistinguishable from a frozen
 * form, which is exactly what it looked like.
 *
 * Resolves with the parsed JSON body on 2xx and rejects with the server's own
 * error message otherwise, so callers keep their existing try/catch shape.
 */
export function uploadWithProgress<T = unknown>(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  fieldName = "file"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append(fieldName, file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      // 99, not 100: the last percent belongs to the server writing the file,
      // and a bar that sits full while nothing has come back reads as stuck.
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        /* a non-JSON body is handled by the status check below */
      }
      const errorMessage =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : "Could not upload that file.";
      if (xhr.status >= 200 && xhr.status < 300 && payload) {
        onProgress(100);
        resolve(payload as T);
      } else {
        reject(new Error(errorMessage));
      }
    };
    xhr.onerror = () => reject(new Error("Could not upload that file."));
    xhr.onabort = () => reject(new Error("That upload was cancelled."));
    xhr.send(body);
  });
}
