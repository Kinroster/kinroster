"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";

// Phase 4: family voice memo recorder.
//
// Records via MediaRecorder, uploads via the two-step pipeline:
//   1. POST /api/family/memos → { memoId, uploadUrl, token, storagePath }
//   2. PUT uploadUrl with the audio blob
//
// On success, calls router.refresh() so the parent page reflects the
// new pending memo.

const MAX_DURATION_S = 90;

interface VoiceMemoRecorderProps {
  residentId: string;
  familyUserLinkId: string;
  consentCaptured: boolean;
}

type RecorderState = "idle" | "recording" | "preview" | "uploading";

export function VoiceMemoRecorder({
  residentId,
  familyUserLinkId,
  consentCaptured,
}: VoiceMemoRecorderProps) {
  const router = useRouter();
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    if (!consentCaptured) {
      toast.error(
        "Recording consent has not been captured. Ask the facility admin to capture family-recording consent before you can leave a memo."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(b);
        setState("preview");
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_DURATION_S) {
            stop();
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Microphone access denied: ${err.message}`
          : "Microphone access denied"
      );
    }
  }

  function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  function discard() {
    setBlob(null);
    setSeconds(0);
    setState("idle");
  }

  async function upload() {
    if (!blob) return;
    setState("uploading");
    try {
      const reqRes = await fetch("/api/family/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId,
          familyUserLinkId,
          durationSeconds: seconds,
        }),
      });
      if (!reqRes.ok) {
        const err = await reqRes.json();
        toast.error(err.error || "Failed to request upload");
        setState("preview");
        return;
      }
      const { uploadUrl } = (await reqRes.json()) as { uploadUrl: string };

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/webm" },
        body: blob,
      });
      if (!putRes.ok) {
        toast.error("Failed to upload audio");
        setState("preview");
        return;
      }

      toast.success(
        "Memo sent. The facility admin will review and approve before it's added to the care record."
      );
      setBlob(null);
      setSeconds(0);
      setState("idle");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Upload failed"
      );
      setState("preview");
    }
  }

  if (!consentCaptured) {
    return (
      <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
        Family-recording consent has not been captured for this resident.
        Ask the facility administrator to capture it before recording.
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Leave a voice memo</h3>
        <span className="text-xs text-muted-foreground">
          {state === "recording"
            ? `Recording · ${seconds}s / ${MAX_DURATION_S}s`
            : state === "preview"
            ? `${seconds}s recorded`
            : "Up to 90 seconds"}
        </span>
      </div>

      {state === "idle" && (
        <Button onClick={start} className="w-full">
          <Mic className="mr-2 h-4 w-4" />
          Start recording
        </Button>
      )}

      {state === "recording" && (
        <Button onClick={stop} variant="destructive" className="w-full">
          <Square className="mr-2 h-4 w-4" />
          Stop
        </Button>
      )}

      {state === "preview" && (
        <div className="space-y-2">
          {blob && (
            <audio
              controls
              src={URL.createObjectURL(blob)}
              className="w-full"
            />
          )}
          <div className="flex gap-2">
            <Button onClick={upload} className="flex-1">
              <Upload className="mr-2 h-4 w-4" />
              Send to facility
            </Button>
            <Button variant="outline" onClick={discard}>
              <X className="mr-2 h-4 w-4" />
              Discard
            </Button>
          </div>
        </div>
      )}

      {state === "uploading" && (
        <Button disabled className="w-full">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Uploading…
        </Button>
      )}

      <p className="text-[10px] text-muted-foreground">
        Memos are reviewed by a facility administrator before they reach
        the care team. Audio is deleted after transcription; the text
        becomes part of the record.
      </p>
    </div>
  );
}
