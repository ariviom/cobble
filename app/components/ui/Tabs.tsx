'use client';

import {
  createContext,
  useContext,
  useState,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react';
import { cn } from './utils';

// Context for tabs state
type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
}

// Root Tabs component
export type TabsProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    defaultValue: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }
>;

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
  children,
  ...rest
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = (newValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={cn('w-full', className)} {...rest}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// TabsList component
export type TabsListProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function TabsList({ className, children, ...rest }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        // Chunky container with border, like a LEGO baseplate
        'inline-flex items-center gap-4 rounded-lg border-2 border-subtle bg-background-muted p-1.5',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// TabsTrigger component
export type TabsTriggerProps = PropsWithChildren<
  HTMLAttributes<HTMLButtonElement> & {
    value: string;
    disabled?: boolean;
  }
>;

export function TabsTrigger({
  value,
  disabled,
  className,
  children,
  ...rest
}: TabsTriggerProps) {
  const { value: selectedValue, onValueChange } = useTabsContext();
  const isSelected = value === selectedValue;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      aria-controls={`tabpanel-${value}`}
      disabled={disabled}
      onClick={() => onValueChange(value)}
      className={cn(
        // Bold tabs with chunky styling
        'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all duration-150',
        'focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        isSelected
          ? // Selected: Theme color background with 3D depth
            'bg-theme-primary text-theme-primary-contrast shadow-[0_2px_0_0_var(--color-theme-shadow)]'
          : 'text-foreground-muted hover:bg-card hover:text-foreground',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// TabsContent component
export type TabsContentProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    value: string;
  }
>;

export function TabsContent({
  value,
  className,
  children,
  ...rest
}: TabsContentProps) {
  const { value: selectedValue } = useTabsContext();
  const isSelected = value === selectedValue;

  if (!isSelected) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      className={cn(
        'mt-4 focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:outline-none',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
