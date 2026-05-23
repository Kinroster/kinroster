import { VerifyOtpForm } from "@/components/family/verify-otp-form";

export default async function FamilyVerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const linkId = typeof params.link === "string" ? params.link : "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Verify your phone</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to your phone.
          </p>
        </div>
        <VerifyOtpForm initialLinkId={linkId} />
      </div>
    </div>
  );
}
