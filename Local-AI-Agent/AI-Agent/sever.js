import express from 'express';
import { runAgent } from './agent.js';

const app = express();

app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    const result = await runAgent({
      message,
      conversationHistory: conversationHistory || []
    });

    res.json(result);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      text: 'AI มีปัญหา',
      status: 'error'
    });
  }
});

app.listen(3000, () => {
  console.log('Server running at port 3000');
});