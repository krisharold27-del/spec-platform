/**
 * One file out of a zip, in the browser, with no dependency.
 *
 * A .docx is a zip. Reading one needs about sixty lines and the browser's own
 * `DecompressionStream`, which is the entire reason this is here rather than a library: the org
 * chart import's whole promise is that **nothing is uploaded and nothing is stored** — the file is
 * read on the person's own machine and the text lands in a box they can check. Sending a payroll
 * export to a server to be unzipped would quietly trade that away, and pulling in a zip library to
 * avoid it would add a megabyte to every page in the product for one button.
 *
 * Only what a .docx needs: the central directory, stored and deflated entries, no encryption, no
 * zip64. Anything else throws, and the picker says so in words.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * Read one named file out of a zip.
 *
 * Entries are found through the central directory at the END of the file rather than by walking
 * local headers from the front. That is not a preference — a local header may declare its sizes as
 * zero and defer them to a trailing descriptor, which is common in files written by streaming
 * writers, and a reader that trusts the front gets nothing. The central directory always has them.
 */
export async function readFromZip(buffer: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // The end-of-central-directory record, searched backwards: it is 22 bytes plus a comment of up to
  // 64KB, so there is no fixed place for it.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('zip damaged');
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));

    if (name === wanted) {
      if (view.getUint32(localAt, true) !== LOCAL) throw new Error('zip damaged');
      // The local header's own name and extra lengths, which may differ from the central copy's.
      const start = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
      const data = bytes.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error(`zip uses compression ${method}`);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Raw deflate, using the browser's own decompressor. Present everywhere SPEC supports. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unzip');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
