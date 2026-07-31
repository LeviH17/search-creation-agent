import type {
  BooleanQueryResult,
  CreateSearchResult,
  EntityResult,
  ScoringResult,
  Snippet,
} from "./types";

// ── Utilities ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MockPipelineRequest {
  query: string;
  conversation_history?: { role: string; content: string }[];
  entity_override?: EntityResult;
  boolean_override?: BooleanQueryResult;
  confirmed_scoring?: ScoringResult;
}

export interface MockEvent {
  event: string;
  data: Record<string, unknown>;
}

// ── Mock data builders ───────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function pickEntityFromQuery(query: string): EntityResult {
  const q = query.toLowerCase();

  if (q.includes("apple")) {
    return {
      entityName: "Apple",
      fullName: "Apple Inc.",
      entityType: "Company",
      ticker: "AAPL",
      handles: ["@Apple", "@tim_cook"],
      aliases: ["Apple Inc", "AAPL"],
      businessUnits: ["iPhone", "Mac", "Services", "Wearables"],
      industryVertical: "Consumer Electronics",
      ambiguityScore: 0.62,
      ambiguityLabel: "High",
      ambiguityReasons: [
        "Common English word (fruit) — dominant noise source",
        "Apple appears in many unrelated brand names (Apple Records, Big Apple)",
      ],
      knownNoiseTypes: ["Fruit references", "Recipe posts", "Music label mentions"],
    };
  }

  if (q.includes("tesla")) {
    return {
      entityName: "Tesla",
      fullName: "Tesla, Inc.",
      entityType: "Company",
      ticker: "TSLA",
      handles: ["@Tesla", "@elonmusk"],
      aliases: ["Tesla Motors", "TSLA"],
      businessUnits: ["Automotive", "Energy", "Autonomy"],
      industryVertical: "Automotive / Clean Energy",
      ambiguityScore: 0.48,
      ambiguityLabel: "Medium",
      ambiguityReasons: [
        "Shares name with Nikola Tesla — historical/scientific posts",
        "Some references to unrelated products (Tesla coil, Tesla GPU)",
      ],
      knownNoiseTypes: ["Nikola Tesla historical posts", "NVIDIA Tesla GPUs"],
    };
  }

  if (q.includes("openai") || q.includes("chatgpt")) {
    return {
      entityName: "OpenAI",
      fullName: "OpenAI",
      entityType: "Company",
      ticker: null,
      handles: ["@OpenAI", "@sama"],
      aliases: ["ChatGPT", "GPT-4"],
      businessUnits: ["ChatGPT", "API Platform", "DALL-E"],
      industryVertical: "Artificial Intelligence",
      ambiguityScore: 0.22,
      ambiguityLabel: "Low",
      ambiguityReasons: [
        "Distinct name — minimal collision with unrelated topics",
      ],
      knownNoiseTypes: ["Generic AI discussion not related to OpenAI products"],
    };
  }

  // Generic fallback — pick the first non-trivial token as the entity name
  const cleaned = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(track|monitor|find|search|analyze|about|for|the|a|an|to)$/i.test(w));
  const raw = cleaned.slice(0, 2).join(" ") || "Sample Entity";
  const name = titleCase(raw);

  return {
    entityName: name,
    fullName: name,
    entityType: "Company",
    ticker: null,
    handles: [],
    aliases: [],
    businessUnits: ["Core Business"],
    industryVertical: "General",
    ambiguityScore: 0.35,
    ambiguityLabel: "Medium",
    ambiguityReasons: ["Name may overlap with unrelated brands or common terms"],
    knownNoiseTypes: ["Generic mentions", "Unrelated brand collisions"],
  };
}

