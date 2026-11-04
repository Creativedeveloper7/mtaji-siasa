/** True when ad text stops mid-sentence (no closing punctuation). */
export function endsMidSentence(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !/[.!?…)"'’”]$|https?:\/\/\S+$|\p{Extended_Pictographic}$/u.test(t);
}
