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

    const systemPrompt = `You are an expert at reading physical water and gas utility meters from photos taken by field technicians.

Given a photo of a meter, extract:
1. The meter reading (numeric value shown on the meter dials/digits). Read ALL digits carefully including decimal places. The red digits are decimal places.
2. The date and time if visible in the photo (could be a timestamp overlay on the image, or text on a label). Look for date stamps like "27 February 2026 11:19 am" or similar formats embedded in the photo.

CRITICAL INSTRUCTIONS:
- Read the meter digits very carefully from left to right
- Red/colored digits typically represent decimal places
- If the photo has a camera timestamp watermark (common on phone photos), extract that as the date/time
- If no date/time is visible, return null for dateTime
- Return the reading as a number (e.g. 5835.85)
- Be precise - field technicians rely on accurate readings`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
                },
              },
              {
                type: 'text',
                text: 'Extract the meter reading and any visible date/time from this meter photo. Look carefully at every digit and any timestamp watermark on the image.',
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_meter_reading",
              description: "Extract meter reading and date/time from a meter photo",
              parameters: {
                type: "object",
                properties: {
                  reading: { type: ["number", "null"], description: "The numeric meter reading (e.g. 5835.85)" },
                  dateTime: { type: ["string", "null"], description: "Date and time visible in the photo, in ISO 8601 format (e.g. 2026-02-27T11:19:00). Return null if not visible." },
                  confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence level in the reading" },
                  notes: { type: "string", description: "Any notes about the reading (e.g. 'digits partially obscured')" },
                },
                required: ["reading", "dateTime", "confidence"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_meter_reading" } },
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
        return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result = { reading: null, dateTime: null, confidence: "low", notes: "" };

    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Extract pulse meter error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
