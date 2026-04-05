import { useImportBook } from "@/hooks/useImportBook";

export function ImportUrlForm() {
  const { importUrl, setImportUrl, isImporting, importBook } = useImportBook();

  return (
    <div className="import-row">
      <input
        type="text"
        value={importUrl}
        placeholder="https://www.aozora.gr.jp/cards/.../files/..."
        onChange={(e) => setImportUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void importBook();
          }
        }}
        disabled={isImporting}
      />
      <button
        type="button"
        className="btn"
        onClick={() => void importBook()}
        disabled={isImporting || importUrl.trim().length === 0}
      >
        {isImporting ? "\u53D6\u8FBC\u4E2D\u2026" : "\u8FFD\u52A0"}
      </button>
    </div>
  );
}
