export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { name, category, description, ingredients, steps } = body;
  if (!name || !ingredients) {
    return new Response(JSON.stringify({ error: 'Missing cocktail data' }), { status: 400 });
  }

  const ingredientList = ingredients.map(i => `- ${i.amount} ${i.name}${i.required ? '' : ' (optional)'}`).join('\n');
  const stepList = (steps || []).map((s, i) => `${i + 1}. ${s.instruction}`).join('\n');

  const prompt = `You are a creative master bartender. Suggest a modern twist on this classic recipe.

COCKTAIL: ${name}
CATEGORY: ${category}
DESCRIPTION: ${description}

ORIGINAL RECIPE:
${ingredientList}

METHOD:
${stepList}

Create ONE creative, achievable modern twist. Think: seasonal ingredients, interesting substitutions, technique upgrades, flavor additions. Keep it sophisticated but doable at home.

Respond with ONLY valid JSON:
{
  "twist_name": "Name for the twisted version",
  "tagline": "One evocative line describing the twist",
  "changes": [
    {
      "type": "substitute",
      "original": "original ingredient + amount",
      "replacement": "new ingredient + amount",
      "reason": "why this elevates the drink"
    }
  ],
  "new_step": "Optional: one additional technique step (or null)",
  "bartender_note": "2 sentences: the story/inspiration behind this twist and what it does to the drink"
}

Rules: 1-3 changes max. Keep it realistic (no exotic unobtainable ingredients). Make it genuinely better or interestingly different.`;

  try {
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const aiData = await aiResponse.json();
    if (!aiData.content?.[0]?.text) throw new Error(JSON.stringify(aiData));

    const text = aiData.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON: ' + text.slice(0, 100));

    const result = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed', detail: e.message }), { status: 500 });
  }
}
