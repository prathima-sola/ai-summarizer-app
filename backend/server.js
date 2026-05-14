const dotenv = require('dotenv');
dotenv.config({ path: '.env' });
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const anthropic = new Anthropic();

app.use(cors());
app.use(express.json());

app.post('/summarize', async (req, res) => {
  const { text } = req.body;
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