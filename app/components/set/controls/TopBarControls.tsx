'use client';

import {
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
} from '@/app/components/ui/GroupedDropdown';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { Filter, Grid, List, SortAsc } from 'lucide-react';
import type { GroupBy, ItemSize, SortKey, ViewType } from '../types';

type Props = {
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
  onCloseDropdown: (id: 'display' | 'sort' | 'view') => void;
};

export function TopBarControls({
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
}: Props) {
  const isDesktop = useIsDesktop();
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
    </>
  );
}
