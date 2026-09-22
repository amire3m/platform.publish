export interface AiGenerateOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function aiGenerate(prompt: string, opts?: AiGenerateOptions): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const kimiKey = process.env.MOONSHOT_API_KEY?.trim();
  const glmKey = process.env.GLM_API_KEY?.trim();

  // Priority: OpenRouter > OpenAI > Gemini > Kimi > GLM
  if (openrouterKey) {
    return callOpenAICompatible("https://openrouter.ai/api/v1/chat/completions", openrouterKey, "openai/gpt-4o-mini", prompt, opts);
  }
  if (openaiKey) {
    return callOpenAICompatible("https://api.openai.com/v1/chat/completions", openaiKey, process.env.OPENAI_MODEL ?? "gpt-4o-mini", prompt, opts);
  }
  if (kimiKey) {
    return callOpenAICompatible("https://api.moonshot.cn/v1/chat/completions", kimiKey, "moonshot-v1-8k", prompt, opts);
  }
  if (glmKey) {
    return callOpenAICompatible("https://open.bigmodel.cn/api/paas/v4/chat/completions", glmKey, "glm-4", prompt, opts);
  }
  if (geminiKey) {
    return callGemini(geminiKey, prompt, opts);
  }
  throw new Error("هیچ کلید AI تنظیم نشده — OPENAI_API_KEY یا GEMINI_API_KEY یا OPENROUTER_API_KEY را در .env بگذارید.");
}

async function callOpenAICompatible(baseUrl: string, key: string, model: string, prompt: string, opts?: AiGenerateOptions): Promise<string> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(opts?.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens ?? 1200,
    }),
  });
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `AI error ${res.status}`);
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

async function callGemini(key: string, prompt: string, opts?: AiGenerateOptions): Promise<string> {
  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: opts?.systemPrompt ? `${opts.systemPrompt}\n\n${prompt}` : prompt }] }],
      generationConfig: { temperature: opts?.temperature ?? 0.7, maxOutputTokens: opts?.maxTokens ?? 1200 },
    }),
  });
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Gemini error ${res.status}`);
  return String(json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.MOONSHOT_API_KEY || process.env.GLM_API_KEY);
}
