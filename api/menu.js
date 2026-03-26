export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { prompt, cocktailList } = body;
  if (!prompt || !cocktailList) {
    return new Response(JSON.stringify({ error: 'Missing prompt or cocktailList' }), { status: 400 });
  }

  // Compact catalog — only what Claude needs for selection (no long descriptions)
  const cocktailCatalog = cocktailList.map(c =>
    `${c.id}|${c.name}|${c.category}|${(c.flavor||[]).slice(0,4).join(',')}`
  ).join('\n');

  const userPrompt = `You are a master bartender. Create a cocktail menu for this occasion: "${prompt}"

AVAILABLE COCKTAILS (id|name|category|flavors):
${cocktailCatalog}

Return ONLY valid JSON, no other text:
{
  "title": "Menu title matching the occasion tone (Hebrew or English)",
  "subtitle": "Short tagline",
  "occasion_note": "2 sentences about the cocktail direction for this occasion",
  "cocktails": [
    {"id": "exact-id-from-list", "note": "One sentence why it fits"}
  ],
  "specials": [
    {
      "name": "Cocktail name",
      "description": "One enticing sentence",
      "category": "gin",
      "glass": "coupe",
      "garnish": "garnish",
      "difficulty": "medium",
      "flavor": ["citrus","floral"],
      "ingredients": [{"name": "ingredient", "amount": "2 oz", "required": true}],
      "steps": [{"instruction": "step"}],
      "note": "Why created for this occasion"
    }
  ]
}

Rules: select 4-6 cocktails from the list. Create exactly 2 specials not from the list.`;

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const aiData = await aiResponse.json();
    if (!aiData.content?.[0]?.text) throw new Error(JSON.stringify(aiData));

    const text = aiData.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response: ' + text.slice(0, 200));

    const result = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'AI generation failed', detail: e.message }), { status: 500 });
  }
}
