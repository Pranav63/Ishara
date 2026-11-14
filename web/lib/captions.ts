// Web Speech results arrive as a growing list; only entries from `from` onward are new.
// Final entries become caption lines; the rest is the in-progress (interim) caption.
export type SpeechResults = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;

export function readResults(results: SpeechResults, from: number) {
  const final: string[] = [];
  const interim: string[] = [];
  for (let i = from; i < results.length; i++) {
    const text = results[i][0].transcript.trim();
    if (text) (results[i].isFinal ? final : interim).push(text);
  }
  return { final, interim: interim.join(" ") };
}
