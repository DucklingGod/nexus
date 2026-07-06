// Task 64 — autonomous-loop continuation detector.
//
// The agent loop ends a turn when a round produces no structured tool_call.
// Weaker models often *narrate* a next action ("Let me install it first.")
// instead of emitting the call, which strands the task and forces the user to
// type "ok". `looksUnfinished` detects that case so agentLoop can nudge the
// model to actually act. Pure + unit-tested; kept in its own tiny module so the
// test needn't load stream.ts's heavy (DB-backed) dependency graph.

// A question or offer TO the user — the agent is legitimately handing control
// back, so we must NOT auto-continue (avoids looping on "let me know…").
// NOTE: must end with ? — exclamations (ค่ะ! ครับ!) are NOT offers.
const OFFER = /(\?\s*$)|\b(let me know|would you like|do you want|if you'?d? (?:like|want)|shall i\b|should i\b|feel free|up to you)\b/i;

// Phrases that announce the agent's own next action (English + Thai).
const INTENT = /\b(let me|let'?s|i'?ll|i will|i'?m going to|i am going to|next[,: ]|now i(?:'|')?ll|now i will|first,? i|then i(?:'|')?ll|i need to|i'?m about to|going to)\b|(?:ต่อไป|เดี๋ยว|接下来|首先|我要)/i;

// Verbs that imply a tool would be used to carry the action out (English + Thai).
const ACTION = /\b(install|run|execute|check|read|write|search|fetch|create|extract|download|upload|open|list|inspect|analy[sz]e|compile|build|query|scan|generate|save|delete|move|copy|edit|modify|update|clone|pull|push|navigate|browse)\b|(?:สร้าง|เขียน|อ่าน|ค้นหา|ดาวน์โหลด|เปิด|บันทึก|แก้ไข|ติดตั้ง|รัน|เรียก|ตรวจสอบ|ดึง|สร้างไฟล์|เขียนไฟล์|บันทึกไฟล์|ลบ|ย้าย|ส่ง|เช็ค|เริ่ม)/i;

// A trailing shape that reads like an interrupted thought ("…first." / ":" / "…").
const TRAILING = /(:|\.\.\.|\bfirst\.?\s*$|\bhold on\b)\s*$/i;

// Thai polite endings (ค่ะ/ครับ/นะคะ/เลย/ค่ะ!) that indicate the agent is
// about to do something — NOT a question. These should trigger auto-continue
// when paired with INTENT or ACTION.
const THAI_POLITE_ENDING = /[คฆ](?:ะ|[่้๊๋]า)\s*[!！.。…]*\s*$/;

/**
 * True when the assistant text reads like "I'm about to do X" but no tool call
 * was emitted — i.e. it announced an action and stopped instead of doing it.
 * Only looks at the tail, where such statements land.
 */
export function looksUnfinished(text: string): boolean {
  const tail = text.trim().slice(-500);
  if (!tail) return false;
  if (OFFER.test(tail)) return false;
  if (INTENT.test(tail) && ACTION.test(tail)) return true;
  if (TRAILING.test(tail) && ACTION.test(tail)) return true;
  // Thai polite ending + action verb = agent is about to act (เดี๋ยวอีฟลบ...ค่ะ!)
  if (THAI_POLITE_ENDING.test(tail) && ACTION.test(tail)) return true;
  return false;
}

/** How many times a single turn may be nudged to continue after a no-tool-call
 *  round, before we give up and return the text (prevents narration-only loops).
 *  Reset whenever the model makes real progress by calling a tool. */
export const MAX_AUTO_CONTINUE = 5;

/** The synthetic user turn injected to push the model to actually act. */
export const CONTINUE_NUDGE =
  "Continue. Carry out the action you just described by calling the appropriate tool now. " +
  "Do not stop to explain or ask for confirmation — perform the next step. If a previous step " +
  "failed (e.g. a missing library), fix it and keep going until the task is complete. " +
  "After creating any file, use the send_file tool to deliver it to the user. " +
  "ดำเนินการต่อเลย ไม่ต้องอธิบาย — เรียก tool ที่เหมาะสมทันที สร้างไฟล์เสร็จแล้วต้องใช้ send_file ส่งให้ผู้ใช้";