function buildBoolean(entity: EntityResult): BooleanQueryResult {
  const must = [entity.entityName, ...entity.aliases].filter(Boolean);
  const should = [
    ...entity.handles,
    ...entity.businessUnits,
    entity.ticker,
  ].filter(Boolean) as string[];
  const mustNot = entity.knownNoiseTypes
    .map((n) => n.split(/\s+/)[0])
    .filter(Boolean);

  const mustClause = must.map((t) => `"${t}"`).join(" OR ");
  const shouldClause = should.slice(0, 4).map((t) => `"${t}"`).join(" OR ");
  const notClause = mustNot.slice(0, 3).map((t) => `"${t}"`).join(" OR ");

  const query = [
    `(${mustClause})`,
    shouldClause ? `AND (${shouldClause})` : "",
    notClause ? `AND NOT (${notClause})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    query,
    explanation:
      `Anchors on the entity name and aliases, boosts with known handles / business units, and excludes the top known noise terms.`,
    must_terms: must,
    should_terms: should.slice(0, 6),
    must_not_terms: mustNot.slice(0, 4),
  };
}

function buildSnippets(entity: EntityResult): Snippet[] {
  const now = Date.now();
  const iso = (offsetMin: number) =>
    new Date(now - offsetMin * 60_000).toISOString();

  const relevant: Omit<Snippet, "id" | "relevance_score" | "relevance_label" | "relevance_reason">[] = [
    {
      source: "twitter",
      author: "Marcus Chen",
      handle: "@techanalyst",
      text: `Big news out of ${entity.entityName} today — the earnings beat is going to reshape the ${entity.industryVertical.toLowerCase()} conversation.`,
      published_at: iso(15),
      url: "https://twitter.com/example/1",
    },
    {
      source: "reddit",
      author: "u/marketwatcher",
      handle: "u/marketwatcher",
      text: `Anyone else digging into the ${entity.entityName} filing? The margin trend is wild.`,
      published_at: iso(42),
      url: "https://reddit.com/example/2",
    },
    {
      source: "news",
      author: "Reuters",
      handle: "reuters.com",
      text: `${entity.fullName} announced a strategic partnership expanding its ${entity.businessUnits[0] ?? "core"} lineup.`,
      published_at: iso(90),
      url: "https://reuters.com/example/3",
    },
    {
      source: "linkedin",
      author: "Priya Ravi",
      handle: "in/priyar",
      text: `Excited about what ${entity.entityName}'s new product means for the industry — this is a real inflection point.`,
      published_at: iso(180),
      url: "https://linkedin.com/example/4",
    },
    {
      source: "twitter",
      author: "Jenna Ok",
      handle: "@jenna_ok",
      text: `${entity.entityName} is trading higher after the announcement. Bullish.`,
      published_at: iso(220),
      url: "https://twitter.com/example/5",
    },
    {
      source: "news",
      author: "Bloomberg",
      handle: "bloomberg.com",
      text: `Analysts raise price target on ${entity.entityName} citing improved outlook.`,
      published_at: iso(330),
      url: "https://bloomberg.com/example/6",
    },
    {
      source: "forum",
      author: "invested123",
      handle: "invested123",
      text: `Deep dive on the latest ${entity.entityName} strategy — my thesis in comments.`,
      published_at: iso(400),
      url: "https://forum.example/7",
    },
    {
      source: "reddit",
      author: "u/dd_daily",
      handle: "u/dd_daily",
      text: `${entity.entityName} DD: revenue mix, competitive threats, and where the next leg of growth comes from.`,
      published_at: iso(520),
      url: "https://reddit.com/example/8",
    },
  ];

  const noise: Omit<Snippet, "id" | "relevance_score" | "relevance_label" | "relevance_reason">[] = [
    {
      source: "twitter",
      author: "cookinglover",
      handle: "@cookinglover",
      text: `${entity.knownNoiseTypes[0] ?? "Unrelated"} — sharing my favorite recipe, tag a friend who'd love this!`,
      published_at: iso(70),
      url: "https://twitter.com/example/n1",
    },
    {
      source: "instagram",
      author: "randomuser",
      handle: "@randomuser",
      text: `Random post that mentions ${entity.entityName.toLowerCase()} but has nothing to do with the actual company or topic.`,
      published_at: iso(310),
      url: "https://instagram.com/example/n2",
    },
  ];

  const withMeta = (
    base: Omit<Snippet, "id" | "relevance_score" | "relevance_label" | "relevance_reason">,
    idx: number,
    label: "Relevant" | "Somewhat Relevant" | "Irrelevant",
    score: number,
    reason: string
  ): Snippet => ({
    id: `mock-${idx}`,
    ...base,
    relevance_score: score,
    relevance_label: label,
    relevance_reason: reason,
  });

  const scoredRelevant = relevant.map((s, i) =>
    withMeta(
      s,
      i,
      i < 6 ? "Relevant" : "Somewhat Relevant",
      i < 6 ? 0.92 : 0.68,
      i < 6
        ? `Direct discussion of ${entity.entityName}'s business or performance.`
        : `On-topic but tangential — mentions ${entity.entityName} but doesn't add much signal.`
    )
  );

  const scoredNoise = noise.map((s, i) =>
    withMeta(
      s,
      relevant.length + i,
      "Irrelevant",
      0.12,
      `Matches the entity name but is unrelated to the target topic (${entity.knownNoiseTypes[0] ?? "off-topic"}).`
    )
  );

  return [...scoredRelevant, ...scoredNoise];
}

