import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type WebSearchHit = {
  title: string;
  url: string;
  content: string;
};

type IncomingAttachment = {
  name?: string;
  language?: string;
  content?: string;
};

function toSse(content: string) {
  const chunk = JSON.stringify({ choices: [{ delta: { content } }] });
  return `data: ${chunk}\n\ndata: [DONE]\n\n`;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function trimToWords(text: string, maxWords: number) {
  const words = normalizeWhitespace(text).split(" ").filter(Boolean);
  if (words.length <= maxWords) return normalizeWhitespace(text);
  return `${words.slice(0, maxWords).join(" ")}.`;
}

function trimToWordsPreserveLines(text: string, maxWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  const trimmed = words.slice(0, maxWords).join(" ");
  return `${trimmed}...`;
}

function isGreeting(text: string) {
  return /^(hi|hey|hello|yo|hola|namaste|good morning|good afternoon|good evening)[.! ]*$/i.test(
    normalizeWhitespace(text).toLowerCase()
  );
}

function isLikelyCodePrompt(text: string) {
  return /```|^\s{2,}|\b(function|class|def|const|let|var|import|from|return|SELECT|INSERT|UPDATE|DELETE)\b|[{}[\];]/im.test(
    text
  );
}

function isCodeReviewRequest(text: string) {
  return /\b(review|check my code|debug|fix this|refactor|optimi[sz]e|explain this code|why error|bug)\b/i.test(text);
}

function isDocumentReviewRequest(text: string) {
  return /\b(review|audit|assess|evaluate|check|sop|document|policy|protocol|csv|pharma|compliance|gap analysis)\b/i.test(
    text
  );
}

function formatWebContext(hits: WebSearchHit[]) {
  if (!hits.length) return "(none)";
  return hits
    .map((hit, idx) => {
      const snippet = normalizeWhitespace(hit.content).slice(0, 320);
      return `[${idx + 1}] ${hit.title}\nURL: ${hit.url}\nSnippet: ${snippet}`;
    })
    .join("\n\n");
}

function formatCitations(hits: WebSearchHit[]) {
  if (!hits.length) return "";
  const top = hits.slice(0, 2);
  const lines = top.map((hit, idx) => `[${idx + 1}] ${hit.url}`);
  return `\nSources:\n${lines.join("\n")}`;
}

function formatAttachmentContext(attachments: IncomingAttachment[]) {
  if (!attachments.length) return "(none)";
  return attachments
    .map((file, idx) => {
      const name = typeof file.name === "string" && file.name.trim() ? file.name.trim() : `file-${idx + 1}`;
      const language = typeof file.language === "string" && file.language.trim() ? file.language.trim() : "text";
      const content = typeof file.content === "string" ? file.content.trim() : "";
      return `Attachment ${idx + 1}: ${name}\n\`\`\`${language}\n${content}\n\`\`\``;
    })
    .join("\n\n");
}

function isGibberishAttachment(text: string) {
  if (!text) return true;
  const sample = text.slice(0, 3000);
  let controlChars = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    const isControl = code < 32 && code !== 9 && code !== 10 && code !== 13;
    if (isControl) controlChars++;
  }
  return controlChars / sample.length > 0.03;
}

async function runLiveWebSearch(query: string, apiKey: string, maxResults = 5): Promise<WebSearchHit[]> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Live web search failed: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r) => r && typeof r.url === "string" && typeof r.title === "string")
    .map((r) => ({
      title: String(r.title),
      url: String(r.url),
      content: typeof r.content === "string" ? r.content : "",
    }))
    .slice(0, maxResults);
}

