'use client';

import { ClearAllButton } from '@/app/components/ui/ClearAllButton';
import {
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
  formatSelectionSubLabel,
} from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { usePricingEnabled } from '@/app/hooks/usePricingEnabled';
import {
  CheckSquare,
  Diamond,
  Download,
  Filter,
  FolderTree,
  Grid,
  List,
  Palette,
  Pin,
  SortAsc,
} from 'lucide-react';
import type {
  GroupBy,
  InventoryFilter,
  ItemSize,
  RarityTier,
  SortKey,
  ViewType,
} from '../types';
import { PinnedPanelContent } from './PinnedPanel';
import { SidebarCategoryPanel } from './SidebarCategoryPanel';
import { SidebarColorPanel } from './SidebarColorPanel';

type Props = {
  setNumber: string;
  setName?: string;
  view: ViewType;
  onChangeView: (v: ViewType) => void;
  itemSize: ItemSize;
  onChangeItemSize: (s: ItemSize) => void;
  sortKey: SortKey;
  onChangeSortKey: (k: SortKey) => void;
  sortDir: 'asc' | 'desc';
  onToggleSortDir: () => void;
  groupBy: GroupBy;
  onChangeGroupBy: (g: GroupBy) => void;
  displayKey: 'all' | 'missing' | 'owned';
  onChangeDisplay: (next: 'all' | 'missing' | 'owned') => void;
  openDropdownId: string | null;
  onToggleDropdown: (id: string) => void;
  onCloseDropdown: (id: string) => void;
  pinnedCount: number;
  onMarkAllMissing: () => void;
  onMarkAllComplete: () => void;
  filter: InventoryFilter;
  onChangeFilter: (f: InventoryFilter) => void;
  parentOptions: string[];
  parentCounts?: Record<string, number>;
  subcategoriesByParent: Record<string, string[]>;
  colorOptions: string[];
  /** Colors that have matching pieces after display/category filters (for disabling unavailable options) */
  availableColors: Set<string>;
  onToggleColor: (color: string) => void;
  isDesktop: boolean;
  isParentOpen: boolean;
  isColorOpen: boolean;
  onOpenExportModal: () => void;
  /** When true, sidebar triggers are disabled (data not yet loaded) */
  isLoading?: boolean | undefined;
};

