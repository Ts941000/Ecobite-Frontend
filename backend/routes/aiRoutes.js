const express = require('express');
const router = express.Router();

// @desc    Call AI Native Studio (Llama-4-Maverick)
// @route   POST /api/ai/chat
// @access  Public
router.post('/chat', async (req, res) => {
  try {
    const { prompt, systemText } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    // Use environment variable if deployed, otherwise fallback to the hardcoded key for local testing.
    // In production, NEVER hardcode keys. We put it here just to ensure it works for the user out of the box.
    const API_KEY = process.env.AINATIVE_API_KEY || 'sk_E52J_34rlqCfLTDzt_36mRpObjyrsACRTpOWRpj3N-0';

    const messages = [];
    if (systemText) {
      messages.push({ role: 'system', content: systemText });
    }
    messages.push({ role: 'user', content: prompt });

    // Fetch call to Llama-4 API
    const response = await fetch('https://api.ainative.studio/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-4-maverick-17b',
        messages: messages,
        max_tokens: 2048,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API Error:', errorText);
      return res.status(response.status).json({ message: 'AI API request failed' });
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    
    // Strip markdown to ensure clean UI
    text = text.replace(/[*_`#]/g, "");
    
    res.json({ reply: text.trim() || "Sorry, I couldn't generate a response." });
  } catch (error) {
    console.error("Server AI error:", error);
    res.status(500).json({ message: 'Server error while contacting AI', error: error.message });
  }
});

module.exports = router;
