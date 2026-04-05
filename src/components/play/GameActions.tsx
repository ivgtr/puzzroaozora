interface GameActionsProps {
  canSubmit: boolean;
  onReset: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function GameActions({ canSubmit, onReset, onSubmit, isSubmitting }: GameActionsProps) {
  return (
    <div className="game-actions">
      <button type="button" className="btn" onClick={onReset} disabled={isSubmitting}>
        リセット
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onSubmit}
        disabled={!canSubmit}
      >
        {isSubmitting ? "\u9001\u4FE1\u4E2D\u2026" : "\u7B54\u3048\u5408\u308F\u305B"}
      </button>
    </div>
  );
}
