// Deterministic replies that never need the language model.
// Capability text is built from the live tool registry so it cannot drift from reality
// or invite the small model to invent abilities.

const TOOL_LABELS = {
  get_system_info: 'ตรวจสอบสถานะเครื่อง Raspberry Pi เช่น RAM สเปก และเวลาเปิดเครื่อง',
  get_current_time: 'บอกเวลาและวันที่ปัจจุบัน',
  search_wikipedia: 'ค้นหาข้อมูลความรู้ทั่วไปจาก Wikipedia',
  calculate: 'คำนวณตัวเลขและสมการคณิตศาสตร์',
  search_github: 'ค้นหา repository บน GitHub',
  get_news: 'อ่านข่าวไทยและต่างประเทศทุกหมวด หรือค้นข่าวตามหัวข้อที่ต้องการ',
  get_weather: 'ตรวจสอบสภาพอากาศและพยากรณ์อากาศรายวันตามเมืองหรือจังหวัด',
  get_fx: 'ตรวจสอบอัตราแลกเปลี่ยนและคำนวณแปลงค่าเงิน',
  search_web: 'ค้นหาข้อมูลทั่วไปบนอินเทอร์เน็ต เช่น วิธีการ คำถามชีวิตประจำวัน ศัพท์วัยรุ่น และเรื่องรอบตัว'
};

function describeTool(tool) {
  return TOOL_LABELS[tool.name] || tool.description;
}

export function buildCapabilityReply(tools) {
  const lines = tools.map((tool) => `- ${describeTool(tool)}`).join('\n');
  return [
    'ผมคือ Max ผู้ช่วยที่ทำงานอยู่บนเครื่อง Raspberry Pi ตอนนี้ผมทำสิ่งเหล่านี้ได้ครับ:',
    lines,
    'เรื่องที่อยู่นอกเหนือจากนี้ ผมจะบอกตามตรงว่าทำไม่ได้ครับ'
  ].join('\n');
}

export function buildUnsupportedPlatformReply() {
  return 'ขออภัยครับ ตอนนี้ผมยังอ่านข้อมูลจาก Facebook, Twitter (X), Reddit และโซเชียลมีเดียอื่นไม่ได้ เพราะแพลตฟอร์มเหล่านี้จำกัดการเข้าถึง แต่ผมหาข่าวและข้อมูลหัวข้อเดียวกันจากสำนักข่าวให้ได้ครับ ลองบอกหัวข้อที่สนใจได้เลย';
}

export function buildModelIdentityReply(model = 'qwen2.5:1.5b', message = '') {
  const is3b = /3b/i.test(model);
  const is15b = /1\.5b/i.test(model);
  const activeLabel = is3b ? 'Qwen2.5 3B (Advanced Mode)' : 'Qwen2.5 1.5B (Lite Mode)';

  const askingIf3b = /(?:ใช่|ใช้).*(?:3b|advanced)/i.test(message);
  const askingIf15b = /(?:ใช่|ใช้).*(?:1\.5b|lite)/i.test(message);

  if (askingIf3b) {
    if (is3b) {
      return 'ใช่ครับ ขณะนี้ผมทำงานด้วยโมเดล Qwen2.5 3B (Advanced Mode) รันแบบ Local ผ่าน Ollama ครับ';
    }
    return 'ตอนนี้ผมกำลังทำงานอยู่ในโหมด Lite Mode ซึ่งใช้โมเดล Qwen2.5 1.5B ครับ หากต้องการใช้ Qwen2.5 3B สามารถกดปุ่ม Adv (3B) ด้านบนเพื่อสลับโหมดได้เลยครับ';
  }

  if (askingIf15b) {
    if (is15b) {
      return 'ใช่ครับ ขณะนี้ผมทำงานด้วยโมเดล Qwen2.5 1.5B (Lite Mode) รันแบบ Local ผ่าน Ollama ครับ';
    }
    return 'ตอนนี้ผมกำลังทำงานอยู่ในโหมด Advanced Mode ซึ่งใช้โมเดล Qwen2.5 3B ครับ หากต้องการประหยัด RAM สามารถกดปุ่ม Lite (1.5B) ด้านบนเพื่อสลับโหมดได้ครับ';
  }

  return `ขณะนี้ผมทำงานด้วยโมเดล ${activeLabel} รันแบบ Local ผ่าน Ollama ภายในเครื่องครับ`;
}

export function buildDirectReply(reason, tools, model = 'qwen2.5:1.5b', message = '') {
  if (reason === 'capabilities') return buildCapabilityReply(tools);
  if (reason === 'unsupported_platform') return buildUnsupportedPlatformReply();
  if (reason === 'model_identity') return buildModelIdentityReply(model, message);
  return null;
}
