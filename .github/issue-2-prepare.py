from pathlib import Path
import re
p=Path('src/game/session.ts');s=p.read_text().replace('const left: Chain = { id: chain.id, pieces: chain.pieces.slice(0, boundary + 1), confirmed: chain.confirmed.slice(0, boundary) };\n      const right: Chain = { id: chain.pieces[boundary + 1], pieces: chain.pieces.slice(boundary + 1), confirmed: chain.confirmed.slice(boundary + 1) };', '''const leftPieces = chain.pieces.slice(0, boundary + 1), rightPieces = chain.pieces.slice(boundary + 1);
      // The chain ID belongs to one of its pieces, which may not be first after prepending.
      const left: Chain = { id: leftPieces.includes(chain.id) ? chain.id : leftPieces[0], pieces: leftPieces, confirmed: chain.confirmed.slice(0, boundary) };
      const right: Chain = { id: rightPieces.includes(chain.id) ? chain.id : rightPieces[0], pieces: rightPieces, confirmed: chain.confirmed.slice(boundary + 1) };''');p.write_text(s)
p=Path('tests/session.test.ts');s=p.read_text().replace('  assert.equal(s.dispatch({ type: "split", chain: "0", boundary: 0 }), null);', '''  assert.equal(s.dispatch({ type: "split", chain: "0", boundary: 0 }), null);
  const prepended = game(["A", "B", "C"]);
  join(prepended, "0", "1", "before");
  prepended.dispatch({ type: "split", chain: "1", boundary: 0 });
  assert.equal(new Set(prepended.chains.map((chain) => chain.id)).size, 3);
  assert.equal(join(prepended, "0", "1", "before")?.kind, "join");''');p.write_text(s)
p=Path('src/game/controller.ts');s=p.read_text().replace('  private lastPassage?: string;', '  private lastPassage?: string;\n  private displayOrder = new Map<string, number>();');s=s.replace("session.chains.map((chain) => ({ id: chain.id, text: session.text(chain), boundaries: chain.confirmed }))", "[...session.chains].sort((a, b) => this.displayOrder.get(a.id)! - this.displayOrder.get(b.id)!).map((chain) => ({ id: chain.id, text: session.text(chain), boundaries: chain.confirmed }))");s=s.replace('      this.session = new PuzzleSession(puzzle, this.difficulty);', '''      this.session = new PuzzleSession(puzzle, this.difficulty);
      const order = puzzle.pieces.map((piece) => piece.id);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
      }
      this.displayOrder = new Map(order.map((id, index) => [id, index]));''');p.write_text(s)
p=Path('src/game/desk-scene.ts');s=p.read_text().replace('    const session = this.controller.session!;\n    this.positions.clear();', '    this.positions.clear();').replace('const shuffled = Phaser.Utils.Array.Shuffle([...session.chains]);', 'const shuffled = this.controller.getSnapshot().chains;');p.write_text(s)
p=Path('src/lib/puzzle/generator.ts');s=p.read_text().replace('import { createAnswerToken } from "@/lib/puzzle/answerToken";\n','');a=s.index('  const fixedSegmentId');b=s.index('\n  return {',a);s=s[:a]+'  const shuffledSegments = shuffleWithRandom(segments, random);\n  const puzzleId = crypto.randomUUID();\n'+s[b:];s=s.replace('    fixedSegmentId,\n','').replace('    answerToken,\n','');p.write_text(s)
p=Path('src/types/puzzle.ts');s=p.read_text().replace('  fixedSegmentId?: string;\n','').replace('  answerToken: string;\n','');a=s.index('export interface AnswerData');b=s.index('export interface BookSummary',a);p.write_text(s[:a]+s[b:])
p=Path('src/pages/api/puzzle/generate.ts');s=p.read_text().replace('import { parseDifficulty } from "@/lib/puzzle/difficulty";\n','').replace('  const difficulty = parseDifficulty(body.difficulty);', '''  if (body.difficulty !== "easy" && body.difficulty !== "normal") {
    res.status(400).json({ success: false, error: { code: "INVALID_DIFFICULTY", message: "現在はEasyとNormalで遊べます。" } });
    return;
  }
  const difficulty = body.difficulty;''');p.write_text(s)
p=Path('src/lib/puzzle/segmenter.ts');s=p.read_text().replace('const chars = [...text.replace(/\\s+/g, "")];', 'const chars = graphemes(text.replace(/\\r\\n?|\\n/g, ""));').replace('const PARTICLES', 'const graphemes = (text: string) => [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text)].map((item) => item.segment);\n\nconst PARTICLES');s=s.replace('if (chunks[i].length > maxLength) {\n      maxLength = chunks[i].length;', 'if (graphemes(chunks[i]).length > maxLength) {\n      maxLength = graphemes(chunks[i]).length;').replace('const chunk = chunks[maxIndex];', 'const chunk = graphemes(chunks[maxIndex]);').replace('chunk.slice(0, mid), chunk.slice(mid)', 'chunk.slice(0, mid).join(""), chunk.slice(mid).join("")');p.write_text(s)
p=Path('src/lib/aozora/client.ts');s=p.read_text();a=s.index('  try {\n    const content = await readFile');b=s.index('\n}',a);s=s[:a]+'''  const content = await readFile(absolutePath, "utf8");
  fixedContentCache.set(bookId, content);
  return content;'''+s[b:];p.write_text(s)
p=Path('src/data/fixedBooks.ts');s=p.read_text().replace('  fallbackContent: string;\n','');s=re.sub('    fallbackContent:\n      "[^"\\n]+",\n','',s);p.write_text(s)
p=Path('src/lib/puzzle/difficulty.ts');s='\n'.join(l for l in p.read_text().split('\n') if 'showFixedFirstSegment' not in l and 'targetTimeSeconds' not in l);s=s[:s.index('\nexport function parseDifficulty')]+'\n';p.write_text(s)
for folder in ['src/components/common','src/components/layout','src/components/play','src/components/setup','src/contexts','src/hooks']:
 for f in Path(folder).glob('*'): f.unlink()
for name in ['src/pages/api/puzzle/submit.ts','src/lib/puzzle/answerToken.ts','src/lib/puzzle/scoring.ts','src/lib/puzzle/validator.ts','src/styles/play.css','src/styles/setup.css','src/styles/result.css']: Path(name).unlink()
p=Path('src/lib/utils.ts');s=p.read_text();p.write_text(s[s.index('const AOZORA_URL_RE'):s.index('\nexport function formatSeconds')]+'\n')
p=Path('.gitignore');p.write_text(p.read_text()+'\n# Generated from locked font packages and original audio synthesis\n/public/fonts/\n/public/audio/\n')
p=Path('tsconfig.json');p.write_text(p.read_text().replace('"ES2017"','"ES2020"'))
Path(__file__).unlink()
