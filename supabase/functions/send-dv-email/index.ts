const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured. Please connect Resend in Lovable Cloud settings.");
    }

    const { recipients, subject, message, fileName, fileBase64 } = await req.json();

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "recipients is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subject || !fileBase64 || !fileName) {
      return new Response(JSON.stringify({ error: "subject, fileName, and fileBase64 are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailBody: Record<string, unknown> = {
      from: "MeterScan DV <onboarding@resend.dev>",
      to: recipients,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a1a2e; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #22c55e; margin: 0;">MeterScan Data Validation</h2>
          </div>
          <div style="padding: 20px; background: #ffffff; border: 1px solid #e5e7eb;">
            <p style="color: #374151; line-height: 1.6;">${message || "Please find the attached Data Validation report."}</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
              📎 <strong>${fileName}</strong> is attached to this email.
            </p>
          </div>
          <div style="padding: 12px 20px; background: #f9fafb; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">Sent via MeterScan by BraveGen</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: fileName,
          content: fileBase64,
        },
      ],
    };

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify(emailBody),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", JSON.stringify(result));
      throw new Error(`Email send failed [${response.status}]: ${JSON.stringify(result)}`);
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("send-dv-email error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
