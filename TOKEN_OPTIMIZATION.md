# Token Cost Optimization — Nexus Architecture Addendum

> Addendum to SPEC.md Section 4.6 (Self-Healing Engine)
> Created: 2026-06-28

---

## Why This Matters

Agent workloads consume **3-10x more tokens** than simple chatbots:
- Multi-turn loops (plan → tool → verify → respond) = 50x tokens per task
- Quadratic context growth (128K window = 64x cost of 8K window)
- Output tokens cost **4-8x more** than input tokens
- Each tool call adds schema + call + result tokens

**Without optimization:** A single agent task can cost $5-8 in API fees.
**With optimization:** 70-80% cost reduction is realistic.

---

## 4-Layer Token Optimization Engine

### Layer 1: Prompt Caching (90% savings on cached tokens)

**Provider-native caching** — reuse KV matrices for repeated prompt prefixes.

```
Prompt Structure (optimized for caching):

[STATIC] System prompt + tool schemas + personality     ← CACHED (90% cheaper)
[SEMI-STATIC] User preferences + facts from memory     ← CACHED
[DYNAMIC] Conversation history (last N turns)          ← Not cached
[REALTIME] Current user message                        ← Not cached
```

**Implementation:**
- Anthropic: explicit `cache_control` markers on static blocks
- OpenAI: automatic prefix caching (enabled by default, ~50% savings)
- Nexus: auto-detect provider and set appropriate cache markers

**Expected savings:** 60-90% on input tokens for repeated context.

### Layer 2: Semantic Caching (skip LLM entirely)

**Application-level caching** — detect semantically similar queries and return cached responses.

```
┌─────────────────────────────────────────┐
│         SEMANTIC CACHE                  │
│                                         │
│  User: "What's the weather in Bangkok?" │
│  ↓                                      │
│  LanceDB: similarity > 0.95?            │
│  ↓ YES                                  │
│  Return cached response (0ms, $0)       │
│                                         │
│  User: "What's the weather in Chiang    │
│         Mai?"                           │
│  ↓                                      │
│  LanceDB: similarity < 0.95             │
│  ↓ NO                                   │
│  Call LLM (normal flow)                 │
└─────────────────────────────────────────┘
```

**Stats:** ~31% of LLM queries exhibit semantic similarity (research data).
**Savings:** 100% on cache hits (no API call).
**Threshold:** Configurable (default 0.95 cosine similarity).

### Layer 3: Smart Model Routing (190x cost variance)

**Route tasks to the cheapest model that can handle them.**

```
┌─────────────────────────────────────────────────────┐
│              MODEL ROUTER                           │
│                                                     │
│  Task Classification:                               │
│  ├── Simple (greeting, yes/no, short answer)        │
│  │   → GPT-4o-mini / Claude Haiku / Gemini Flash   │
│  │   Cost: ~$0.15/M tokens                          │
│  │                                                  │
│  ├── Medium (summarize, explain, draft)             │
│  │   → GPT-4o / Claude Sonnet / Gemini Pro         │
│  │   Cost: ~$2.50/M tokens                          │
│  │                                                  │
│  ├── Complex (code, analysis, multi-step reasoning) │
│  │   → Claude Opus / GPT-4.5 / o3                  │
│  │   Cost: ~$15/M tokens                            │
│  │                                                  │
│  └── Tool Selection (classify intent → pick tool)   │
│      → GPT-4o-mini / Haiku (fast + cheap)           │
│      Cost: ~$0.15/M tokens                          │
│                                                     │
│  Auto-classification based on:                      │
│  • Message length + complexity                      │
│  • Required capabilities (code? analysis?)          │
│  • User preference (quality vs cost)                │
│  • Historical patterns                              │
└─────────────────────────────────────────────────────┘
```

**Expected savings:** 50-80% by routing simple tasks to cheap models.

### Layer 4: Context Management (40-60% savings)

**Aggressive context optimization:**

| Technique | Savings | How |
|-----------|---------|-----|
| **Tool result compression** | 40-60% | Truncate verbose tool outputs to essential data |
| **Selective history** | 30-50% | Only include last N turns + relevant old turns |
| **Structured output** | 30-40% | JSON mode instead of verbose free-text |
| **System prompt minification** | 20-30% | Compress system prompt without losing meaning |
| **Auto-summarize old turns** | 40-60% | Replace old conversations with summaries |

---

## Token Budget System

```
┌─────────────────────────────────────────────────────┐
│           TOKEN BUDGET MANAGER                      │
│                                                     │
│  Per-Session Budget:                                │
│  ├── System prompt: ~3K tokens (fixed)              │
│  ├── Memory retrieval: ~2K tokens (dynamic)         │
│  ├── Conversation history: ~5K tokens (dynamic)     │
│  ├── Tool schemas: ~2K tokens (fixed, cached)       │
│  ├── Available for user+response: ~5K tokens        │
│  └── Total budget: ~15K tokens per turn             │
│                                                     │
│  Daily Budget:                                      │
│  ├── Default: 100K tokens/day                       │
│  ├── Configurable in Settings                       │
│  ├── Warning at 80% usage                           │
│  └── Hard limit at 100% (configurable)              │
│                                                     │
│  Cost Tracking:                                     │
│  ├── Per-message cost (input + output)              │
│  ├── Session cost (cumulative)                      │
│  ├── Daily/weekly/monthly totals                    │
│  └── Cost projection (based on usage pattern)       │
└─────────────────────────────────────────────────────┘
```

