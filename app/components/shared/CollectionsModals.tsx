'use client';

import { CollectionsModalContent } from '@/app/components/collections/CollectionsModalContent';
import { Modal } from '@/app/components/ui/Modal';
import { UpgradeModal } from '@/app/components/upgrade-modal';

type CollectionsModalsProps = {
  isOpen: boolean;
  onClose: () => void;
  lists: { id: string; name: string; isSystem: boolean }[];
  selectedListIds: string[];
  listsLoading: boolean;
  listsError: string | null;
  toggleList: (listId: string) => void;
  createList: (name: string) => void;
  renameList: (listId: string, newName: string) => void;
  deleteList: (listId: string) => void;
  showListUpgradeModal: boolean;
  dismissListUpgradeModal: () => void;
};

export function CollectionsModals({
  isOpen,
  onClose,
  lists,
  selectedListIds,
  listsLoading,
  listsError,
  toggleList,
  createList,
  renameList,
  deleteList,
  showListUpgradeModal,
  dismissListUpgradeModal,
}: CollectionsModalsProps): React.ReactNode {
  return (
    <>
      <Modal open={isOpen} title="Collections" onClose={onClose}>
        <CollectionsModalContent
          lists={lists}
          selectedListIds={selectedListIds}
          isLoading={listsLoading}
          error={listsError}
          onToggle={toggleList}
          onCreate={createList}
          onRename={renameList}
          onDelete={deleteList}
        />
      </Modal>
      <UpgradeModal
        open={showListUpgradeModal}
        feature="lists.unlimited"
        onClose={dismissListUpgradeModal}
      />
    </>
  );
}
