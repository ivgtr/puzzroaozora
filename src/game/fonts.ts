export const BODY_FONT = 'Noto Serif JP';
export const UI_FONT = 'Noto Sans JP';
export const FONT_SPECIMEN = '檸檬 憂鬱 ゐゑ っゃゅょ 『』、。 ――…… ABC123 か\u3099';
let coveragePromise: Promise<Record<string, number[]>> | undefined;

async function coverage() {
  if (!coveragePromise) {
    coveragePromise = fetch('/fonts/coverage.json').then(async (response) => {
      if (!response.ok) throw new Error('文字情報を読み込めませんでした。再試行してください。');
      return response.json() as Promise<Record<string, number[]>>;
    }).catch((error) => { coveragePromise = undefined; throw error; });
  }
  return coveragePromise;
}

export async function prepareText(text: string, ui = false, weight = 500): Promise<void> {
  const name = ui ? 'noto-sans-jp' : 'noto-serif-jp';
  const map = await coverage();
  const supported = new Set(map[`${name}:${weight}`]);
  const visible = text.replace(/[\r\n\t]/g, '').normalize('NFC');
  const missing = [...new Set([...visible].filter((char) => !supported.has(char.codePointAt(0)!)))];
  if (missing.length) throw new Error(`この書体では表示できない文字があります：${missing.slice(0, 8).join(' ')}。別の作品を選んでください。`);
  const family = ui ? UI_FONT : BODY_FONT;
  const faces = await document.fonts.load(`${weight} 22px "${family}"`, visible);
  if (!faces.length || !document.fonts.check(`${weight} 22px "${family}"`, visible)) {
    throw new Error('書体を読み込めませんでした。通信を確認して再試行してください。');
  }
}
