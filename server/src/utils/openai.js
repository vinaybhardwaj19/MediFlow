/**
 * @file openai.js
 * @description Utility wrapper for calling the OpenAI Chat Completions API.
 */

/**
 * Call OpenAI Chat Completions API using native fetch
 * @param {Array<Object>} messages - Array of message objects [{role: 'user', content: '...'}]
 * @param {number} [maxTokens=800] - Max tokens to return
 * @returns {Promise<string|null>} Response text or null on failure
 */
exports.callOpenAI = async (messages, maxTokens = 800) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-proj-placeholder') || apiKey.includes('YOUR_OPENAI') || apiKey === 'sk-proj-********************************************************************************************************************************************************FVMA') {
    // Graceful fallback without alarming error logs
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: maxTokens
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content;
    } else {
      const errorData = await response.json().catch(() => ({}));
      if (response.status !== 401) {
        console.error('[OpenAI] API error response:', response.status, errorData);
      }
      return null;
    }
  } catch (err) {
    console.error('[OpenAI] Network error calling OpenAI API:', err);
    return null;
  }
};
