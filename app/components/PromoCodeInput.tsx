'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { useRedeemPromo } from '@/app/hooks/useRedeemPromo';

export function PromoCodeInput() {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState('');
  const { redeem, loading, error, success } = useRedeemPromo();
  const router = useRouter();

  if (success) {
    // Refresh SSR data so entitlements update immediately
    router.refresh();
    return (
      <p className="text-sm font-medium text-success">
        Promo code applied! Welcome to Plus.
      </p>
    );
  }

  if (!expanded) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm text-foreground-muted underline underline-offset-2 hover:text-foreground"
        >
          Have a promo code?
        </button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      redeem(code.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Enter promo code"
          disabled={loading}
          size="sm"
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={loading || !code.trim()}
          variant="primary"
          size="sm"
        >
          {loading ? 'Applying...' : 'Apply'}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
