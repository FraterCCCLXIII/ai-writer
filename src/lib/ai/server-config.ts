/**
 * Merge client-provided OpenAI overrides (from local settings) with server env.
 */
export function resolveOpenAiFromRequest(body: {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
}): { apiKey: string | null; baseUrl: string; model: string } {
  const apiKey =
    body.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim() || null;
  const baseUrl = (
    body.openaiBaseUrl?.trim() ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model =
    body.openaiModel?.trim() || process.env.OPENAI_MODEL || "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}
