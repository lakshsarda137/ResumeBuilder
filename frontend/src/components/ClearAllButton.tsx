import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

interface ClearAllButtonProps {
  apiPath: string;
  confirmMessage: string;
  disabled?: boolean;
  onComplete: () => void;
}

export function ClearAllButton({
  apiPath,
  confirmMessage,
  disabled = false,
  onComplete,
}: ClearAllButtonProps) {
  const [clearing, setClearing] = useState(false);

  const handleClick = async () => {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setClearing(true);
    try {
      const res = await fetch(apiPath, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string' ? body.error : 'Failed to delete all entries.',
        );
      }
      onComplete();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete all entries.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn--danger"
      onClick={handleClick}
      disabled={disabled || clearing}
      title="Delete everything on this page"
    >
      {clearing ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
      Delete all
    </button>
  );
}
