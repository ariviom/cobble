'use client';

import {
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
  formatMultiSelectLabel,
} from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import {
  CheckSquare,
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
  SortKey,
  ViewType,
} from '../types';
import { PinnedPanelContent } from './PinnedPanel';
import { SidebarCategoryPanel } from './SidebarCategoryPanel';
import { SidebarColorPanel } from './SidebarColorPanel';

type Props = {
  setNumber: string;
  setName?: string | undefined;
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
  parentCounts?: Record<string, number> | undefined;
  subcategoriesByParent: Record<string, string[]>;
  colorOptions: string[];
  onToggleColor: (color: string) => void;
  isDesktop: boolean;
  isParentOpen: boolean;
  isColorOpen: boolean;
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
  onToggleColor,
  isDesktop,
  isParentOpen,
  isColorOpen,
}: Props) {
  const getColorLabel = () =>
    formatMultiSelectLabel('Colors', filter.colors || []);

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

      <div className="lg:relative">
        <DropdownTrigger
          id="sort-trigger"
          panelId="sort-panel"
          label="Sort"
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => onToggleDropdown('sort')}
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
                    { key: 'price', text: 'Price' },
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

      <div>
        <DropdownTrigger
          id="pinned-trigger"
          panelId="pinned-panel"
          label={
            <span className="inline-flex items-center gap-2">
              <span>Pinned</span>
              {pinnedCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-200 px-1 text-xs">
                  {pinnedCount}
                </span>
              ) : null}
            </span>
          }
          labelIcon={<Pin size={16} />}
          isOpen={openDropdownId === 'pinned'}
          onToggle={() => onToggleDropdown('pinned')}
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
      {/* Sidebar Group Triggers */}
      <div className="sidebar relative min-w-fit border-neutral-300 lg:fixed lg:top-nav-height lg:left-0 lg:h-[calc(100dvh-var(--spacing-nav-height))] lg:w-80 lg:overflow-y-auto lg:border-r lg:bg-neutral-00">
        <div className="flex flex-nowrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-1">
          {parentOptions.length > 0 ? (
            <div className="lg:relative">
              <DropdownTrigger
                id="parent-trigger"
                panelId="parent-panel"
                label={formatMultiSelectLabel('Pieces', filter.parents || [])}
                labelIcon={<FolderTree size={16} />}
                isOpen={isDesktop ? isParentOpen : openDropdownId === 'parent'}
                onToggle={() => onToggleDropdown('parent')}
                variant="sidebar"
              />
              {(isDesktop ? isParentOpen : openDropdownId === 'parent') && (
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
                    parentCounts={parentCounts}
                  />
                </DropdownPanelFrame>
              )}
            </div>
          ) : null}

          {colorOptions && colorOptions.length > 0 ? (
            <div className="lg:relative">
              <DropdownTrigger
                id="color-trigger"
                panelId="color-panel"
                label={
                  isDesktop ? (
                    <span>
                      Colors
                      {(filter.colors?.length || 0) > 0 ? (
                        <span className="ml-2 text-sm text-neutral-400">
                          ({filter.colors!.join(', ')})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    getColorLabel()
                  )
                }
                labelIcon={<Palette size={16} />}
                isOpen={isDesktop ? isColorOpen : openDropdownId === 'color'}
                onToggle={() => onToggleDropdown('color')}
                variant="sidebar"
              />
              {(isDesktop ? isColorOpen : openDropdownId === 'color') && (
                <DropdownPanelFrame
                  id="color-panel"
                  labelledBy="color-trigger"
                  isOpen={true}
                  variant="sidebar"
                >
                  <SidebarColorPanel
                    colorOptions={colorOptions}
                    selectedColors={filter.colors || []}
                    onToggleColor={onToggleColor}
                    onClear={() => onChangeFilter({ ...filter, colors: [] })}
                  />
                </DropdownPanelFrame>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="lg:relative">
        <DropdownTrigger
          id="markall-trigger"
          panelId="markall-panel"
          label="Mark All"
          labelIcon={<CheckSquare size={16} />}
          isOpen={openDropdownId === 'markAll'}
          onToggle={() => onToggleDropdown('markAll')}
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
    </>
  );
}
