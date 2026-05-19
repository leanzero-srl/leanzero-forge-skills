"use strict";

/**
 * multipart-builder — zero-dep RFC-7578 multipart/form-data envelope for a
 * single `file` part.
 *
 * Why this exists:
 *   The naive approach (Buffer.concat(head, fileContents, tail)) reads the
 *   whole file into memory and produces a body that cannot be re-sent on a
 *   429/5xx retry without re-reading the source. This builder returns a
 *   factory function that produces a *fresh Readable* on every call, so the
 *   HTTP client can re-pipe on retry without buffering.
 *
 * Use:
 *   const { buildSingleFileMultipart } = require("./multipartBuilder");
 *   const mp = buildSingleFileMultipart({
 *     filePath: "/tmp/foo.pdf",
 *     filename: "foo.pdf",
 *     mimeType: "application/pdf",
 *   });
 *
 *   // In the HTTP client:
 *   await client.makeMultipartRequest(
 *     "POST",
 *     `/rest/api/3/issue/${key}/attachments?notifyUsers=false`,
 *     mp.contentType,        // Content-Type header value (incl. boundary)
 *     mp.contentLength,      // Content-Length — required, computed exactly
 *     mp.createBodyStream,   // factory: returns a *new* Readable each call
 *     { "X-Atlassian-Token": "no-check" },  // attachment CSRF header
 *   );
 *
 * The form field name is hard-coded to `file` — Jira Cloud's add-attachment
 * endpoint (`POST /rest/api/3/issue/{key}/attachments`) expects exactly that.
 * Confluence uses the same field name on `POST /wiki/rest/api/content/{id}/child/attachment`.
 */

const fs = require("fs");
const crypto = require("crypto");
const { PassThrough } = require("stream");

function buildSingleFileMultipart({ filePath, filename, mimeType }) {
  const stat = fs.statSync(filePath);          // throws if missing/unreadable
  const fileSize = stat.size;

  // Boundary must be ASCII, no slash, no quote. Time-prefix + random suffix
  // keeps collisions astronomically unlikely.
  const boundary =
    "----nodeAttachmentBoundary" +
    Date.now().toString(36) +
    crypto.randomBytes(8).toString("hex");

  // Sanitize the Content-Disposition filename so a quote or CRLF can't escape
  // the header. The on-disk file is unchanged; only the wire-format name is
  // sanitized.
  const safeName = String(filename || "file")
    .replace(/[\r\n]/g, "")
    .replace(/"/g, '\\"');
  const ct = mimeType || "application/octet-stream";

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
      `Content-Type: ${ct}\r\n\r\n`,
    "utf8",
  );
  const closer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

  // EXACT Content-Length, computed without loading the file. The server
  // streams in N bytes and rejects anything that doesn't match.
  const contentLength = preamble.length + fileSize + closer.length;
  const contentType = `multipart/form-data; boundary=${boundary}`;

  function createBodyStream() {
    const out = new PassThrough();
    out.write(preamble);
    const fileStream = fs.createReadStream(filePath);
    fileStream.on("error", (err) => out.destroy(err));
    fileStream.on("end", () => out.end(closer));
    fileStream.pipe(out, { end: false });
    return out;
  }

  return { boundary, contentType, contentLength, createBodyStream };
}

module.exports = { buildSingleFileMultipart };
