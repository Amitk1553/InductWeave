import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { embedTexts } from '../ai/embeddings.js';
import { buildChunks } from '../ai/ragPipeline.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { closeDb, db } from '../db/client.js';
import { policyChunks } from '../db/schema.js';

const POLICY_DIR = fileURLToPath(new URL('../data/policies/', import.meta.url));

async function main() {
  const files = readdirSync(POLICY_DIR).filter((f) => f.endsWith('.md')).sort();
  if (files.length === 0) {
    logger.warn('No markdown policy files found in ' + POLICY_DIR);
    return;
  }

  logger.info(`Starting ingestion for ${files.length} policy files...`);

  // Parse all files into chunks first
  const allChunks = [];
  const fileSummary = {};

  for (const file of files) {
    const raw = readFileSync(path.join(POLICY_DIR, file), 'utf8');
    const chunks = buildChunks(file, raw);
    fileSummary[file] = chunks.length;
    allChunks.push(...chunks);
    logger.info(`Parsed ${file}: ${chunks.length} chunk(s) (scope: ${chunks[0]?.locationScope})`);
  }

  logger.info(`Generating embeddings for ${allChunks.length} total chunks...`);

  // Embed "{doc_title} - {section}\n{content}" for each chunk using RETRIEVAL_DOCUMENT
  const textsToEmbed = allChunks.map((c) => `${c.docTitle} - ${c.section}\n${c.content}`);
  const vectors = await embedTexts(textsToEmbed, { kind: 'document' });

  if (vectors.length !== allChunks.length) {
    throw new Error(`Expected ${allChunks.length} vectors, got ${vectors.length}`);
  }

  // Validate embedding dimensions
  for (let i = 0; i < vectors.length; i += 1) {
    if (vectors[i].length !== env.EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: model returned ${vectors[i].length} dims, but EMBEDDING_DIMENSIONS is ${env.EMBEDDING_DIMENSIONS}. Please align your environment variable and DB vector column.`,
      );
    }
  }

  // Idempotent replacement: truncate policy_chunks and insert fresh chunks
  logger.info('Truncating policy_chunks table for clean idempotent ingestion...');
  await db.execute(sql`TRUNCATE TABLE policy_chunks RESTART IDENTITY;`);

  logger.info(`Inserting ${allChunks.length} chunks into database...`);
  // Insert in batches of 20 to avoid large single payload limits
  const BATCH = 20;
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const slice = allChunks.slice(i, i + BATCH);
    const vectorSlice = vectors.slice(i, i + BATCH);
    await db.insert(policyChunks).values(
      slice.map((c, idx) => ({
        docName: c.docName,
        docTitle: c.docTitle,
        section: c.section,
        chunkIndex: c.chunkIndex,
        content: c.content,
        locationScope: c.locationScope,
        roleScope: 'all',
        embedding: vectorSlice[idx],
      })),
    );
  }

  // Verification & summary
  const [countResult] = (await db.execute(sql`SELECT count(*)::int AS count FROM policy_chunks;`)).rows;
  logger.info('========================================');
  logger.info('Policy Ingestion Summary:');
  for (const [file, count] of Object.entries(fileSummary)) {
    logger.info(`  - ${file}: ${count} chunks`);
  }
  logger.info(`Total chunks stored in DB: ${countResult.count}`);
  logger.info('Ingestion completed successfully.');
  logger.info('========================================');
}

main()
  .catch((err) => {
    logger.error({ err }, 'Policy ingestion failed');
    process.exitCode = 1;
  })
  .finally(closeDb);
