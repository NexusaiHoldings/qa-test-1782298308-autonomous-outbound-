/**
 * classify_reply_intent — company-local agent tool handler.
 *
 * Calls the LLM gateway with structured output to classify an inbound reply
 * as interested/not_now/unsubscribe/out_of_office/other, then writes the
 * classification to sdr_replies; called by the Gmail reply webhook to trigger
 * autonomous follow-up routing.
 *
 * Autonomy: confirm — LLM classification executes inline as analysis;
 * the DB mutation (UPDATE sdr_replies) is confirm-gated via the handler result.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type Args = Record<string, unknown>;

type ReplyIntent =
  | "interested"
  | "not_now"
  | "unsubscribe"
  | "out_of_office"
  | "other";

interface ClassificationResult {
  intent: ReplyIntent;
  confidence: number;
  reasoning: string;
}

interface LLMGatewayResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const VALID_INTENTS: ReplyIntent[] = [
  "interested",
  "not_now",
  "unsubscribe",
  "out_of_office",
  "other",
];

async function classifyReplyWithLLM(
  replyText: string,
  gatewayUrl: string,
  gatewayApiKey: string
): Promise<ClassificationResult> {
  const systemPrompt = `You are an expert SDR assistant that classifies email replies into intent categories.
Analyze the reply and return a JSON object with exactly these fields:
- intent: one of "interested", "not_now", "unsubscribe", "out_of_office", "other"
- confidence: integer 0-100 representing your confidence
- reasoning: brief explanation of your classification

Classification guide:
- "interested": recipient shows positive interest, asks for more info, or wants to schedule
- "not_now": recipient is not interested right now but may be later, or politely declines temporarily
- "unsubscribe": recipient explicitly requests removal from the list or never to be contacted again
- "out_of_office": automated out-of-office reply or person is temporarily unavailable
- "other": anything that does not fit the above categories`;

  const response = await fetch(`${gatewayUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Classify the intent of this email reply:\n\n${replyText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM gateway error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as LLMGatewayResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("LLM gateway returned empty response");
  }

  const parsed = JSON.parse(content) as Partial<ClassificationResult>;

  const intent: ReplyIntent = VALID_INTENTS.includes(
    parsed.intent as ReplyIntent
  )
    ? (parsed.intent as ReplyIntent)
    : "other";

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
      : 50;

  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.length > 0
      ? parsed.reasoning
      : "No reasoning provided";

  return { intent, confidence, reasoning };
}

export async function handleClassifyReplyIntent(
  ctx: HandlerContext,
  args: Args
): Promise<HandlerResult> {
  const replyId = args.reply_id as string | undefined;
  const replyText = args.reply_text as string | undefined;

  if (!replyId) {
    return { status: 400, body: "Missing required arg: reply_id" };
  }

  if (!replyText) {
    return { status: 400, body: "Missing required arg: reply_text" };
  }

  const gatewayUrl = process.env.LLM_GATEWAY_URL;
  const gatewayApiKey = process.env.LLM_GATEWAY_API_KEY;

  if (!gatewayUrl) {
    return {
      status: 500,
      body: "LLM_GATEWAY_URL environment variable is not configured",
    };
  }

  if (!gatewayApiKey) {
    return {
      status: 500,
      body: "LLM_GATEWAY_API_KEY environment variable is not configured",
    };
  }

  let classification: ClassificationResult;

  try {
    classification = await classifyReplyWithLLM(
      replyText,
      gatewayUrl,
      gatewayApiKey
    );
  } catch (llmErr) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "LLM classification failed",
        error: String(llmErr),
        replyId,
      })
    );
    return {
      status: 500,
      body: `LLM classification failed: ${String(llmErr)}`,
    };
  }

  const classifiedAt = new Date().toISOString();

  try {
    await ctx.db.execute(
      `UPDATE sdr_replies
          SET intent            = $1,
              confidence        = $2,
              intent_reasoning  = $3,
              classified_at     = $4
        WHERE id = $5`,
      classification.intent,
      classification.confidence,
      classification.reasoning,
      classifiedAt,
      replyId
    );
  } catch (dbErr) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "DB update failed for reply classification",
        error: String(dbErr),
        replyId,
      })
    );
    return {
      status: 500,
      body: `Failed to persist classification: ${String(dbErr)}`,
    };
  }

  console.info(
    JSON.stringify({
      level: "info",
      msg: "Reply intent classified and persisted",
      replyId,
      intent: classification.intent,
      confidence: classification.confidence,
    })
  );

  return {
    status: 200,
    body: {
      replyId,
      intent: classification.intent,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      classifiedAt,
    } as unknown as Record<string, unknown>,
  };
}