---

## Provider Pricing Reference

| Provider | Model | Input $/M | Output $/M | Best For |
|----------|-------|-----------|------------|----------|
| OpenAI | GPT-4o-mini | $0.15 | $0.60 | Simple tasks, tool selection |
| OpenAI | GPT-4o | $2.50 | $10.00 | General purpose |
| OpenAI | o3 | $10.00 | $40.00 | Complex reasoning |
| Anthropic | Haiku 3.5 | $0.80 | $4.00 | Fast + cheap |
| Anthropic | Sonnet 4 | $3.00 | $15.00 | Balanced |
| Anthropic | Opus 4 | $15.00 | $75.00 | Maximum quality |
| Google | Gemini Flash | $0.075 | $0.30 | Ultra-cheap |
| Google | Gemini Pro | $1.25 | $5.00 | Good balance |
| DeepSeek | V3 | $0.27 | $1.10 | Budget option |
| OpenRouter | Various | Varies | Varies | Multi-model |

---

## Smart Compression Pipeline

When context approaches limit:

```
┌─────────────────────────────────────────────────┐
│         COMPRESSION PIPELINE                    │
│                                                 │
│  Step 1: Tool results > 500 chars?              │
│          → Summarize to key facts only          │
│                                                 │
│  Step 2: Conversation > 20 turns?               │
│          → Summarize turns 1-15 into 1 paragraph│
│          → Keep turns 16-20 in full             │
│                                                 │
│  Step 3: System prompt > 2K tokens?             │
│          → Minify (remove examples, whitespace) │
│          → Cache the minified version           │
│                                                 │
│  Step 4: Total > 80% context window?            │
│          → Aggressive compression               │
│          → Keep only last 5 turns + summary     │
│          → User notified: "Context compressed"  │
│                                                 │
│  Step 5: Total > 95% context window?            │
│          → Emergency compression                │
│          → Only last 3 turns + critical memory  │
│          → User warned: "Approaching limit"     │
└─────────────────────────────────────────────────┘
```

---

## Implementation Tasks (Add to PLAN.md)

### Task 29: Prompt Caching Engine
- **Description:** Implement provider-native prompt caching with automatic cache marker insertion.
- **Acceptance:**
  - Static system prompt cached across turns
  - Tool schemas cached (not re-sent each turn)
  - Cost reduction visible in token counter
  - Works with Anthropic (explicit) and OpenAI (automatic)
- **Verify:** Send 10 messages → see cached token count > 0 → cost reduced
- **Files:** `engine/nexus_engine/context/prompt_cache.py`
- **Scope:** M

### Task 30: Semantic Cache
- **Description:** Implement application-level semantic caching with LanceDB.
- **Acceptance:**
  - Embed and store recent Q&A pairs
  - Before LLM call, check for similar cached query
  - Configurable similarity threshold (default 0.95)
  - Cache hit rate displayed in status bar
- **Verify:** Ask same question twice → second time returns instantly + $0 cost
- **Files:** `engine/nexus_engine/context/semantic_cache.py`
- **Scope:** M

### Task 31: Smart Model Router
- **Description:** Classify task complexity and route to cheapest capable model.
- **Acceptance:**
  - Task classifier (simple/medium/complex) works
  - Router selects appropriate model based on classification
  - User can override per-message or set preference
  - Cost comparison shown (what you saved vs using premium model)
- **Verify:** Send simple "hello" → routed to mini model → cost $0.0001
- **Files:** `engine/nexus_engine/router/model_router.py`
- **Scope:** L

### Task 32: Context Compression Pipeline
- **Description:** Implement the 5-step compression pipeline.
- **Acceptance:**
  - Tool results auto-summarized when > 500 chars
  - Old turns summarized when > 20 turns
  - System prompt minified when > 2K tokens
  - User notified on compression
  - All summaries stored for future reference
- **Verify:** Have 30-turn conversation → see compression happen → no data lost
- **Files:** `engine/nexus_engine/context/compressor.py`
- **Scope:** M

### Task 33: Token Budget Dashboard
- **Description:** Real-time token usage visualization in UI.
- **Acceptance:**
  - Per-message cost shown after each response
  - Daily/weekly/monthly charts
  - Cost by model breakdown
  - Savings from caching + routing shown
  - Budget alerts configurable
- **Verify:** Use for a day → see accurate cost tracking
- **Files:** `src/components/settings/TokenDashboard.tsx`
- **Scope:** M

---

## Summary: Expected Cost Reduction

| Optimization | Savings | Implementation |
|-------------|---------|----------------|
| Prompt caching | 60-90% | Layer 1 (Provider-native) |
| Semantic caching | ~31% queries skipped | Layer 2 (LanceDB) |
| Model routing | 50-80% | Layer 3 (Task classification) |
| Context management | 40-60% | Layer 4 (Compression pipeline) |
| **Combined** | **70-85%** | **All 4 layers** |

**Example:**
- Without optimization: 100 messages/day × $0.05 = **$5.00/day**
- With optimization: 100 messages/day × $0.008 = **$0.80/day**
- **Monthly savings: ~$126** (from $150 to $24)

---

*This addendum extends SPEC.md. Integrate into main spec during next review.*