export function TopBarControls({
  setNumber,
  setName,
  view,
  onChangeView,
  itemSize,
  onChangeItemSize,
  sortKey,
  onChangeSortKey,
  sortDir,
  onToggleSortDir,
  groupBy,
  onChangeGroupBy,
  displayKey,
  onChangeDisplay,
  openDropdownId,
  onToggleDropdown,
  onCloseDropdown,
  pinnedCount,
  onMarkAllMissing,
  onMarkAllComplete,
  filter,
  onChangeFilter,
  parentOptions,
  parentCounts,
  subcategoriesByParent,
  colorOptions,
  availableColors,
  onToggleColor,
  isDesktop,
  isParentOpen,
  isColorOpen,
  onOpenExportModal,
  isLoading,
}: Props) {
  const pricingEnabled = usePricingEnabled();

  return (
    <>
      <div className="lg:relative">
        <DropdownTrigger
          id="display-trigger"
          panelId="display-panel"
          label={
            displayKey === 'owned'
              ? 'Owned'
              : displayKey === 'missing'
                ? 'Missing'
                : 'All'
          }
          labelIcon={<Filter size={16} />}
          isOpen={openDropdownId === 'display'}
          onToggle={() => onToggleDropdown('display')}
          disabled={isLoading}
        />
        {openDropdownId === 'display' && (
          <DropdownPanelFrame
            id="display-panel"
            labelledBy="display-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <DropdownSection label="Filter By">
              <SingleSelectList
                options={[
                  { key: 'all', text: 'All' },
                  { key: 'missing', text: 'Missing' },
                  { key: 'owned', text: 'Owned' },
                ]}
                selectedKey={displayKey}
                onChange={k =>
                  onChangeDisplay(k as 'all' | 'missing' | 'owned')
                }
              />
            </DropdownSection>
          </DropdownPanelFrame>
        )}
      </div>

      {/* Sidebar Group Triggers — Pieces & Colors (absolute-positioned sidebar on desktop) */}
      <div className="sidebar relative min-w-0 shrink-0 border-subtle lg:fixed lg:top-[calc(var(--spacing-nav-offset)+var(--grid-row-tabs,0px))] lg:left-0 lg:h-[calc(100dvh-var(--spacing-nav-offset)-var(--grid-row-tabs,0px))] lg:w-80 lg:overflow-y-auto lg:border-r lg:bg-card">
        <div className="flex flex-nowrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-0">
          {/* Pieces */}
          <div className="lg:relative">
            <DropdownTrigger
              id="parent-trigger"
              panelId="parent-panel"
              label={
                isDesktop
                  ? 'Pieces'
                  : filter.parents?.length
                    ? `Pieces (${filter.parents.length})`
                    : 'Pieces'
              }
              subLabel={
                isDesktop
                  ? formatSelectionSubLabel(filter.parents || [], parentOptions)
                  : undefined
              }
              labelIcon={<FolderTree size={16} />}
              isOpen={isDesktop ? isParentOpen : openDropdownId === 'parent'}
              onToggle={() => onToggleDropdown('parent')}
              variant="sidebar"
              disabled={isLoading || parentOptions.length === 0}
            />
            {!isLoading &&
              parentOptions.length > 0 &&
              (isDesktop ? isParentOpen : openDropdownId === 'parent') && (
                <DropdownPanelFrame
                  id="parent-panel"
                  labelledBy="parent-trigger"
                  isOpen={true}
                  variant="sidebar"
                >
                  <SidebarCategoryPanel
                    filter={filter}
                    onChangeFilter={onChangeFilter}
                    parentOptions={parentOptions}
                    subcategoriesByParent={subcategoriesByParent}
                    {...(parentCounts ? { parentCounts } : {})}
                  />
                </DropdownPanelFrame>
              )}
          </div>

          {/* Colors */}
          <div className="lg:relative">
            <DropdownTrigger
              id="color-trigger"
              panelId="color-panel"
              label={
                isDesktop
                  ? 'Colors'
                  : filter.colors?.length
                    ? `Colors (${filter.colors.length})`
                    : 'Colors'
              }
              subLabel={
                isDesktop
                  ? formatSelectionSubLabel(filter.colors || [], colorOptions)
                  : undefined
              }
              labelIcon={<Palette size={16} />}
              isOpen={isDesktop ? isColorOpen : openDropdownId === 'color'}
              onToggle={() => onToggleDropdown('color')}
              variant="sidebar"
              disabled={isLoading || !colorOptions || colorOptions.length === 0}
            />
            {!isLoading &&
              colorOptions &&
              colorOptions.length > 0 &&
              (isDesktop ? isColorOpen : openDropdownId === 'color') && (
                <DropdownPanelFrame
                  id="color-panel"
                  labelledBy="color-trigger"
                  isOpen={true}
                  variant="sidebar"
                >
                  <SidebarColorPanel
                    colorOptions={colorOptions}
                    availableColors={availableColors}
                    selectedColors={filter.colors || []}
                    onToggleColor={onToggleColor}
                    onClear={() => onChangeFilter({ ...filter, colors: [] })}
                  />
                </DropdownPanelFrame>
              )}
          </div>
        </div>
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="rarity-trigger"
          panelId="rarity-panel"
          label={
            filter.rarityTiers?.length
              ? `Rarity (${filter.rarityTiers.length})`
              : 'Rarity'
          }
          labelIcon={<Diamond size={16} />}
          isOpen={openDropdownId === 'rarity'}
          onToggle={() => onToggleDropdown('rarity')}
          disabled={isLoading}
        />
        {openDropdownId === 'rarity' && (
          <DropdownPanelFrame
            id="rarity-panel"
            labelledBy="rarity-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <DropdownSection>
              <div>
                {(
                  [
                    { key: 'exclusive', text: 'Exclusive' },
                    { key: 'very_rare', text: 'Very Rare' },
                    { key: 'rare', text: 'Rare' },
                  ] as const
                ).map(opt => {
                  const selected =
                    filter.rarityTiers?.includes(opt.key) ?? false;
                  return (
                    <RowButton
                      key={opt.key}
                      selected={selected}
                      onClick={() => {
                        const current: RarityTier[] = filter.rarityTiers ?? [];
                        const next = selected
                          ? current.filter(t => t !== opt.key)
                          : [...current, opt.key];
                        onChangeFilter({
                          ...filter,
                          rarityTiers: next.length > 0 ? next : undefined,
                        });
                      }}
                      className="border-b border-foreground-accent"
                    >
                      <RowCheckbox checked={selected} />
                      <span>{opt.text}</span>
                    </RowButton>
                  );
                })}
              </div>
            </DropdownSection>
            {(filter.rarityTiers?.length ?? 0) > 0 && (
              <DropdownSection label="">
                <ClearAllButton
                  className="border-t-2"
                  onClick={() =>
                    onChangeFilter({ ...filter, rarityTiers: undefined })
                  }
                />
              </DropdownSection>
            )}
          </DropdownPanelFrame>
        )}
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="sort-trigger"
          panelId="sort-panel"
          label="Sort"
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => onToggleDropdown('sort')}
          disabled={isLoading}
        />
        {openDropdownId === 'sort' && (
          <DropdownPanelFrame
            id="sort-panel"
            labelledBy="sort-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <GroupedList
              sections={[
                {
                  id: 'sortBy',
                  label: 'Sort By',
                  options: [
                    { key: 'name', text: 'Name' },
                    { key: 'color', text: 'Color' },
                    { key: 'size', text: 'Size' },
                    { key: 'category', text: 'Category' },
                    { key: 'quantity', text: 'Quantity' },
                    { key: 'rarity', text: 'Rarity' },
                    ...(pricingEnabled
                      ? [{ key: 'price', text: 'Price' }]
                      : []),
                  ],
                  selectedKey: sortKey,
                  onChange: k => {
                    onChangeSortKey(k as SortKey);
                    onCloseDropdown('sort');
                  },
                },
                {
                  id: 'order',
                  label: 'Order',
                  options: [
                    { key: 'asc', text: 'Ascending' },
                    { key: 'desc', text: 'Descending' },
                  ],
                  selectedKey: sortDir,
                  onChange: () => {
                    onToggleSortDir();
                    onCloseDropdown('sort');
                  },
                },
                {
                  id: 'groupBy',
                  label: 'Group By',
                  options: [
                    { key: 'none', text: 'None' },
                    { key: 'color', text: 'Color' },
                    { key: 'size', text: 'Size' },
                    { key: 'category', text: 'Category' },
                    { key: 'rarity', text: 'Rarity' },
                  ],
                  selectedKey: groupBy,
                  onChange: g => {
                    onChangeGroupBy(g as GroupBy);
                    onCloseDropdown('sort');
                  },
                },
              ]}
            />
          </DropdownPanelFrame>
        )}
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="view-trigger"
          panelId="view-panel"
          label={view === 'grid' ? 'Grid' : 'List'}
          labelIcon={view === 'grid' ? <Grid size={16} /> : <List size={16} />}
          isOpen={openDropdownId === 'view'}
          onToggle={() => onToggleDropdown('view')}
          disabled={isLoading}
        />
        {openDropdownId === 'view' && (
          <DropdownPanelFrame
            id="view-panel"
            labelledBy="view-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <DropdownSection label="View">
              <SingleSelectList
                options={[
                  { key: 'list', text: 'List', icon: <List size={16} /> },
                  { key: 'grid', text: 'Grid', icon: <Grid size={16} /> },
                ]}
                selectedKey={view}
                onChange={k => {
                  onChangeView(k as ViewType);
                  onCloseDropdown('view');
                }}
              />
            </DropdownSection>
            <DropdownSection label="Size">
              <SingleSelectList
                options={[
                  { key: 'lg', text: 'Large' },
                  { key: 'md', text: 'Medium' },
                  { key: 'sm', text: 'Small' },
                ]}
                selectedKey={itemSize}
                onChange={k => {
                  onChangeItemSize(k as ItemSize);
                  onCloseDropdown('view');
                }}
              />
            </DropdownSection>
          </DropdownPanelFrame>
        )}
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="markall-trigger"
          panelId="markall-panel"
          label="Mark All"
          labelIcon={<CheckSquare size={16} />}
          isOpen={openDropdownId === 'markAll'}
          onToggle={() => onToggleDropdown('markAll')}
          disabled={isLoading}
        />
        {openDropdownId === 'markAll' && (
          <DropdownPanelFrame
            id="markall-panel"
            labelledBy="markall-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <DropdownSection label="Mark All">
              <RowButton
                size="sm"
                onClick={() => {
                  onMarkAllMissing();
                  onCloseDropdown('markAll');
                }}
              >
                <span>Missing</span>
              </RowButton>
              <RowButton
                size="sm"
                onClick={() => {
                  onMarkAllComplete();
                  onCloseDropdown('markAll');
                }}
              >
                <span>Complete</span>
              </RowButton>
            </DropdownSection>
          </DropdownPanelFrame>
        )}
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="pinned-trigger"
          panelId="pinned-panel"
          label={
            <span className="inline-flex items-center gap-2">
              <span>Pinned</span>
              {pinnedCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-card-muted px-1 text-xs">
                  {pinnedCount}
                </span>
              ) : null}
            </span>
          }
          labelIcon={<Pin size={16} />}
          isOpen={openDropdownId === 'pinned'}
          onToggle={() => onToggleDropdown('pinned')}
          disabled={isLoading}
        />
        {openDropdownId === 'pinned' && (
          <DropdownPanelFrame
            id="pinned-panel"
            labelledBy="pinned-trigger"
            isOpen={true}
            className="max-h-pinned-panel-height w-full lg:top-[calc(100%+0.5rem)] lg:left-4 lg:max-h-[75dvh] lg:w-[calc(100%-22rem)] lg:shadow-lg"
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <PinnedPanelContent
              currentSetNumber={setNumber}
              currentSetName={setName}
              view={view}
              itemSize={itemSize}
            />
          </DropdownPanelFrame>
        )}
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="export-trigger"
          panelId="export-panel"
          label="Parts List"
          labelIcon={<Download size={16} />}
          isOpen={false}
          onToggle={onOpenExportModal}
          disabled={isLoading}
        />
      </div>
    </>
  );
}
