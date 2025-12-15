'use client';

import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { logEvent } from '@/lib/metrics';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

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
   * Called when a remote client broadcasts an owned snapshot for the set.
   */
  onRemoteSnapshot?: (ownedByKey: Record<string, number>) => void;
  /**
   * Optional callback to update per-participant stats when a delta occurs.
   * Called both for local broadcasts and for remote events.
   */
  onParticipantPiecesDelta?: (
    participantId: string | null,
    delta: number
  ) => void;
};

type UseGroupSessionChannelResult = {
  broadcastPieceDelta: (args: {
    key: string;
    delta: number;
    newOwned: number;
  }) => void;
  broadcastOwnedSnapshot: (ownedByKey: Record<string, number>) => void;
  connectionState: 'disconnected' | 'connecting' | 'connected';
};

export function useGroupSessionChannel({
  enabled,
  sessionId,
  setNumber,
  participantId,
  clientId,
  onRemoteDelta,
  onRemoteSnapshot,
  onParticipantPiecesDelta,
}: UseGroupSessionChannelArgs): UseGroupSessionChannelResult {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connectionState, setConnectionState] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    channel.on('broadcast', { event: 'owned_snapshot' }, ({ payload }) => {
      const data = payload as {
        ownedByKey: Record<string, number>;
        setNumber: string;
        clientId: string;
      } | null;
      if (!data) return;
      if (data.setNumber !== setNumber) return;
      if (data.clientId === clientId) return;
      if (!data.ownedByKey || typeof data.ownedByKey !== 'object') return;
      onRemoteSnapshot?.(data.ownedByKey);
    });

    try {
      channel.subscribe(status => {
        // Update connection state based on Realtime status
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          reconnectAttemptRef.current = 0; // Reset on successful connection
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnectionState('disconnected');
          // Attempt reconnect with exponential backoff
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttemptRef.current),
            30000 // Max 30 seconds
          );
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptRef.current += 1;
            setConnectionState('connecting');
            // Re-subscription will happen on next effect run
          }, delay);

          if (process.env.NODE_ENV !== 'production') {
            logEvent('group_session.channel_disconnected', {
              sessionId,
              reconnectAttempt: reconnectAttemptRef.current,
              retryDelayMs: delay,
            });
          }
        } else {
          // Handle other states like SUBSCRIBING, TIMED_OUT
          setConnectionState('connecting');
        }

        if (process.env.NODE_ENV !== 'production') {
          // This is intentionally verbose only in development to help debug
          // Realtime connectivity issues.
          logEvent('group_session.channel_status', {
            sessionId,
            status,
            connectionState,
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
      setConnectionState('disconnected');
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      setConnectionState('disconnected');
    };
    // Note: connectionState is intentionally not in deps to avoid re-subscribing on every state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    sessionId,
    setNumber,
    clientId,
    onRemoteDelta,
    onParticipantPiecesDelta,
    onRemoteSnapshot,
  ]);

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

  const broadcastOwnedSnapshot = useCallback(
    (ownedByKey: Record<string, number>) => {
      if (!enabled || !sessionId) return;
      if (!ownedByKey || typeof ownedByKey !== 'object') return;
      const channel = channelRef.current;
      if (!channel) return;

      const payload = {
        ownedByKey,
        setNumber,
        clientId,
      };

      channel
        .send({
          type: 'broadcast',
          event: 'owned_snapshot',
          payload,
        })
        .catch(err => {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[GroupSessionChannel] snapshot broadcast failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
    },
    [enabled, sessionId, setNumber, clientId]
  );

  return { broadcastPieceDelta, broadcastOwnedSnapshot, connectionState };
}
