import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { genAiClient } from './geminiClient.js';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// gemini-embedding-2 has no task_type parameter; task instructions go into the text instead.
const usesPromptPrefix = () => /embedding-2/i.test(env.GEMINI_EMBEDDING_MODEL);

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function formatInput(text, kind, title) {
  if (!usesPromptPrefix()) return text;
  return kind === 'query'
    ? `task: question answering | query: ${text}`
    : `title: ${title || 'none'} | text: ${text}`;
}

async function embedBatch(inputs, kind) {
  const config = { outputDimensionality: env.EMBEDDING_DIMENSIONS };
  if (!usesPromptPrefix()) config.taskType = kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';

  // Separate Content objects => one embedding per input on both model generations.
  const contents = usesPromptPrefix() ? inputs.map((text) => ({ parts: [{ text }] })) : inputs;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await genAiClient.models.embedContent({ model: env.GEMINI_EMBEDDING_MODEL, contents, config });
      const vectors = (res.embeddings ?? []).map((e) => e.values);
      if (vectors.length !== inputs.length) {
        throw new Error(`Expected ${inputs.length} embeddings, received ${vectors.length}`);
      }
      return vectors.map((v) => {
        if (v.length !== env.EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Embedding has ${v.length} dimensions but EMBEDDING_DIMENSIONS=${env.EMBEDDING_DIMENSIONS}; fix the env var or the vector column.`,
          );
        }
        // Truncated (non-3072) vectors of gemini-embedding-001 are not unit length.
        return normalize(v);
      });
    } catch (err) {
      const retriable = err?.status === 429 || (err?.status >= 500 && err?.status < 600);
      if (!retriable || attempt >= MAX_ATTEMPTS) throw err;
      const delay = 2000 * 2 ** (attempt - 1);
      logger.warn({ status: err.status, attempt, delay }, 'embedding rate-limited, backing off');
      await sleep(delay);
    }
  }
}

/** kind: 'document' | 'query'. `titles` (optional, same length) are used by gemini-embedding-2 formatting. */
export async function embedTexts(texts, { kind = 'document', titles = [] } = {}) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE).map((t, j) => formatInput(t, kind, titles[i + j]));
    out.push(...(await embedBatch(slice, kind)));
  }
  return out;
}

export const embedQuery = async (text) => (await embedTexts([text], { kind: 'query' }))[0];

export async function embed(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const kind = taskType === 'RETRIEVAL_QUERY' ? 'query' : 'document';
  const [vector] = await embedTexts([text], { kind });
  return vector;
}

export const toVectorLiteral = (vec) => `[${vec.join(',')}]`;
