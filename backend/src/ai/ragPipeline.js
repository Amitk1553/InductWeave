import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { embed, toVectorLiteral } from './embeddings.js';

const CHARS_PER_TOKEN = 4;
const MAX_CHARS = (env.CHUNK_SIZE || 500) * CHARS_PER_TOKEN;
const OVERLAP_CHARS = (env.CHUNK_OVERLAP || 50) * CHARS_PER_TOKEN;

/** Infers location scope from file name: india | us | global */
export function locationScopeFor(fileName) {
  const base = fileName.toLowerCase();
  if (base.includes('india')) return 'india';
  if (base.includes('us_') || base.startsWith('us_') || base.includes('united_states')) return 'us';
  return 'global';
}

/**
 * Splits markdown into sections by `## ` heading.
 * Returns array of { section, text }.
 */
export function splitSections(markdown) {
  const sections = [];
  let currentSection = null;
  let currentLines = [];

  for (const line of markdown.split(/\r?\n/)) {
    const headingMatch = /^##\s+(.*\S)\s*$/.exec(line);
    if (headingMatch) {
      if (currentSection && currentLines.join('').trim()) {
        sections.push({ section: currentSection, text: currentLines.join('\n').trim() });
      }
      currentSection = headingMatch[1];
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentSection && currentLines.join('').trim()) {
    sections.push({ section: currentSection, text: currentLines.join('\n').trim() });
  }

  return sections;
}

/**
 * Splits text into chunks of at most MAX_CHARS (~500 tokens),
 * splitting at paragraph boundaries with ~50 tokens of overlap.
 */
export function chunkText(text) {
  if (text.length <= MAX_CHARS) return [text];
  const chunks = [];
  let buffer = '';

  for (const para of text.split(/\n{2,}/)) {
    if (buffer && buffer.length + para.length + 2 > MAX_CHARS) {
      chunks.push(buffer);
      const tail = buffer.slice(-OVERLAP_CHARS);
      const spaceIdx = tail.indexOf(' ');
      buffer = spaceIdx !== -1 ? tail.slice(spaceIdx + 1) : tail;
    }
    buffer = buffer ? `${buffer}\n\n${para}` : para;
  }

  if (buffer.trim()) chunks.push(buffer);
  return chunks;
}

/**
 * Parses markdown file and returns chunk objects ready for ingestion.
 * `docName` is the file base name without .md extension.
 */
export function buildChunks(fileName, markdown) {
  const docName = fileName.replace(/\.md$/i, '');
  const docTitle = /^#\s+(.*\S)/m.exec(markdown)?.[1] ?? docName;
  const locationScope = locationScopeFor(fileName);
  const out = [];

  for (const { section, text } of splitSections(markdown)) {
    for (const content of chunkText(text)) {
      out.push({
        docName,
        docTitle,
        section,
        chunkIndex: out.length,
        content,
        locationScope,
      });
    }
  }

  return out;
}

/**
 * Cosine-similarity search over policy_chunks.
 * Returns chunks sorted by score descending:
 * [{ doc_name, doc_title, section, content, location_scope, score }]
 */
export async function retrieve(question, { topK = env.RAG_TOP_K, locationScope } = {}) {
  const vector = toVectorLiteral(await embed(question, 'RETRIEVAL_QUERY'));

  let scopeFilter = sql``;
  if (locationScope) {
    const scopes = Array.isArray(locationScope) ? locationScope : [locationScope];
    const uniqueScopes = Array.from(new Set([...scopes.filter(Boolean), 'global']));
    scopeFilter = sql`WHERE location_scope IN (${sql.join(uniqueScopes.map((s) => sql`${s}`), sql`, `)})`;
  }

  const { rows } = await db.execute(sql`
    SELECT doc_name, doc_title, section, content, location_scope,
           1 - (embedding <=> ${vector}::vector) AS score
    FROM policy_chunks
    ${scopeFilter}
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${topK}`);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

/** Formats retrieved chunks for the prompt context. */
export const formatChunks = (chunks) =>
  chunks.length
    ? chunks
        .map(
          (c, i) =>
            `[${i + 1}] (${c.doc_title} — ${c.doc_name} — ${c.section})\n${c.content}`,
        )
        .join('\n\n')
    : '(no policy excerpts retrieved)';