function scoringFromSnippets(snippets: Snippet[]): ScoringResult {
  const relevantCount = snippets.filter((s) => s.relevance_label === "Relevant").length;
  const precision = relevantCount / snippets.length;
  return {
    snippets,
    precision,
    threshold: 0.8,
    passed: precision >= 0.8,
    iteration: 0,
  };
}

// ── Streaming pipeline mock ──────────────────────────────────────────────────

export async function* streamMockPipeline(
  request: MockPipelineRequest
): AsyncGenerator<MockEvent> {
  const emit = (event: string, step_id: string, payload: Record<string, unknown>, iteration = 0): MockEvent => ({
    event,
    data: {
      event,
      step_id,
      iteration,
      timestamp: new Date().toISOString(),
      payload,
    },
  });

  // ── Phase 3: scoring already confirmed → smart prompt + create search ─────
  if (request.entity_override && request.boolean_override && request.confirmed_scoring) {
    const entity = request.entity_override;
    const boolean = request.boolean_override;
    const scoring = request.confirmed_scoring;

    await sleep(400);
    yield emit("step_start", "smart_prompt", {
      label: "Crafting Smart Search filter",
      description: "Writing a natural language AI filter to catch semantic noise the boolean can't handle.",
    });
    await sleep(900);
    yield emit("step_complete", "smart_prompt", {
      result_type: "smart_prompt",
      data: {
        prompt: `Include posts that discuss ${entity.entityName} (${entity.industryVertical}) in a substantive business, product, or market context. Exclude generic mentions, unrelated brand collisions, and off-topic references (e.g. ${entity.knownNoiseTypes[0] ?? "unrelated topics"}).`,
        rationale: `The boolean matches the entity name broadly. This filter tightens on intent: business/product/market context, excluding known noise categories.`,
      },
    });

    await sleep(400);
    yield emit("step_start", "production_boolean", {
      label: "Crafting production boolean",
      description: "Building a broader boolean for live use — semantic filtering is handled by the Smart Search prompt.",
    });
    await sleep(800);
    yield emit("step_complete", "production_boolean", {
      result_type: "boolean",
      data: {
        query: `(${entity.entityName} OR ${entity.ticker ?? entity.entityName}) AND ("${entity.industryVertical}" OR earnings OR product)`,
        explanation: "Broader recall — Smart Search prompt handles the precision layer.",
        must_terms: [entity.entityName],
        should_terms: [entity.ticker, entity.industryVertical, "earnings", "product"].filter(Boolean) as string[],
        must_not_terms: [],
      },
    });

    await sleep(400);
    yield emit("step_start", "create_search", {
      label: "Creating search",
      description: "Precision threshold met. Saving the search configuration.",
    });
    await sleep(600);
    const createResult: CreateSearchResult = {
      search_id: `search_${Math.random().toString(36).slice(2, 10)}`,
      label: `${entity.entityName} — ${entity.industryVertical}`,
      query_used: boolean.query,
      smart_prompt_used: `Include posts that discuss ${entity.entityName} in a substantive business, product, or market context.`,
      precision_achieved: scoring.precision,
      iterations_used: 0,
      created_at: new Date().toISOString(),
    };
    yield emit("step_complete", "create_search", {
      result_type: "create_search",
      data: createResult,
    });

    await sleep(200);
    yield emit("pipeline_done", "pipeline", {
      success: true,
      iterations_used: 0,
      final_precision: scoring.precision,
    });
    return;
  }

  // ── Phase 2: boolean confirmed → fetch + score ────────────────────────────
  if (request.entity_override && request.boolean_override) {
    const entity = request.entity_override;

    await sleep(300);
    yield emit("step_start", "snippet_fetch", {
      label: "Fetching sample snippets",
      description: "Generating a realistic sample of matching results based on your entity.",
    });
    await sleep(1200);
    const snippets = buildSnippets(entity);
    yield emit("step_complete", "snippet_fetch", {
      result_type: "snippets",
      data: snippets,
    });

    await sleep(300);
    yield emit("step_start", "relevance_scoring", {
      label: "Scoring snippet relevance",
      description: "Evaluating each result against search intent (target: ≥80% precision). Iteration 1.",
    });
    await sleep(1400);
    const scoring = scoringFromSnippets(snippets);
    yield emit("step_complete", "relevance_scoring", {
      result_type: "scoring",
      data: scoring,
    });

    await sleep(200);
    yield emit("scoring_review_needed", "relevance_scoring", { scoring });
    return;
  }

  // ── Phase 1: initial query → intent + entity + boolean ────────────────────
  await sleep(300);
  yield emit("step_start", "intent_check", {
    label: "Checking intent clarity",
    description: "Evaluating whether the query has enough context to build a targeted search.",
  });
  await sleep(700);
  yield emit("step_complete", "intent_check", {
    result_type: "intent_check",
    data: { sufficient: true },
  });

  await sleep(300);
  yield emit("step_start", "entity_extraction", {
    label: "Analyzing intent & extracting entities",
    description: "Identifying the entity, its aliases, ambiguity signals, and known noise types.",
  });
  await sleep(1100);
  const entity = pickEntityFromQuery(request.query);
  yield emit("step_complete", "entity_extraction", {
    result_type: "entity",
    data: entity,
  });

  await sleep(300);
  yield emit("step_start", "boolean_query", {
    label: "Crafting boolean query",
    description: "Building an OpenSearch boolean query from entity signals and aliases.",
  });
  await sleep(1000);
  const boolean = buildBoolean(entity);
  yield emit("step_complete", "boolean_query", {
    result_type: "boolean",
    data: boolean,
  });

  await sleep(200);
  yield emit("boolean_confirm_needed", "boolean_query", {
    entity,
    boolean,
  });
}

// ── Chat interpret mock ──────────────────────────────────────────────────────

export interface MockInterpretRequest {
  message: string;
  status: string;
  pending_boolean: BooleanQueryResult | null;
  original_query: string;
}

export interface MockInterpretResponse {
  action: "confirm" | "modify_boolean" | "restart" | "answer";
  response_message: string;
  modified_boolean?: BooleanQueryResult;
}

export async function mockInterpretChat(
  request: MockInterpretRequest
): Promise<MockInterpretResponse> {
  await sleep(400);
  const msg = request.message.toLowerCase().trim();

  if (
    /^(looks good|good|great|perfect|yes|yep|yeah|confirm|approve|ok|okay|proceed|continue|go)\b/.test(msg)
  ) {
    return {
      action: "confirm",
      response_message: "Great — continuing with the pipeline.",
    };
  }

  if (/\b(restart|start over|new search|reset)\b/.test(msg)) {
    return {
      action: "restart",
      response_message: "Starting over — tell me what you'd like to search for.",
    };
  }

  return {
    action: "answer",
    response_message:
      "This is a mock — I can only accept 'looks good' (to confirm) or 'restart' (to start over) right now.",
  };
}
