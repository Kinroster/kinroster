import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio") as Blob | null;
  const caregiverLanguage = formData.get("caregiverLanguage");

  if (!audio) {
    return NextResponse.json({ error: "Audio file required" }, { status: 400 });
  }

  // Validate audio size (max 25MB for Whisper)
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Audio file too large (max 25MB)" },
      { status: 400 }
    );
  }

  try {
    // Send to OpenAI Whisper API. Language hint comes from the caregiver's
    // preferred_language (BCP-47, e.g. 'zh-TW', 'vi', 'id', 'en'). Whisper
    // accepts ISO-639-1 codes only, so we strip any region tag. When unset,
    // Whisper auto-detects — handles caregivers without a profile language
    // and tolerates code-switching better than locking a language.
    const whisperFormData = new FormData();
    whisperFormData.append("file", audio, "recording.webm");
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("response_format", "verbose_json");

    if (typeof caregiverLanguage === "string" && caregiverLanguage.length > 0) {
      const isoCode = caregiverLanguage.split("-")[0].toLowerCase();
      if (/^[a-z]{2}$/.test(isoCode)) {
        whisperFormData.append("language", isoCode);
      }
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: whisperFormData,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Transcription failed", details: error },
        { status: 502 }
      );
    }

    const result = await response.json();

    // Audio is never stored — only the transcript and Whisper's detected
    // language are returned. Detected language is ISO-639-1 (e.g. 'vi'); the
    // client persists it on the voice_session row.
    return NextResponse.json({
      transcript: result.text,
      detectedLanguage: result.language ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Transcription failed", details: message },
      { status: 500 }
    );
  }
}
