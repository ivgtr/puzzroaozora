import { useAppContext } from "@/contexts/AppContext";

export function Toast() {
  const { notice, noticeKey } = useAppContext();

  if (!notice) return null;

  return (
    <div key={noticeKey} className="toast" role="status">
      <p className="toast-text">{notice}</p>
    </div>
  );
}
