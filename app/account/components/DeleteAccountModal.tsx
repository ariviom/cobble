'use client';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Modal } from '@/app/components/ui/Modal';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

type DeleteAccountModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteAccountModal({
  open,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError('Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText('');
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} title="Delete Account" onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-foreground-muted">
          <p>
            This will permanently delete your account and all associated data
            including your inventory, collections, and preferences. Active
            subscriptions will be automatically cancelled.
          </p>
          <p className="mt-3 font-semibold text-danger">
            This action cannot be undone.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold tracking-wide text-foreground-muted uppercase">
            Type DELETE to confirm
          </label>
          <Input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleDelete();
            }}
            placeholder="DELETE"
            size="sm"
            disabled={isDeleting}
          />
        </div>

        {error && (
          <p className="text-body-sm font-medium text-danger">{error}</p>
        )}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="md"
            className="flex-1"
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            className="flex-1 gap-1.5"
            onClick={() => void handleDelete()}
            disabled={!isConfirmed || isDeleting}
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Deleting\u2026' : 'Delete Account'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
