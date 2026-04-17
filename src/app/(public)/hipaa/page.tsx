import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "HIPAA Compliance - CareNote",
  description: "Learn about CareNote's HIPAA compliance measures and data protection practices.",
}

export default function HipaaCompliancePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">HIPAA Compliance</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2026</p>
      </div>

      <p className="text-muted-foreground leading-relaxed">
        CareNote is designed with HIPAA (Health Insurance Portability and Accountability Act)
        compliance in mind. We understand the critical importance of protecting patient health
        information (PHI) and have implemented comprehensive safeguards across our platform to
        support the privacy and security requirements of healthcare organizations.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">1. Our Commitment to HIPAA</h2>
        <p className="text-muted-foreground leading-relaxed">
          As a platform that processes protected health information on behalf of healthcare
          organizations, CareNote maintains technical, administrative, and physical safeguards
          designed to meet the requirements of the HIPAA Security Rule and Privacy Rule. We
          continuously evaluate and improve our security posture to address evolving threats
          and regulatory requirements.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">2. Technical Safeguards</h2>
        <p className="text-muted-foreground leading-relaxed">
          We implement the following technical measures to protect PHI:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Encryption:</span> All data is encrypted
            at rest using AES-256 encryption and in transit using TLS 1.2 or higher.
          </li>
          <li>
            <span className="font-medium text-foreground">Row-Level Security (RLS):</span> Database-level
            security policies ensure that each organization can only access its own data. RLS is enforced
            at the database layer, preventing unauthorized cross-organization data access even in the
            event of an application-level vulnerability.
          </li>
          <li>
            <span className="font-medium text-foreground">Access Controls:</span> Multi-factor
            authentication, session management, and automatic session expiration protect user accounts
            from unauthorized access.
          </li>
          <li>
            <span className="font-medium text-foreground">Audit Logging:</span> All access to PHI is
            logged, including user identity, timestamp, and action performed, supporting accountability
            and incident investigation.
          </li>
          <li>
            <span className="font-medium text-foreground">Secure APIs:</span> All API endpoints
            require authentication and enforce authorization checks before processing requests
            involving PHI.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">3. Administrative Safeguards</h2>
        <p className="text-muted-foreground leading-relaxed">
          Our administrative controls include:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Organization-Scoped Data:</span> All patient
            data is strictly scoped to the organization that created it. There is no shared data
            environment between organizations.
          </li>
          <li>
            <span className="font-medium text-foreground">Role-Based Access:</span> Users are assigned
            roles (administrator, caregiver, etc.) that determine their level of access to patient
            records and system features.
          </li>
          <li>
            <span className="font-medium text-foreground">Security Policies:</span> We maintain
            documented security policies and procedures covering data handling, incident response,
            and workforce training.
          </li>
          <li>
            <span className="font-medium text-foreground">Minimum Necessary Standard:</span> Access
            to PHI is limited to the minimum amount of information necessary for each user to perform
            their job functions.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">4. Physical Safeguards</h2>
        <p className="text-muted-foreground leading-relaxed">
          CareNote operates on cloud infrastructure provided by trusted vendors with established
          physical security practices:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Supabase:</span> Our database infrastructure
            is hosted on Supabase, which operates on AWS data centers with SOC 2 Type II certification,
            physical access controls, and environmental protections.
          </li>
          <li>
            <span className="font-medium text-foreground">Vercel:</span> Our application is deployed
            on Vercel, which maintains secure hosting infrastructure with encrypted storage and network
            isolation.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">5. Voice Data Handling</h2>
        <p className="text-muted-foreground leading-relaxed">
          Voice documentation is a core feature of CareNote, and we take special care in how voice
          data is handled:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>Voice interactions are processed by Vapi, our voice AI infrastructure provider, which
            handles real-time audio streaming and call orchestration.</li>
          <li>Speech-to-text transcription is performed by Deepgram, converting audio to text for
            AI processing.</li>
          <li>Transcripts are stored in encrypted form within the organization&apos;s data scope and
            are subject to all RLS and access control policies.</li>
          <li>Raw audio recordings are not persistently stored by CareNote unless explicitly configured
            by the organization.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">6. AI Processing</h2>
        <p className="text-muted-foreground leading-relaxed">
          CareNote uses Anthropic&apos;s Claude AI to process transcripts and generate structured care
          documentation. Our AI processing is designed with the following safeguards:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>Claude processes transcript data to generate structured notes but does not retain or
            store patient data after processing is complete.</li>
          <li>AI processing occurs through secure API connections with encryption in transit.</li>
          <li>Patient data sent for AI processing is limited to the minimum necessary for documentation
            purposes.</li>
          <li>AI-generated outputs are stored within the organization&apos;s secure, RLS-protected
            data environment.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">7. Business Associate Agreements</h2>
        <p className="text-muted-foreground leading-relaxed">
          HIPAA requires covered entities to enter into Business Associate Agreements (BAAs) with
          service providers that handle PHI. CareNote is prepared to enter into BAAs with healthcare
          organizations that require them. We also maintain appropriate agreements with our
          sub-processors (Vapi, Anthropic, Deepgram, Supabase) to ensure the continued protection
          of PHI throughout the data processing chain.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Organizations requiring a signed BAA should contact us at{" "}
          <a href="mailto:support@carenote.app" className="text-primary underline hover:no-underline">
            support@carenote.app
          </a>{" "}
          to initiate the process.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">8. Incident Response</h2>
        <p className="text-muted-foreground leading-relaxed">
          CareNote maintains an incident response plan to address potential security breaches involving
          PHI. Our procedures include:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>Immediate containment and investigation of suspected breaches.</li>
          <li>Notification to affected organizations within the timeframes required by HIPAA
            (no later than 60 days from discovery).</li>
          <li>Cooperation with affected organizations in their own breach notification obligations.</li>
          <li>Documentation and analysis of incidents to prevent recurrence.</li>
          <li>Regular testing and review of incident response procedures.</li>
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          CareNote is designed with HIPAA compliance in mind. Organizations requiring a signed
          Business Associate Agreement should contact us at{" "}
          <a href="mailto:support@carenote.app" className="text-primary underline hover:no-underline">
            support@carenote.app
          </a>
          . For questions about our security practices or compliance posture, please do not hesitate
          to reach out.
        </p>
      </section>
    </div>
  )
}
