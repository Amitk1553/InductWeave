# Decisions and assumptions

Where the brief was silent or something had to give, this is what was chosen and why.

## Structure
- The monorepo root is the workspace root (`backend/`, `frontend/`, `docs/`).
- Backend uses Node.js 20+, Express 5, Zod, and ES modules (`"type": "module"`).
- Frontend uses React 18, Vite, Tailwind CSS, shadcn/ui components, and TanStack Query.
- Shared Gemini client in `backend/src/ai/geminiClient.js` with structured JSON output mode, configurable timeout, and exponential backoff retry.

## Database & Data Model
- Neon PostgreSQL with the `pgvector` extension.
- `policy_chunks` stores chunked markdown documents:
  - `doc_name TEXT NOT NULL`: Base filename without `.md` (e.g. `india_specific`).
  - `doc_title TEXT NOT NULL`: Extracted from `# H1` heading (e.g. `India Onboarding and Employment Policy`).
  - `section TEXT NOT NULL`: Extracted from numbered `##` heading (e.g. `3.2 Documents Required on Day One`).
  - `location_scope TEXT NOT NULL DEFAULT 'global'`: Inferred as `india`, `us`, or `global`.
  - `content TEXT NOT NULL`: Self-contained section text.
  - `embedding vector(768)`: Fixed 768-dimensional embedding indexed using HNSW cosine distance (`vector_cosine_ops`).
- `chat_messages` stores conversational turns:
  - `user_key TEXT NOT NULL`: Clerk user ID or `'anonymous'`.
  - `employee_id INTEGER REFERENCES employees(id)`: Nullable link to employee profile when available.
  - `role TEXT NOT NULL`: `'user'` or `'assistant'`.
  - `message TEXT NOT NULL`: Message content.
  - `citations JSONB`: Verified citations array `[{ doc_title, doc_name, section }]`.
  - `confidence REAL`: Grounding confidence score (0.0 to 1.0).
  - `escalated BOOLEAN DEFAULT false`: Flag indicating whether the assistant was unable to answer or lacked confidence.

## RAG & Knowledge Base
- **Knowledge Base Policies**: Six realistic policies for "Nimbus Technologies" in `backend/src/data/policies/`:
  1. `global_onboarding.md` (overview, first-week schedule, buddy program, 1:1s, security training, probation)
  2. `india_specific.md` (PAN/Aadhaar day-one requirements, 3-day copy deadline, PF/UAN, bank details, BGV, India leave) - includes section `3.2 Documents Required on Day One`
  3. `us_specific.md` (Form W-4, Form I-9 with 3 business day deadline, SSN, direct deposit, background check, 401(k))
  4. `it_equipment_policy.md` (laptop 5-day request lead time, SSO accounts, VPN client requirement, GitHub/AWS gating, device return, IT helpdesk contact)
  5. `benefits_policy.md` (health insurance 30-day enrollment window, step-by-step instructions, dependents, coverage start date, wellness/allowances)
  6. `workplace_policy.md` (business casual dress code with relaxed Fridays, working hours, 3-day hybrid schedule, leave policy, holidays, code of conduct)
- **Chunking Strategy**: Chunks are split on `## ` numbered sections. Sections exceeding ~500 tokens (~2000 characters) are partitioned at paragraph boundaries with ~50 tokens (~200 characters) of overlap.
- **Embedding Model**: `gemini-embedding-001` via `@google/genai` configured with `outputDimensionality: 768` and `taskType: RETRIEVAL_DOCUMENT` during ingestion and `RETRIEVAL_QUERY` during retrieval. Output vectors are L2-normalized as required by Google AI documentation when truncated from 3072 to 768.
- **LLM Model**: Configured through `GEMINI_MODEL` (default: `gemini-3.5-flash-lite`, with full support for `gemini-3.8-flash`). The Google AI API directs new users to 3.x models, and `gemini-3.5-flash-lite` provides rapid response times and dependable structured JSON output.
- **Similarity Gate**: Configured by `RAG_MIN_SCORE=0.35`. If no retrieved chunk meets this cosine similarity score, the LLM call is bypassed completely and the assistant returns `"I don't have information about this yet. This policy information will be added soon."`, setting `confidence = 0` and `escalated = true`.
- **General Company Policies**: Added comprehensive policy overview sections (`1.0 General Company Policies and Master Handbook Overview` in `global_onboarding.md` and `6.1 Workplace Philosophy and General Company Policies` in `workplace_policy.md`) covering the company's core policy framework so general inquiries such as *"What is the policy of your company?"* are grounded, cited, and answered directly rather than falling back.
- **Removed Contact HR UI Button**: Per updated design, the "Contact HR about this question" button was removed from the chat bubbles; unanswered queries clearly state that the policy information will be added soon.
- **History Context**: Configured by `CHAT_HISTORY_TURNS=5`. Preserves preceding turns in the prompt so follow-up inquiries (e.g. "What about the deadline for submitting them?") maintain full context.
- **Citation Verification**: Every citation emitted by the LLM is verified against the chunks retrieved in that turn. Fabricated citations are dropped. If the answer is not a refusal but no verifiable citation remains, confidence is reduced to `<= 0.3` and `escalated = true`.
- **Prompt Injection Defense**: `sanitizer.js` inspects all inputs for jailbreak and injection patterns (`ignore previous instructions`, `reveal system prompt`, `you are now`, `developer mode`, etc.). Flagged inputs never reach the LLM and receive an immediate refusal.

## Auth & Access Control
- `@clerk/express` middleware extracts `getAuth(req).userId`.
- When Clerk is present and authenticated, queries are associated with that user's ID and linked employee record.
- When unauthenticated or during local evaluation, the route falls back to `'anonymous'` behind a clear `// TODO: protect strictly with Clerk` note.
- Rate limiting is enforced at 20 requests per minute per IP via `express-rate-limit`.

## Unanswered & Escalated Questions
- When `escalated` is true (due to refusal, out-of-scope, or low confidence), the bot transparently informs the employee that the policy information will be added soon. The previous "Contact HR" button was removed from the widget per product direction to streamline the user interface.
