/** Strips markdown, code, URLs and emoji so the TTS engine reads clean text; caps length to control cost. */
export function cleanForSpeech(input, max = 1500) {
  if (typeof input !== 'string') return '';
  let t = input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[*_#>~|]+/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('। '));
    t = (i > 200 ? cut.slice(0, i + 1) : cut).trim();
  }
  return t;
}
