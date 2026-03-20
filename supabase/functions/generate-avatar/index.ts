import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, role, traits, gender } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const normalizedGender = typeof gender === "string" ? gender.toLowerCase() : undefined;

    const usedGender = normalizedGender === "male" || normalizedGender === "female" ? normalizedGender : "unspecified";

    // Stronger gender conditioning. Image models can ignore vague wording, so we keep it explicit.
    const genderInstruction =
      usedGender === "male"
        ? "GENDER (MUST FOLLOW): Male. Depict a man/boy/men with clearly masculine traits: angular jawline, more prominent cheek/zygoma structure, and typically shorter, less feminine hair styling. Avoid feminine-coded traits (soft jawline, typically feminine grooming)."
        : usedGender === "female"
          ? "GENDER (MUST FOLLOW): Female. Depict a woman/girl/women with clearly feminine traits: softer jawline/cheek structure, and typically longer/more feminine hair styling. Avoid masculine-coded traits (typically masculine jawline, masculine grooming)."
          : "GENDER: Unspecified. Depict a professional person appropriate for the role without forcing male/female.";

    const prompt = `Create a professional AI-generated avatar portrait for ${name}, a ${role}. 
${genderInstruction}
Personality: ${traits || "professional"}.
Style: Digital illustration, clean professional headshot, soft gradient background matching their tech/professional vibe, subtle futuristic aesthetic. 
The face should look distinct, expressive, and human-like. Square composition, centered portrait, no text or labels.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Image generation error:", response.status, text);
      return new Response(
        JSON.stringify({ error: `Image generation failed: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "No image returned from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ avatar: imageUrl, usedGender }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-avatar error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
