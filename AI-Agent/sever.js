import express from 'express';
import { runAgent } from './agent.js';
import path from "path";
import { fileURLToPath } from "url";
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

app.use(express.static(
  path.join(__dirname, "../Frontend")
));
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