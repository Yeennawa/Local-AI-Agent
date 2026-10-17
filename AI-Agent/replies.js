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
  get_fx: 'ตรวจสอบอัตราแลกเปลี่ยนและคำนวณแปลงค่าเงิน'
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

export function buildDirectReply(reason, tools) {
  if (reason === 'capabilities') return buildCapabilityReply(tools);
  if (reason === 'unsupported_platform') return buildUnsupportedPlatformReply();
  return null;
}
