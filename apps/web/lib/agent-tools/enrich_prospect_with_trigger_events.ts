/**
 * enrich_prospect_with_trigger_events — company-local agent tool handler.
 *
 * Fetches company signals (funding rounds, hiring surges, leadership changes)
 * from Apollo and a news aggregation API, scores the enrichment payload, and
 * persists it to sdr_prospects before email generation.
 *
 * Autonomy: autonomous — analysis executes inline via the generic LLM handler;
 * the DB mutation (UPDATE sdr_prospects) is confirm-gated and routes through
 * the cross-boundary bridge.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type Args = Record<string, unknown>;

interface TriggerEvent {
  type: "funding_round" | "hiring_surge" | "leadership_change" | "news_mention";
  title: string;
  description: string;
  date: string;
  source: string;
  relevanceScore: number;
}

interface EnrichmentPayload {
  prospectId: string;
  companyName: string;
  triggerEvents: TriggerEvent[];
  overallScore: number;
  enrichedAt: string;
  apolloData: Record<string, unknown> | null;
}

async function fetchApolloSignals(
  companyDomain: string,
  apolloApiKey: string
): Promise<Record<string, unknown>> {
  const url = `https://api.apollo.io/v1/organizations/enrich?domain=${encodeURIComponent(companyDomain)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apolloApiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

async function fetchNewsSignals(
  companyName: string,
  newsApiKey: string
): Promise<TriggerEvent[]> {
  const query = encodeURIComponent(
    `"${companyName}" funding OR hiring OR "leadership change" OR CEO OR acquisition`
  );
  const url = `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=10&language=en`;

  const response = await fetch(url, {
    headers: { "X-Api-Key": newsApiKey },
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    articles?: Array<{
      title?: string;
      description?: string;
      publishedAt?: string;
      source?: { name?: string };
    }>;
  };

  if (!data.articles) return [];

  return data.articles.map((article) => {
    const titleLower = (article.title ?? "").toLowerCase();
    let eventType: TriggerEvent["type"] = "news_mention";
    if (
      titleLower.includes("funding") ||
      titleLower.includes("raises") ||
      titleLower.includes("series")
    ) {
      eventType = "funding_round";
    } else if (
      titleLower.includes("hiring") ||
      titleLower.includes("headcount") ||
      titleLower.includes("expand")
    ) {
      eventType = "hiring_surge";
    } else if (
      titleLower.includes("ceo") ||
      titleLower.includes("cto") ||
      titleLower.includes("appoints") ||
      titleLower.includes("leadership")
    ) {
      eventType = "leadership_change";
    }

    return {
      type: eventType,
      title: article.title ?? "",
      description: article.description ?? "",
      date: article.publishedAt ?? new Date().toISOString(),
      source: article.source?.name ?? "Unknown",
      relevanceScore: scoreArticleRelevance(
        article.title ?? "",
        article.description ?? ""
      ),
    };
  });
}

function scoreArticleRelevance(title: string, description: string): number {
  const text = `${title} ${description}`.toLowerCase();
  let score = 50;

  const highSignalTerms = [
    "funding",
    "series",
    "raises",
    "acquisition",
    "merger",
    "ipo",
    "hiring",
    "expand",
  ];
  const mediumSignalTerms = [
    "appoints",
    "ceo",
    "cto",
    "leadership",
    "partnership",
    "launch",
    "growth",
  ];

  for (const term of highSignalTerms) {
    if (text.includes(term)) score += 10;
  }
  for (const term of mediumSignalTerms) {
    if (text.includes(term)) score += 5;
  }

  return Math.min(score, 100);
}

function extractApolloTriggerEvents(
  apolloData: Record<string, unknown>
): TriggerEvent[] {
  const events: TriggerEvent[] = [];
  const org = (apolloData as { organization?: Record<string, unknown> })
    .organization;
  if (!org) return events;

  const fundingEvents = (
    org as { funding_events?: Array<Record<string, unknown>> }
  ).funding_events ?? [];

  for (const funding of fundingEvents) {
    const amount = funding.amount != null ? String(funding.amount) : "undisclosed";
    const currency = String(funding.currency ?? "$");
    const fundingType = String(funding.funding_type ?? "Funding Round");
    const announcedAt = String(funding.announced_at ?? new Date().toISOString());

    events.push({
      type: "funding_round",
      title: `${fundingType} — ${currency}${amount}`,
      description: `Announced ${announcedAt}`,
      date: announcedAt,
      source: "Apollo",
      relevanceScore: 85,
    });
  }

  const currentEmployees = Number(
    (org as { estimated_num_employees?: number }).estimated_num_employees ?? 0
  );
  if (currentEmployees > 500) {
    events.push({
      type: "hiring_surge",
      title: `Large organization: ~${currentEmployees.toLocaleString()} employees`,
      description: "Company size indicates active hiring capacity",
      date: new Date().toISOString(),
      source: "Apollo",
      relevanceScore: 60,
    });
  }

  return events;
}

function computeOverallScore(events: TriggerEvent[]): number {
  if (events.length === 0) return 0;

  const weights: Record<TriggerEvent["type"], number> = {
    funding_round: 1.0,
    leadership_change: 0.9,
    hiring_surge: 0.85,
    news_mention: 0.6,
  };

  const weightedSum = events.reduce(
    (acc, ev) => acc + ev.relevanceScore * weights[ev.type],
    0
  );

  return Math.round((weightedSum / (events.length * 100)) * 100);
}

export async function handleEnrichProspectWithTriggerEvents(
  ctx: HandlerContext,
  args: Args
): Promise<HandlerResult> {
  const prospectId = args.prospect_id as string | undefined;
  const companyDomain = args.company_domain as string | undefined;
  const companyName = args.company_name as string | undefined;

  if (!prospectId || !companyDomain || !companyName) {
    return {
      status: 400,
      body: "Missing required args: prospect_id, company_domain, company_name",
    };
  }

  const apolloApiKey = process.env.APOLLO_API_KEY;
  const newsApiKey = process.env.NEWS_API_KEY;

  if (!apolloApiKey) {
    return {
      status: 500,
      body: "APOLLO_API_KEY environment variable is not configured",
    };
  }

  let apolloData: Record<string, unknown> | null = null;
  let apolloEvents: TriggerEvent[] = [];

  try {
    apolloData = await fetchApolloSignals(companyDomain, apolloApiKey);
    apolloEvents = extractApolloTriggerEvents(apolloData);
  } catch (apolloErr) {
    console.error(
      JSON.stringify({
        level: "warn",
        msg: "Apollo API fetch failed",
        error: String(apolloErr),
        prospectId,
      })
    );
  }

  let newsEvents: TriggerEvent[] = [];
  if (newsApiKey) {
    try {
      newsEvents = await fetchNewsSignals(companyName, newsApiKey);
    } catch (newsErr) {
      console.error(
        JSON.stringify({
          level: "warn",
          msg: "News API fetch failed",
          error: String(newsErr),
          prospectId,
        })
      );
    }
  }

  const allEvents = [...apolloEvents, ...newsEvents].sort(
    (a, b) => b.relevanceScore - a.relevanceScore
  );
  const overallScore = computeOverallScore(allEvents);
  const enrichedAt = new Date().toISOString();

  try {
    await ctx.db.execute(
      `UPDATE sdr_prospects
          SET trigger_events   = $1,
              enrichment_score = $2,
              enriched_at      = $3
        WHERE id = $4`,
      JSON.stringify(allEvents),
      overallScore,
      enrichedAt,
      prospectId
    );
  } catch (dbErr) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "DB update failed",
        error: String(dbErr),
        prospectId,
      })
    );
    return {
      status: 500,
      body: `Failed to persist enrichment: ${String(dbErr)}`,
    };
  }

  console.info(
    JSON.stringify({
      level: "info",
      msg: "Prospect enriched with trigger events",
      prospectId,
      overallScore,
      eventCount: allEvents.length,
    })
  );

  const payload: EnrichmentPayload = {
    prospectId,
    companyName,
    triggerEvents: allEvents,
    overallScore,
    enrichedAt,
    apolloData,
  };

  return {
    status: 200,
    body: payload as unknown as Record<string, unknown>,
  };
}
