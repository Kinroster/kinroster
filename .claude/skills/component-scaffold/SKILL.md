---
name: component-scaffold
description: |
  Scaffold a Kinroster React form or multi-step dialog component in the
  repo's house style: "use client", useState + loading flag, createClient()
  from @/lib/supabase/client, FormData parsing, sonner toasts, shadcn/ui
  components only (never native elements), semantic Tailwind colors,
  lucide-react icons, and the base-ui DialogTrigger render={<Button/>}
  pattern for dialogs.

  Use this skill when the user says any of: "scaffold a form", "new form
  component", "new dialog", "new modal", "create a component for X",
  "/component-scaffold".

  IMPORTANT: Output must follow the repo conventions exactly — shadcn/ui
  only (no native <button>/<input>/<select>), semantic colors (no
  text-gray-900/bg-white), lucide icons (no emojis), and a SheetTitle/
  DialogTitle for accessibility. It scaffolds structure; the human fills in
  domain fields and wiring.
---

# Component scaffold — forms & dialogs in the house style

Kinroster's UI has a consistent shape. This skill emits a form or a
multi-step dialog that already follows it, so the author fills in domain
fields instead of re-deriving conventions. Match the two canonical examples
rather than hardcoding snippets that rot.

Canonical references:
- `src/components/residents/resident-form.tsx` → the form pattern
- `src/components/notes/share-with-clinician-dialog.tsx` → multi-step dialog
- `src/components/ui/*` → the shadcn components to import
- `CLAUDE.md` → UI rules (shadcn-only, semantic colors, lucide icons, the
  `"all"` Select pattern)

## Step 1 — gather inputs

Ask what you don't have:
1. **Form or dialog?** (a page form, or a triggered modal/multi-step flow).
2. **Component name** + where it lives (`src/components/<area>/<name>.tsx`).
3. **Fields / steps** — the inputs (name, type) and, for a dialog, the steps
   (e.g. `scope → preview → sent`).
4. **The action** — what it writes (which table / API route) and where it
   navigates on success.
5. **Props** — what the parent passes in (ids, an entity to edit, etc.).

## Step 2 — scaffold a FORM

Mirror `resident-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// + Textarea / Select as needed, all from @/components/ui/*
import { toast } from "sonner";

export function <Name>Form({ <entity>, ...props }: { /* typed props */ }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const isEditing = !!<entity>;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const data = { /* formData.get("field") as string, … */ };
      const { error } = isEditing
        ? await supabase.from("<table>").update(data).eq("id", <entity>.id)
        : await supabase.from("<table>").insert(data);
      if (error) throw error;
      toast.success(isEditing ? "Updated" : "Created");
      router.push("<destination>");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="field">Field</Label>
        <Input id="field" name="field" defaultValue={<entity>?.field ?? ""} />
      </div>
      {/* … */}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : isEditing ? "Save changes" : "Create"}
      </Button>
    </form>
  );
}
```

- Every input has a `<Label htmlFor>` paired with a `name`.
- Use `defaultValue` (uncontrolled + FormData) like the resident form, unless
  a field needs controlled state.
- For Selects, use the `"all"` sentinel pattern from `CLAUDE.md` (never an
  empty-string option).

## Step 3 — scaffold a DIALOG

Mirror `share-with-clinician-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send } from "lucide-react"; // pick the right lucide icon

type Step = "<first>" | "<second>" | "sent";

export function <Name>Dialog({ /* typed props */ }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("<first>");
  const [loading, setLoading] = useState(false);

  function resetAndClose() {
    setOpen(false);
    setStep("<first>");
    // reset other state…
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Send className="mr-1 h-3 w-3" />
        <Label-or-text>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle><title></DialogTitle>
        </DialogHeader>
        {step === "<first>" && (/* … */)}
        {step === "sent" && (/* … */)}
        <DialogFooter>{/* step-appropriate buttons */}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- **The trigger is `render={<Button … />}`** (base-ui pattern) — **not**
  `asChild`. This repo uses `@base-ui/react`.
- Always include a `DialogTitle` (use the `sr-only` class if it shouldn't be
  visible) for accessibility.
- Drive steps with the `step` state; reset it (and all state) on close.

## Step 4 — confirm

Report the file path, whether it's a form or dialog, the fields/steps, and
the table/route it writes. Suggest the author run `pnpm lint` + `pnpm exec
tsc --noEmit` and wire it into its parent page.

## Hard rules (never break these — from CLAUDE.md)

- **shadcn/ui only.** Never native `<button>`, `<input>`, `<select>`,
  `<textarea>` — import from `@/components/ui/*`.
- **Semantic Tailwind colors only.** `text-foreground`, `bg-background`,
  `text-muted-foreground` — never `text-gray-900`, `bg-white`, hardcoded hex.
- **lucide-react icons, never emojis.**
- **Dialog trigger uses `render={<Button/>}`**, never `asChild` (base-ui).
- **Accessibility:** every Dialog/Sheet has a `DialogTitle`/`SheetTitle`
  (`sr-only` when visually hidden); every input has a paired `<Label>`.
- **`"all"` Select pattern**, never an empty-string `SelectItem` value.
- **Authenticated client** `createClient()` from `@/lib/supabase/client` for
  browser components — never the service-role/admin client in client code.
- **Don't invent domain fields or business logic.** Scaffold the structure;
  ask for the real fields.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/component-scaffold` with no detail | Ask: form or dialog, name/location, fields/steps, the write action. |
| User describes it fully | Scaffold; let them fill domain specifics. |
| Multi-step flow | Use the dialog `step` state pattern; reset on close. |
| Needs a Select with an "All" option | Use the `"all"` sentinel, not `value=""`. |
| Tempted to use a native element or hardcoded color | Don't — use shadcn + semantic colors. |
| Component needs server data | Scaffold the client component; note the parent server page should fetch and pass it as props. |
