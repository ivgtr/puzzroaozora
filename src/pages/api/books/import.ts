import type { NextApiRequest, NextApiResponse } from "next";
import { retrieveBook } from "../../../lib/aozora.ts";
import { parseImportUrl } from "../../../lib/books.ts";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).json({ success: false, error: { message: "POST のみ利用できます。" } }); return; }
  let input: ReturnType<typeof parseImportUrl>;
  try {
    if (typeof req.body?.sourceUrl !== "string") throw new Error("作品カードURLを指定してください。");
    input = parseImportUrl(req.body.sourceUrl);
    if (input.workId !== req.body.workId) throw new Error("作品IDとカードURLが一致しません。");
  } catch (error) { res.status(400).json({ success: false, error: { message: error instanceof Error ? error.message : "入力が不正です。" } }); return; }
  try { res.status(200).json({ success: true, data: await retrieveBook(input.workId, input.sourceUrl) }); }
  catch (error) { res.status(422).json({ success: false, error: { message: error instanceof Error ? error.message : "取り込みを完了できませんでした。" } }); }
}
