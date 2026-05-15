const dotenv = require('dotenv');
dotenv.config({ path: '.env' });
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');

const app = express();
const anthropic = new Anthropic();

app.use(cors());
app.use(express.json());

// Rate limiter — max 10 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too many requests. Please wait 15 minutes before trying again.'
  }
});

app.use('/summarize', limiter);

app.post('/summarize', async (req, res) => {
  const { text } = req.body;

  // Text length limit
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Please provide some text to summarize.' });
  }
  if (text.length > 5000) {
    return res.status(400).json({ error: 'Text too long. Maximum 5000 characters allowed.' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Please summarize the following text in 5 clear bullet points:\n\n${text}`
      }]
    });
    res.json({ summary: message.content[0].text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});