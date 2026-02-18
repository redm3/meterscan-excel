import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert at extracting meter reading data from documents, PDFs, and images.
You will be given a document containing meter reading sheets, tables, or logs.

CRITICAL INSTRUCTIONS:
- You MUST extract EVERY SINGLE ROW from ALL pages of the document. Do NOT skip any rows.
- Scan the ENTIRE document thoroughly - check every page, every table, every section.
- If a table spans multiple pages, combine all rows from all pages.
- If values are partially obscured or hard to read, make your best attempt rather than skipping the row.
- Include header rows or summary rows only if they contain actual meter reading data.

For each row, extract:
- loadName: The load/tenant name (e.g., "Tenant #01", "Main Incomer", etc.)
- loadId: The Load ID or Modbus ID (numeric)
- ctRating: The CT rating (e.g., "1000A", "500A")
- dateTime: The date and time of the reading (preserve original format exactly as shown)
- physicalMeterRead: The kWh reading (numeric value)
- ph1Amps, ph2Amps, ph3Amps: Phase current readings if available
- voltage: Voltage reading if available
- pf: Power factor if available

If you cannot read a value, use null - but NEVER skip the entire row.
Double-check your count against the visible rows in the document.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/png'};base64,${imageBase64}`,
                },
              },
              {
                type: 'text',
                text: 'Extract ALL meter reading data from EVERY page of this document. Do not skip any rows. Count the total rows you find and make sure every single one is included in your output. Be extremely thorough.',
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_meter_data",
              description: "Extract meter reading data from the document",
              parameters: {
                type: "object",
                properties: {
                  readings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        loadName: { type: "string", description: "Load/tenant name" },
                        loadId: { type: ["number", "null"], description: "Load ID / Modbus ID" },
                        ctRating: { type: ["string", "null"], description: "CT rating" },
                        dateTime: { type: ["string", "null"], description: "Date/time of reading" },
                        physicalMeterRead: { type: ["number", "null"], description: "kWh reading" },
                        ph1Amps: { type: ["number", "null"], description: "Phase 1 amps" },
                        ph2Amps: { type: ["number", "null"], description: "Phase 2 amps" },
                        ph3Amps: { type: ["number", "null"], description: "Phase 3 amps" },
                        voltage: { type: ["number", "null"], description: "Voltage reading" },
                        pf: { type: ["number", "null"], description: "Power factor" },
                      },
                      required: ["loadName"],
                    },
                  },
                },
                required: ["readings"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_meter_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits in Settings.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let readings = [];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      readings = parsed.readings || [];
    } else {
      // Fallback: try parsing content directly
      const content = data.choices?.[0]?.message?.content || '';
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        readings = JSON.parse(cleaned);
        if (!Array.isArray(readings)) readings = [readings];
      } catch {
        console.error('Failed to parse AI response:', content);
        readings = [];
      }
    }

    return new Response(JSON.stringify({ readings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Extract meter data error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
