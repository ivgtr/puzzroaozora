interface ProgressBarProps {
  answerCount: number;
  totalCount: number;
  availableCount: number;
  progressRate: number;
  fixedSegmentText?: string;
}

export function ProgressBar({
  answerCount,
  totalCount,
  availableCount,
  progressRate,
  fixedSegmentText,
}: ProgressBarProps) {
  return (
    <section className="progress-section">
      <div className="progress-bar" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${progressRate}%` }} />
      </div>
      <div className="stats-row">
        <span>
          {answerCount}/{totalCount} 配置
        </span>
        <span>{availableCount} 残り</span>
        <span>{progressRate}%</span>
        {fixedSegmentText ? <span>固定: {fixedSegmentText}</span> : null}
      </div>
    </section>
  );
}
