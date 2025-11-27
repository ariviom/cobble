'use client';

import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef } from 'react';

export type PieceDeltaPayload = {
  key: string;
  delta: number;
  newOwned: number;
  participantId: string | null;
  clientId: string;
  setNumber: string;
};

type UseGroupSessionChannelArgs = {
  enabled: boolean;
  sessionId: string | null;
  setNumber: string;
  participantId: string | null;
  clientId: string;
  /**
   * Called when a remote client (different clientId) broadcasts a piece_delta.
   */
  onRemoteDelta: (payload: PieceDeltaPayload) => void;
  /**
   * Optional callback to update per-participant stats when a delta occurs.
   * Called both for local broadcasts and for remote events.
   */
  onParticipantPiecesDelta?: (participantId: string | null, delta: number) => void;
};

type UseGroupSessionChannelResult = {
  broadcastPieceDelta: (args: {
    key: string;
    delta: number;
    newOwned: number;
  }) => void;
};

export function useGroupSessionChannel({
  enabled,
  sessionId,
  setNumber,
  participantId,
  clientId,
  onRemoteDelta,
  onParticipantPiecesDelta,
}: UseGroupSessionChannelArgs): UseGroupSessionChannelResult {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) {
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`group_session:${sessionId}`);
    channelRef.current = channel;

    channel.on('broadcast', { event: 'piece_delta' }, ({ payload }) => {
      const data = payload as PieceDeltaPayload | null;
      if (!data) return;
      if (data.setNumber !== setNumber) return;
      if (!data.key) return;

      // Ignore echoes of our own events; the originating client has already
      // applied the change locally.
      if (data.clientId === clientId) return;

      onRemoteDelta(data);

      if (onParticipantPiecesDelta) {
        onParticipantPiecesDelta(data.participantId ?? null, data.delta);
      }
    });

    try {
      channel.subscribe(status => {
        if (process.env.NODE_ENV !== 'production') {
          // This is intentionally verbose only in development to help debug
          // Realtime connectivity issues.
          console.log('[GroupSessionChannel] status', {
            sessionId,
            status,
          });
        }
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[GroupSessionChannel] subscribe failed', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return () => {
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [enabled, sessionId, setNumber, clientId, onRemoteDelta, onParticipantPiecesDelta]);

  const broadcastPieceDelta = useCallback(
    (args: { key: string; delta: number; newOwned: number }) => {
      if (!enabled || !sessionId) return;
      if (!args.key) return;

      const channel = channelRef.current;
      if (!channel) return;

      const payload: PieceDeltaPayload = {
        key: args.key,
        delta: args.delta,
        newOwned: args.newOwned,
        participantId,
        clientId,
        setNumber,
      };

      channel
        .send({
          type: 'broadcast',
          event: 'piece_delta',
          payload,
        })
        .catch(err => {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[GroupSessionChannel] broadcast failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });

      if (onParticipantPiecesDelta) {
        onParticipantPiecesDelta(participantId ?? null, args.delta);
      }
    },
    [
      enabled,
      sessionId,
      participantId,
      clientId,
      setNumber,
      onParticipantPiecesDelta,
    ]
  );

  return { broadcastPieceDelta };
}


