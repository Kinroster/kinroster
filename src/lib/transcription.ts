// Shared Deepgram transcription helper for prerecorded audio.
// Used by the family-memo approval flow. The diligence flow has its own
// deeper integration in src/lib/diligence/transcription.ts (diarization,
// utterance segments).

const DEEPGRAM_ENDPOINT = "https://api.deepgram.com/v1/listen";

// ISO-639-1 codes Deepgram nova-3 handles well.
// If the code isn't in this set we omit the hint and let Deepgram auto-detect.
const SUPPORTED_LANGUAGES = new Set([
  "en", "zh", "vi", "id", "tl", "th", "ja", "ko", "es", "fr", "de", "pt",
]);

function languageParam(bcp47: string | null | undefined): string {
  if (!bcp47) return "auto";
  const code = bcp47.split("-")[0]?.toLowerCase() ?? "";
  return SUPPORTED_LANGUAGES.has(code) ? code : "auto";
}

// Transcribe raw audio bytes (Blob or Buffer).
// Returns the transcript string, or throws on failure.
export async function transcribeAudioBlob(
  audio: Blob,
  options: { language?: string | null; mimeType?: string } = {}
): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not configured");

  const lang = languageParam(options.language);

  const params = new URLSearchParams({
    model: "nova-3",
    language: lang,
    punctuate: "true",
    smart_format: "true",
  });

  const contentType = options.mimeType ?? audio.type ?? "audio/webm";

  const response = await fetch(`${DEEPGRAM_ENDPOINT}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": contentType,
    },
    body: audio,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Deepgram transcription failed (${response.status}): ${detail}`
    );
  }

  const body = (await response.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
  };

  const transcript =
    body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";

  return transcript;
}
