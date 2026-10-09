/**
 * Share links: the whole deck travels inside the URL fragment.
 *
 *   markdown ──deflate-raw──▶ bytes ──AES-GCM-256──▶ iv ‖ ciphertext ──base64url──▶ #fragment
 *
 * Compression happens first (ciphertext doesn't compress). Everything lives
 * after `#`, which browsers never send to a server, so hosting, logs and
 * link-preview crawlers only ever see the bare page URL.
 *
 * Two formats:
 *   #v1k.<key>.<data>   random 256-bit key carried in the link (one click to open)
 *   #v1p.<salt>.<data>  key derived from a password with PBKDF2-SHA-256
 *
 * The format tag is bound to the ciphertext as AES-GCM additional data, so a
 * link can't be altered or relabelled without decryption failing.
 */

export const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation for PBKDF2-SHA-256

const TAG_KEY = 'v1k';
const TAG_PASSWORD = 'v1p';

export interface SharedDeck {
  name: string;
  markdown: string;
}

export type ParsedLink =
  | { kind: 'key'; key: Uint8Array; data: Uint8Array }
  | { kind: 'password'; salt: Uint8Array; data: Uint8Array };

export class ShareError extends Error {
  constructor(
    message: string,
    readonly reason: 'unsupported' | 'malformed' | 'decrypt' | 'too-large',
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ */
/* Support                                                              */
/* ------------------------------------------------------------------ */

export function shareSupported(): boolean {
  if (!globalThis.crypto?.subtle || typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') return false;
  try {
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* base64url                                                            */
/* ------------------------------------------------------------------ */

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new ShareError('The link contains invalid characters.', 'malformed');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ */
/* Compression                                                          */
/* ------------------------------------------------------------------ */

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export const compress = (bytes: Uint8Array) => pipe(bytes, new CompressionStream('deflate-raw'));

/** Largest deck a link may expand to. Guards against "zip bomb" links. */
export const MAX_DECK_BYTES = 20 * 1024 * 1024;

export async function decompress(bytes: Uint8Array, limit = MAX_DECK_BYTES): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new ShareError('This link expands to more than 20 MB, so it was not opened.', 'too-large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Crypto                                                               */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();
const dec = new TextDecoder();

function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key: CryptoKey, plain: Uint8Array, tag: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(tag) }, key, plain as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}

async function open(key: CryptoKey, data: Uint8Array, tag: string): Promise<Uint8Array> {
  if (data.length < 12 + 16) throw new ShareError('The link is incomplete. It may have been cut off when it was copied.', 'malformed');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) as BufferSource, additionalData: enc.encode(tag) }, key, data.subarray(12) as BufferSource);
    return new Uint8Array(plain);
  } catch {
    throw new ShareError('This link could not be decrypted. It may be incomplete (some apps cut long links short) or it may have been changed.', 'decrypt');
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

export interface EncodeResult {
  fragment: string; // without '#'
  rawBytes: number;
  compressedBytes: number;
}

function packDeck(deck: SharedDeck): Uint8Array {
  return enc.encode(JSON.stringify({ n: deck.name, m: deck.markdown }));
}

function unpackDeck(bytes: Uint8Array): SharedDeck {
  try {
    const obj = JSON.parse(dec.decode(bytes));
    if (typeof obj.m !== 'string') throw new Error();
    return { name: typeof obj.n === 'string' ? obj.n : 'Shared deck.md', markdown: obj.m };
  } catch {
    throw new ShareError('The link opened, but its contents are not a deck.', 'malformed');
  }
}

/** Encode a deck. With a password, the key is derived; otherwise a random key goes in the link. */
export async function encodeDeck(deck: SharedDeck, password?: string): Promise<EncodeResult> {
  if (!shareSupported()) throw new ShareError('This browser cannot create share links.', 'unsupported');
  const raw = packDeck(deck);
  const packed = await compress(raw);
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const data = await seal(key, packed, TAG_PASSWORD);
    return { fragment: `${TAG_PASSWORD}.${toBase64Url(salt)}.${toBase64Url(data)}`, rawBytes: raw.length, compressedBytes: packed.length };
  }
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const data = await seal(await importKey(rawKey), packed, TAG_KEY);
  return { fragment: `${TAG_KEY}.${toBase64Url(rawKey)}.${toBase64Url(data)}`, rawBytes: raw.length, compressedBytes: packed.length };
}

/** Recognise a share fragment. Returns null for anything else (e.g. #presenter). */
export function parseShareFragment(hash: string): ParsedLink | null {
  const h = hash.replace(/^#/, '');
  const m = /^(v1[kp])\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(h);
  if (!m) {
    if (/^v1[kp]\./.test(h)) throw new ShareError('The link is damaged. It may have been cut off when it was copied.', 'malformed');
    return null;
  }
  const first = fromBase64Url(m[2]);
  const data = fromBase64Url(m[3]);
  if (m[1] === TAG_KEY) {
    if (first.length !== 32) throw new ShareError('The link is damaged.', 'malformed');
    return { kind: 'key', key: first, data };
  }
  if (first.length !== 16) throw new ShareError('The link is damaged.', 'malformed');
  return { kind: 'password', salt: first, data };
}

export async function decodeDeck(link: ParsedLink, password?: string): Promise<SharedDeck> {
  if (!shareSupported()) throw new ShareError('This browser cannot open share links. Try a current Chrome, Edge, Safari or Firefox.', 'unsupported');
  let plain: Uint8Array;
  if (link.kind === 'key') {
    plain = await open(await importKey(link.key), link.data, TAG_KEY);
  } else {
    if (!password) throw new ShareError('A password is required.', 'decrypt');
    plain = await open(await deriveKey(password, link.salt), link.data, TAG_PASSWORD);
  }
  let bytes: Uint8Array;
  try {
    bytes = await decompress(plain);
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError('The link opened, but its contents are damaged.', 'malformed');
  }
  return unpackDeck(bytes);
}

/* ------------------------------------------------------------------ */
/* Link length guidance                                                 */
/* ------------------------------------------------------------------ */

export type LengthLevel = 'ok' | 'long' | 'too-long' | 'max';

/** Where links start to break: chat and mail apps (~2k–8k), browsers (~2M). */
export function linkLevel(length: number): LengthLevel {
  if (length <= 2000) return 'ok';
  if (length <= 8000) return 'long';
  if (length <= 2_000_000) return 'too-long';
  return 'max';
}