function enforceConciseReply(userText: string, modelText: string) {
  const input = normalizeWhitespace(userText).toLowerCase();
  const output = modelText.trim();

  if (isGreeting(input)) return "Hey.";

  // Preserve structure for code/review tasks.
  if (isLikelyCodePrompt(userText) || isCodeReviewRequest(userText) || isDocumentReviewRequest(userText)) {
    return trimToWordsPreserveLines(output, 420);
  }

  const flattenedOutput = normalizeWhitespace(output);

  // Keep just the first sentence by default to avoid rambling.
  const firstSentence = flattenedOutput.split(/(?<=[.!?])\s+/)[0] ?? flattenedOutput;

  // Do not ask follow-up questions unless user explicitly asks for help/question.
  const userAskedQuestion = userText.includes("?");
  let concise = firstSentence;
  if (!userAskedQuestion) {
    concise = concise.replace(/\s*\?+$/, ".");
  }

  // Short inputs should get very short outputs.
  if (input.split(" ").length <= 3) {
    return trimToWords(concise, 8);
  }

  return trimToWords(concise, 18);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, persona, attachments } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const knowledgeSource = persona.knowledgeSource ?? "internet";
    const internetDataAccess = persona.internetDataAccess !== false;
    const providedLinks = typeof persona.providedLinks === "string" ? persona.providedLinks.trim() : "";
    const providedKnowledge = typeof persona.providedKnowledge === "string" ? persona.providedKnowledge.trim() : "";
    const incomingAttachments = Array.isArray(attachments) ? attachments : [];
    const parsedAttachments: IncomingAttachment[] = incomingAttachments.length
      ? incomingAttachments
          .filter(
            (a: IncomingAttachment) =>
              a &&
              typeof a === "object" &&
              typeof a.content === "string" &&
              a.content.trim().length > 0 &&
              !isGibberishAttachment(a.content)
          )
          .slice(0, 5)
      : [];
    const attachmentContext = formatAttachmentContext(parsedAttachments);

    if (incomingAttachments.length > 0 && parsedAttachments.length === 0) {
      return new Response(
        toSse("I could not read the uploaded file. Please upload .docx, .txt, .md, or .csv."),
        { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } }
      );
    }

    const lastUserText = (messages?.[messages.length - 1]?.content as string | undefined) ?? "";
    const reviewMode = isDocumentReviewRequest(lastUserText) || parsedAttachments.length > 0;
    const useLiveWebSearch = internetDataAccess && (knowledgeSource === "internet" || knowledgeSource === "both");
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");

    let liveWebHits: WebSearchHit[] = [];
    if (
      useLiveWebSearch &&
      !isGreeting(lastUserText) &&
      !isLikelyCodePrompt(lastUserText) &&
      normalizeWhitespace(lastUserText).length > 2
    ) {
      if (!TAVILY_API_KEY) {
        console.warn("TAVILY_API_KEY is not configured. Continuing without live web search.");
      } else {
        try {
          liveWebHits = await runLiveWebSearch(lastUserText, TAVILY_API_KEY, 5);
        } catch (err) {
          console.error("Live web search error:", err);
        }
      }
    }

    let knowledgeRules = "";
    if (knowledgeSource === "provided") {
      knowledgeRules = `Knowledge source policy:
- Use only PROVIDED context (links and provided notes) for factual answers.
- If PROVIDED context is missing for a question, clearly say the information is not available in provided sources.
- Do not rely on outside or internet knowledge.`;
    } else if (knowledgeSource === "both") {
      knowledgeRules = `Knowledge source policy:
- Use PROVIDED context and LIVE WEB results together.
- Prefer PROVIDED context when there is any conflict.
- For factual statements from web context, cite with [n].`;
    } else {
      knowledgeRules = `Knowledge source policy:
- Use LIVE WEB results for factual statements.
- Cite factual web statements with [n].
- If live web results are empty, say you could not verify from live web.`;
    }
    if (!internetDataAccess) {
      knowledgeRules += `
- Internet data access is disabled for this persona. Do not use live web data.`;
    }

    const responseLengthRule = reviewMode
      ? `Length rule:
- For review mode, complete all required sections fully.
- Keep each section concise, but do not cut off mid-sentence.`
      : `Length rule:
- Limit every response to 40 words maximum.`;

    // Build dynamic system prompt from persona
    const systemPrompt = `You are ${persona.name}, a ${persona.role} with ${persona.experience} years of experience in ${persona.skills}.

Your personality: ${persona.traits}
Your communication style: ${persona.communicationStyle}
Background: ${persona.background}
Custom instructions:
${typeof persona.customInstructions === "string" && persona.customInstructions.trim() ? persona.customInstructions.trim() : "(none)"}
Selected source mode: ${knowledgeSource}
Internet data access: ${internetDataAccess ? "enabled" : "disabled"}
Provided links:
${providedLinks || "(none)"}
Provided context:
${providedKnowledge || "(none)"}
Current uploaded attachments:
${attachmentContext}
Live web search context (numbered sources):
${formatWebContext(liveWebHits)}

${knowledgeRules}

You must behave exactly like this person.

Response Behavior:
- Be concise by default: one short sentence
- Give only what the user asked for
- Do not add extra background, examples, disclaimers, side notes, or follow-up questions unless requested
- For greetings like "hi", "hello", "hey", reply with 1-4 words only
- For yes/no questions, start with "Yes" or "No" and stop unless user asks for details
- If details are requested, keep it under 3 short bullet points
- When using live web context, include [n] citation markers
- Do not paste or repeat full raw attachment content in your response

Tone Rules:
- Keep persona tone, but never increase length just for style
- Do NOT sound like an AI assistant
- Do NOT mention being an AI or a language model — ever

Interaction Style:
- Focus on helping in a practical, real-world way
- Stay in character at all times
- Never include unrelated content
- If the user asks for a short or direct answer, respond in 1 line

${responseLengthRule}

${reviewMode ? `Review Mode (enabled):
- The user is asking for file/document review. Prioritize structured, useful review over short reply.
- Use this exact output shape:
1) Quick Verdict
2) Missing Items
3) What To Change
4) Risks If Not Changed
5) Suggested Next Draft (short)
- Keep points concrete and tied to the provided file content.
- If information is missing to decide, state exactly what is missing.
- For pharma/SOP style reviews, call out compliance gaps, ambiguity, missing controls, and traceability issues.
- End cleanly after section 5. Do not ask trailing unfinished questions.` : ""}`;

    const maxTokens = reviewMode ? 4200 : 80;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: false,
          max_tokens: maxTokens,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI service error. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await response.json();
    const rawAssistantText = payload?.choices?.[0]?.message?.content as string | undefined;
    const conciseText = enforceConciseReply(lastUserText, rawAssistantText ?? "");
    const shouldAppendCitations =
      !isLikelyCodePrompt(lastUserText) &&
      !isCodeReviewRequest(lastUserText) &&
      !isDocumentReviewRequest(lastUserText);
    const finalText = isGreeting(lastUserText)
      ? conciseText
      : shouldAppendCitations
        ? `${conciseText}${formatCitations(liveWebHits)}`
        : conciseText;

    return new Response(toSse(finalText), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("persona-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
