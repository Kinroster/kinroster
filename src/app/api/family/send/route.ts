import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendFamilyEmail } from "@/lib/resend";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { communicationId } = await request.json();

  if (!communicationId) {
    return NextResponse.json(
      { error: "communicationId required" },
      { status: 400 }
    );
  }

  // Fetch the communication with org and contact info
  const { data: comm } = await supabase
    .from("family_communications")
    .select("*, family_contacts(email, name)")
    .eq("id", communicationId)
    .single();

  if (!comm) {
    return NextResponse.json(
      { error: "Communication not found" },
      { status: 404 }
    );
  }

  const typedComm = comm as {
    id: string;
    organization_id: string;
    subject: string;
    body: string;
    family_contacts: { email: string | null; name: string } | null;
  };

  const recipientEmail = typedComm.family_contacts?.email;
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Recipient has no email address" },
      { status: 400 }
    );
  }

  // Fetch org settings
  const { data: org } = await supabase
    .from("organizations")
    .select("name, email_from_name, email_reply_to")
    .eq("id", typedComm.organization_id)
    .single();

  const typedOrg = org as {
    name: string;
    email_from_name: string | null;
    email_reply_to: string | null;
  } | null;

  try {
    await sendFamilyEmail({
      to: recipientEmail,
      fromName: typedOrg?.email_from_name || typedOrg?.name || "CareNote",
      replyTo: typedOrg?.email_reply_to || "noreply@carenote.app",
      subject: typedComm.subject,
      body: typedComm.body,
    });

    // Update status to sent
    await supabase
      .from("family_communications")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", communicationId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Mark as failed
    await supabase
      .from("family_communications")
      .update({ status: "failed" })
      .eq("id", communicationId);

    return NextResponse.json(
      { error: "Failed to send email", details: message },
      { status: 500 }
    );
  }
}
