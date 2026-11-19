import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { embedQuery, toVectorLiteral } from './embeddings.js';

/**
 * Cosine-similarity search over policy_chunks.
 * `locationScope` is a scope or list of scopes; callers pass e.g. ['india', 'global'].
 * Returns [{ doc_name, section, content, location_scope, score }] best-first.
 */
export async function retrieve(query, { topK = env.RAG_TOP_K, locationScope } = {}) {
  const vector = toVectorLiteral(await embedQuery(query));
  const scopes = [locationScope ?? []].flat().filter(Boolean);
  const scopeFilter = scopes.length
    ? sql`WHERE location_scope IN (${sql.join(scopes.map((s) => sql`${s}`), sql`, `)})`
    : sql``;

  const { rows } = await db.execute(sql`
    SELECT doc_name, section, content, location_scope,
           1 - (embedding <=> ${vector}::vector) AS score
    FROM policy_chunks
    ${scopeFilter}
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${topK}`);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export const formatChunks = (chunks) =>
  chunks.length
    ? chunks.map((c, i) => `[${i + 1}] (${c.doc_name} — ${c.section})\n${c.content}`).join('\n\n')
    : '(no policy excerpts retrieved)';
