import { runAgent } from './index.js';

const question = process.argv.slice(2).join(' ') || 'เครื่องสถานะเป็นยังไงบ้าง แรมเหลือเท่าไหร่';

console.log(`Query: "${question}"\n`);

const startTime = Date.now();
const response = await runAgent({
  message: question,
  conversationHistory: []
});
const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('--- Agent Response ---');
console.log(`Text: ${response.text}`);
console.log(`Feeling: ${response.feeling}`);
console.log(`Status: ${response.status}`);
console.log(`Latency: ${durationSec}s`);

if (response.toolsUsed.length > 0) {
  console.log('\nExecuted Tools:');
  response.toolsUsed.forEach((t, i) => {
    console.log(`  ${i + 1}. [${t.tool}] (${t.durationMs}ms)`);
    console.log(`     Output: ${JSON.stringify(t.result)}`);
  });
} else {
  console.log('\n(Direct response, no tool called)');
}
console.log('----------------------\n');
