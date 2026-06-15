"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Mic,
  PhoneOff,
  Loader2,
  ShieldCheck,
  UserPlus,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { User } from "@/types/database";

type CallMode = "global" | "onboarding";
type CallState =
  | "idle"
  | "mode-select"
  | "consent"
  | "starting"
  | "in-call"
  | "ending"
  | "processing";

const CONSENT_VERSION = "v1";
const CONSENT_STORAGE_KEY = "kinroster_voice_consent_v1";

function readStoredConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "true");
  } catch {
    // acceptable — user sees the consent dialog again next time
  }
}

interface VapiClient {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  start: (assistantId: string, overrides?: unknown) => Promise<unknown>;
  stop: () => void;
}

export function GlobalCallButton({ user }: { user: User }) {
  const router = useRouter();
  const [state, setState] = useState<CallState>("idle");
  const [mode, setMode] = useState<CallMode>("global");
  const vapiRef = useRef<VapiClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const isActive =
    state === "in-call" || state === "ending" || state === "starting";
  const isProcessing = state === "processing";

  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  const handleButtonClick = useCallback(() => {
    if (state === "in-call") {
      // Hang up
      setState("ending");
      vapiRef.current?.stop();
      return;
    }
    if (state !== "idle") return;
    setState("mode-select");
  }, [state]);

  function handleModeSelect(selectedMode: CallMode) {
    setMode(selectedMode);
    if (!readStoredConsent()) {
      setState("consent");
    } else {
      void startCall(selectedMode);
    }
  }

  async function handleConsentAccept() {
    persistConsent();
    await startCall(mode);
  }

  function handleConsentCancel() {
    setState("idle");
  }

  async function startCall(callMode: CallMode) {
    setState("starting");

    try {
      const endpoint =
        callMode === "onboarding"
          ? "/api/voice/start-onboarding"
          : "/api/voice/start-global";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingConsentAccepted: true,
          recordingConsentVersion: CONSENT_VERSION,
        }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to start call");
      }

      const { sessionId, assistantId, publicKey, assistantOverrides } =
        await res.json();
      sessionIdRef.current = sessionId;

      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(publicKey) as unknown as VapiClient;
      vapiRef.current = vapi;

      vapi.on("call-start", () => setState("in-call"));

      vapi.on("call-end", () => {
        if (callMode === "onboarding") {
          void processOnboarding();
        } else {
          setState("idle");
          toast.success("Call ended");
          router.refresh();
        }
      });

      vapi.on("error", (...args: unknown[]) => {
        const err = args[0];
        const msg =
          err instanceof Error ? err.message : String(err ?? "Call error");
        if (msg.includes("Meeting has ended") || msg.includes("ejection"))
          return;
        toast.error(msg);
        setState("idle");
      });

      await vapi.start(assistantId, assistantOverrides);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start call";
      toast.error(msg);
      setState("idle");
    }
  }

  async function processOnboarding() {
    setState("processing");
    try {
      const res = await fetch("/api/voice/process-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error || "Could not extract resident info from call");
        setState("idle");
        // Fall back to the manual form
        router.push("/residents/new");
        return;
      }

      const { residentId } = await res.json();
      toast.success("Resident added from voice call!");
      setState("idle");
      router.push(`/residents/${residentId}`);
    } catch {
      toast.error("Failed to process call. Opening manual form instead.");
      setState("idle");
      router.push("/residents/new");
    }
  }

  const firstName = (user.full_name ?? "").split(" ")[0] || "there";

  return (
    <>
      {/* Floating Siri-style button */}
      <button
        onClick={handleButtonClick}
        disabled={state === "starting" || state === "ending" || state === "processing"}
        className={cn(
          "fixed z-50 focus:outline-none",
          // Mobile: above the bottom nav bar (h-16 = 64px, add 8px gap)
          "bottom-[76px] right-4",
          // Desktop: bottom left of the content area
          "md:bottom-6 md:right-4",
          "hover:cursor-pointer"
        )}
        aria-label={isActive ? "End call" : "Start voice call"}
      >
        <div className="relative h-14 w-14">
          {/* Siri rotating gradient ring — visible when active */}
          {isActive && (
            <div
              className="absolute -inset-[3px] rounded-full animate-spin"
              style={{
                background:
                  "conic-gradient(from 0deg, #06b6d4, #8b5cf6, #ec4899, #f97316, #22d3ee, #06b6d4)",
                filter: "blur(4px)",
              }}
            />
          )}
          {/* Idle pulse ring */}
          {state === "idle" && (
            <div className="absolute -inset-[3px] rounded-full bg-primary/25 animate-pulse" />
          )}
          {/* Processing pulse ring */}
          {isProcessing && (
            <div className="absolute -inset-[3px] rounded-full bg-amber-400/30 animate-pulse" />
          )}
          {/* Main button face */}
          <div
            className={cn(
              "relative z-10 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300",
              isActive
                ? "bg-slate-900 dark:bg-white"
                : isProcessing
                ? "bg-amber-500"
                : "bg-primary"
            )}
          >
            {state === "idle" && (
              <Mic className="h-6 w-6 text-white" />
            )}
            {state === "mode-select" && (
              <Mic className="h-6 w-6 text-white" />
            )}
            {state === "starting" && (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            )}
            {state === "in-call" && (
              <PhoneOff className={cn("h-6 w-6", "text-white dark:text-slate-900")} />
            )}
            {state === "ending" && (
              <Loader2 className={cn("h-6 w-6 animate-spin", "text-white dark:text-slate-900")} />
            )}
            {state === "processing" && (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            )}
            {state === "consent" && (
              <ShieldCheck className="h-6 w-6 text-white" />
            )}
          </div>
        </div>
      </button>

      {/* Mode selection dialog */}
      <Dialog
        open={state === "mode-select"}
        onOpenChange={(open) => {
          if (!open) setState("idle");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              Start a voice call
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Hi {firstName}! What would you like to do?
          </p>
          <div className="flex flex-col gap-3 mt-2">
            <button
              onClick={() => handleModeSelect("global")}
              className="flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Report on a patient</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Start a care note call — the AI will ask which patient this is for.
                </p>
              </div>
            </button>
            <button
              onClick={() => handleModeSelect("onboarding")}
              className="flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Add a new resident</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tell the AI about a new resident and their profile will be
                  created automatically.
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recording consent dialog */}
      <Dialog
        open={state === "consent"}
        onOpenChange={(open) => {
          if (!open) handleConsentCancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Recording notice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Voice calls on Kinroster are transcribed and saved as part of the
              care record. By continuing, you acknowledge:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>This call will be recorded and transcribed.</li>
              <li>
                The transcript becomes part of the care record in Kinroster.
              </li>
              <li>
                You&apos;re authorized to document care on behalf of your
                facility.
              </li>
              <li>
                Audio is not stored; transcripts follow your facility&apos;s
                retention policy.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              This acknowledgment is recorded on the audit log. You&apos;ll
              only see this once on this device.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleConsentCancel}>
              Cancel
            </Button>
            <Button onClick={() => void handleConsentAccept()}>
              I acknowledge — start call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Processing overlay (while extracting resident data) */}
      {isProcessing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">Creating resident profile…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Extracting information from your call
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
