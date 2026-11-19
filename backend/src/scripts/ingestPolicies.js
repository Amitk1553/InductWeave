import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { embedTexts } from '../ai/embeddings.js';
import { closeDb, db } from '../db/client.js';
import { policyChunks } from '../db/schema.js';

const POLICY_DIR = fileURLToPath(new URL('../data/policies/', import.meta.url));
const CHARS_PER_TOKEN = 4; // rough approximation; avoids shipping a tokenizer
const MAX_CHARS = env.CHUNK_SIZE * CHARS_PER_TOKEN;
const OVERLAP_CHARS = env.CHUNK_OVERLAP * CHARS_PER_TOKEN;

function locationScopeFor(fileName) {
  if (fileName.includes('india')) return 'india';
  if (fileName.startsWith('us_')) return 'us';
  if (fileName.includes('canada_uk')) return 'canada_uk';
  return 'global';
}

/** Splits markdown into { section, text } blocks at headings; `section` is the nearest heading. */
function splitSections(markdown) {
  const sections = [];
  let current = { section: 'Overview', lines: [] };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      if (current.lines.join('').trim()) sections.push(current);
      current = { section: heading[2], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.join('').trim()) sections.push(current);
  return sections.map((s) => ({ section: s.section, text: s.lines.join('\n').trim() }));
}

/** Packs paragraphs into chunks of at most MAX_CHARS, carrying a word-aligned overlap between chunks. */
function chunkText(text) {
  if (text.length <= MAX_CHARS) return [text];
  const chunks = [];
  let buffer = '';
  for (const para of text.split(/\n{2,}/)) {
    if (buffer && buffer.length + para.length + 2 > MAX_CHARS) {
      chunks.push(buffer);
      const tail = buffer.slice(-OVERLAP_CHARS);
      buffer = tail.slice(tail.indexOf(' ') + 1);
    }
    buffer = buffer ? `${buffer}\n\n${para}` : para;
  }
  if (buffer.trim()) chunks.push(buffer);
  return chunks;
}

function buildChunks(fileName, markdown) {
  const docTitle = /^#\s+(.*\S)/m.exec(markdown)?.[1] ?? fileName;
  const locationScope = locationScopeFor(fileName);
  const out = [];
  for (const { section, text } of splitSections(markdown)) {
    for (const content of chunkText(text)) {
      out.push({ docName: fileName, section, chunkIndex: out.length, content, locationScope, docTitle });
    }
  }
  return out;
}

async function ingestFile(fileName) {
  const chunks = buildChunks(fileName, readFileSync(path.join(POLICY_DIR, fileName), 'utf8'));

  const existing = await db
    .select({ content: policyChunks.content, section: policyChunks.section })
    .from(policyChunks)
    .where(eq(policyChunks.docName, fileName))
    .orderBy(asc(policyChunks.chunkIndex));
  const unchanged =
    existing.length === chunks.length && existing.every((e, i) => e.content === chunks[i].content && e.section === chunks[i].section);
  if (unchanged) {
    logger.info(`${fileName}: unchanged (${chunks.length} chunks), skipped`);
    return 0;
  }

  const vectors = await embedTexts(
    chunks.map((c) => `${c.docTitle} — ${c.section}\n\n${c.content}`),
    { kind: 'document' },
  );

  await db.transaction(async (tx) => {
    await tx.delete(policyChunks).where(eq(policyChunks.docName, fileName));
    await tx.insert(policyChunks).values(
      chunks.map((c, i) => ({
        docName: c.docName,
        section: c.section,
        chunkIndex: c.chunkIndex,
        content: c.content,
        locationScope: c.locationScope,
        roleScope: 'all',
        embedding: vectors[i],
      })),
    );
  });
  logger.info(`${fileName}: ingested ${chunks.length} chunks (scope ${chunks[0]?.locationScope})`);
  return chunks.length;
}

async function main() {
  const files = readdirSync(POLICY_DIR).filter((f) => f.endsWith('.md')).sort();
  let total = 0;
  for (const file of files) total += await ingestFile(file);

  // Remove chunks of documents that no longer exist on disk.
  const docs = await db.selectDistinct({ docName: policyChunks.docName }).from(policyChunks);
  for (const { docName } of docs) {
    if (!files.includes(docName)) {
      await db.delete(policyChunks).where(eq(policyChunks.docName, docName));
      logger.info(`${docName}: removed (file no longer exists)`);
    }
  }
  logger.info(`Ingest finished: ${total} chunk(s) written across ${files.length} document(s)`);
}

main()
  .catch((err) => {
    logger.error({ err }, 'policy ingestion failed');
    process.exitCode = 1;
  })
  .finally(closeDb);
