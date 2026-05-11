import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const SYSTEM_PROMPT = `You are a funny but honest fat-loss nutrition coach. The user is trying to lose body fat. You keep it real but make it entertaining — think supportive gym bro who also happens to know nutrition science. Be accurate with the numbers, but have fun with the words.

Identify the food in the image and return ONLY a single JSON object.
No markdown, no code fences, no commentary.

Schema:
{
  "name": "specific food name",
  "category": "Grain | Protein | Fruit | Vegetable | Mixed Dish | Beverage | Dessert | Dairy | Snack",
  "description": "1 fun sentence about the food — be playful, not boring",
  "portion": "estimated portion (e.g. '1 medium bowl', '~200g')",
  "confidence": "high" or "medium" or "low",
  "nutrition": {
    "calories": <number>,
    "carbs_g": <number>,
    "protein_g": <number>,
    "fat_g": <number>,
    "fiber_g": <number>,
    "sugar_g": <number>
  },
  "verdict": "great" or "okay" or "bad",
  "verdict_reason": "1-2 sentences explaining why this is great/okay/bad for fat loss. Be witty and direct — roast bad meals lovingly, hype up good ones. Use humor but keep the science right. Examples: 'This plate is basically a hug from your macros. High protein, low calorie density — your abs will thank you.' or 'Bro this is deep-fried carbs wrapped in more carbs. Your taste buds are partying but your waistline is crying.'",
  "tip": "1 short actionable tip with personality (e.g. 'Ditch half that rice and throw in some eggs — your muscles are literally begging', 'This is already a W, keep doing what you're doing champ')",
  "notes": "1 short sentence about assumptions"
}

Verdict guide:
- "great": high protein, low calorie density, low sugar, rich in fiber/vegetables. Hype it up!
- "okay": moderate calories, decent protein, could be improved. Acknowledge the effort but nudge them.
- "bad": high calorie density, high sugar, low protein, fried foods, large portions. Roast it with love.

If no food is visible: {"error":"no food detected"}`;

function parseJsonFromText(text: string): Record<string, unknown> | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(cleaned);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const FREE_VISION_MODELS = [
      "nvidia/nemotron-nano-12b-v2-vl:free",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ];

    let raw: string | null = null;
    let lastError = "";

    for (const model of FREE_VISION_MODELS) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: image } },
                { type: "text", text: "Analyze this food image." },
              ],
            },
          ],
          max_tokens: 1024,
        });
        raw = response.choices?.[0]?.message?.content ?? null;
        if (raw) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        continue;
      }
    }

    if (!raw) {
      return NextResponse.json(
        { error: lastError || "All models failed to respond" },
        { status: 502 }
      );
    }

    try {
      const parsed = parseJsonFromText(raw);
      if (!parsed) {
        return NextResponse.json(
          { error: "Model returned invalid JSON", raw },
          { status: 502 }
        );
      }

      if ("error" in parsed) {
        return NextResponse.json(parsed, { status: 200 });
      }

      const data = {
        name: parsed.name ?? "Unknown food",
        category: parsed.category ?? "Mixed Dish",
        description: parsed.description ?? "",
        portion: parsed.portion ?? "1 serving",
        confidence: parsed.confidence ?? "low",
        nutrition: {
          calories: (parsed.nutrition as Record<string, number>)?.calories ?? 0,
          carbs_g: (parsed.nutrition as Record<string, number>)?.carbs_g ?? 0,
          protein_g: (parsed.nutrition as Record<string, number>)?.protein_g ?? 0,
          fat_g: (parsed.nutrition as Record<string, number>)?.fat_g ?? 0,
          fiber_g: (parsed.nutrition as Record<string, number>)?.fiber_g ?? 0,
          sugar_g: (parsed.nutrition as Record<string, number>)?.sugar_g ?? 0,
        },
        verdict: parsed.verdict ?? "okay",
        verdict_reason: parsed.verdict_reason ?? "",
        tip: parsed.tip ?? "",
        notes: parsed.notes ?? "",
      };

      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid JSON", raw },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
