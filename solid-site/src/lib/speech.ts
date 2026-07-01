import { byEnum } from "~/lib/lang";

export const speechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

export const bcp47ForLang = (lang: string | null | undefined): string | undefined =>
  byEnum(lang || "")?.code;

export function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) return resolve(existing);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    setTimeout(finish, 1000);
  });
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  bcp47: string | undefined,
): SpeechSynthesisVoice | undefined {
  if (!bcp47) return undefined;
  const target = bcp47.toLowerCase();
  const primary = target.split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === target) ||
    voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === primary)
  );
}
