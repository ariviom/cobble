import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/components/ui/PartCard', () => ({
  KNOCKOUT_SKIP_COLORS: new Set<string>(),
  PartCard: ({ quantityArea }: { quantityArea: React.ReactNode }) => (
    <div>{quantityArea}</div>
  ),
}));

vi.mock('../OwnedQuantityControl', () => ({
  OwnedQuantityControl: ({
    onChange,
  }: {
    onChange: (next: number) => void;
  }) => (
    <button type="button" onClick={() => onChange(2)}>
      change-owned
    </button>
  ),
}));

vi.mock('./RarityBadge', () => ({
  RarityBadge: () => <div>rarity</div>,
}));

vi.mock('@/app/components/ui/SignInPrompt', () => ({
  SignInPrompt: () => <div>sign-in</div>,
}));

vi.mock('@/app/components/ui/MoreDropdown', () => ({
  MoreDropdownButton: () => null,
}));

vi.mock('@/app/lib/minifigIds', () => ({
  formatMinifigId: () => ({
    displayId: 'fig-id',
    label: 'fig-label',
  }),
}));

import { InventoryItem } from '../InventoryItem';
import type { InventoryRow } from '../../types';

const row: InventoryRow = {
  setNumber: '1234-1',
  partId: '3001',
  partName: 'Brick 2 x 4',
  colorId: 1,
  colorName: 'Red',
  quantityRequired: 4,
  imageUrl: null,
  inventoryKey: '3001:1',
};

describe('InventoryItem', () => {
  it('updates to the latest onOwnedChange handler when only callback props change', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const { rerender } = render(
      <InventoryItem
        setNumber="1234-1"
        row={row}
        owned={1}
        missing={3}
        bricklinkColorId={null}
        rarityTier={null}
        onOwnedChange={firstHandler}
        isPinned={false}
        onTogglePinned={vi.fn()}
        onShowMoreInfo={vi.fn()}
        isAuthenticated
        isInGroupSession={false}
      />
    );

    rerender(
      <InventoryItem
        setNumber="1234-1"
        row={row}
        owned={1}
        missing={3}
        bricklinkColorId={null}
        rarityTier={null}
        onOwnedChange={secondHandler}
        isPinned={false}
        onTogglePinned={vi.fn()}
        onShowMoreInfo={vi.fn()}
        isAuthenticated
        isInGroupSession={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'change-owned' }));

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith(2);
  });
});
