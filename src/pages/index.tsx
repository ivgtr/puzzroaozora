import { useState } from "react";
import { useGameContext } from "@/contexts/GameContext";
import { usePuzzleGenerator } from "@/hooks/usePuzzleGenerator";
import { AppIcon } from "@/components/layout/AppIcon";
import { PageShell } from "@/components/layout/PageShell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { DifficultySelector } from "@/components/setup/DifficultySelector";
import { BookSelector } from "@/components/setup/BookSelector";
import { ImportUrlForm } from "@/components/setup/ImportUrlForm";
import { UserBookList } from "@/components/setup/UserBookList";

export default function Home() {
  const { state } = useGameContext();
  const { generatePuzzle, isGenerating } = usePuzzleGenerator();
  const [editMode, setEditMode] = useState(false);

  return (
    <PageShell>
      <div className="setup-root">
        <header className="setup-header">
          <div className="setup-title">
            <h1><AppIcon size={28} className="setup-title-icon" />青空パズル</h1>
            <p>文学作品の語順を記憶と読解で組み直す</p>
          </div>
          <ThemeToggle />
        </header>
        <hr className="divider" />

        <section className="setup-controls">
          <DifficultySelector disabled={isGenerating} />
          <BookSelector
            disabled={isGenerating}
            editMode={editMode}
            onToggleEdit={() => setEditMode((prev) => !prev)}
          />
          <ImportUrlForm />
          {editMode && state.userBooks.length > 0 && <UserBookList />}
        </section>

        <div className="setup-action">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void generatePuzzle()}
            disabled={isGenerating}
          >
            {isGenerating ? "\u751F\u6210\u4E2D\u2026" : "\u554F\u984C\u3092\u751F\u6210"}
          </button>
        </div>

        <div className="setup-intro">
          <p>
            難易度と作品を選び、<strong>問題を生成</strong>を押してください。
            文を正しい順に戻すことで、語順記憶と読解力を鍛えられます。
          </p>
        </div>
      </div>
    </PageShell>
  );
}
