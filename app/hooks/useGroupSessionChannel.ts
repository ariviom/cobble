'use client';

import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { logger, logEvent } from '@/lib/metrics';
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
  /**
   * Called when a remote client requests the current owned snapshot.
   * Typically only the host responds to this.
   */
  onSnapshotRequested?: () => void;
  /**
   * Called when reconnecting (or on first connect for joiners) so the
   * client can request a fresh snapshot from the host.
   */
  onReconnected?: () => void;
  /**
   * Ref tracking current participant's pieces_found for heartbeat persistence.
   */
  piecesFoundRef?: React.RefObject<number>;
  /**
   * Called when the host broadcasts that the session has ended.
   */
  onSessionEnded?: () => void;
  /**
   * Called when a remote participant broadcasts that they joined.
   */
  onParticipantJoined?: (participant: {
    id: string;
    displayName: string;
    colorSlot?: number | null;
  }) => void;
  /**
   * Called when a remote participant broadcasts that they left (tab close).
   */
  onParticipantLeft?: (participantId: string) => void;
};

type UseGroupSessionChannelResult = {
  broadcastPieceDelta: (args: {
    key: string;
    delta: number;
    newOwned: number;
  }) => void;
  broadcastOwnedSnapshot: (ownedByKey: Record<string, number>) => void;
  requestSnapshot: () => void;
  broadcastSessionEnded: () => void;
  broadcastParticipantRemoved: (participantId: string) => void;
  broadcastParticipantJoined: (participant: {
    id: string;
    displayName: string;
    colorSlot?: number | null;
  }) => void;
  broadcastParticipantLeft: () => void;
  connectionState: 'disconnected' | 'connecting' | 'connected';
  hasConnectedOnce: boolean;
  sessionEnded: boolean;
};

/** Debounce window for piece_delta broadcasts (ms). Batches rapid changes to same piece. */
const PIECE_DELTA_DEBOUNCE_MS = 200;

export function useGroupSessionChannel({
  enabled,
  sessionId,
  setNumber,
  participantId,
  clientId,
  onRemoteDelta,
  onRemoteSnapshot,
  onParticipantPiecesDelta,
  onSnapshotRequested,
  onReconnected,
  piecesFoundRef,
  onSessionEnded,
  onParticipantJoined,
  onParticipantLeft,
}: UseGroupSessionChannelArgs): UseGroupSessionChannelResult {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connectionState, setConnectionState] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  // Track if we've ever connected successfully - only show reconnecting banner after first connection
  const hasConnectedOnceRef = useRef(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const disconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce state for piece_delta broadcasts - accumulates rapid changes per key
  const pendingDeltasRef = useRef<
    Map<string, { accumulatedDelta: number; newOwned: number }>
  >(new Map());
  const deltaTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stable refs for callbacks — prevents channel teardown/resubscribe on every render
  const onRemoteDeltaRef = useRef(onRemoteDelta);
  onRemoteDeltaRef.current = onRemoteDelta;
  const onRemoteSnapshotRef = useRef(onRemoteSnapshot);
  onRemoteSnapshotRef.current = onRemoteSnapshot;
  const onParticipantPiecesDeltaRef = useRef(onParticipantPiecesDelta);
  onParticipantPiecesDeltaRef.current = onParticipantPiecesDelta;
  const onSnapshotRequestedRef = useRef(onSnapshotRequested);
  onSnapshotRequestedRef.current = onSnapshotRequested;
  const onReconnectedRef = useRef(onReconnected);
  onReconnectedRef.current = onReconnected;
  const piecesFoundRefRef = useRef(piecesFoundRef);
  piecesFoundRefRef.current = piecesFoundRef;
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const onParticipantJoinedRef = useRef(onParticipantJoined);
  onParticipantJoinedRef.current = onParticipantJoined;
  const onParticipantLeftRef = useRef(onParticipantLeft);
  onParticipantLeftRef.current = onParticipantLeft;

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

      onRemoteDeltaRef.current(data);

      onParticipantPiecesDeltaRef.current?.(
        data.participantId ?? null,
        data.delta
      );
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
      onRemoteSnapshotRef.current?.(data.ownedByKey);
    });

    channel.on('broadcast', { event: 'request_snapshot' }, ({ payload }) => {
      const data = payload as {
        setNumber: string;
        clientId: string;
      } | null;
      if (!data) return;
      if (data.setNumber !== setNumber) return;
      // Ignore our own requests
      if (data.clientId === clientId) return;
      onSnapshotRequestedRef.current?.();
    });

    // Listen for session_ended broadcast from host
    channel.on('broadcast', { event: 'session_ended' }, () => {
      setSessionEnded(true);
      onSessionEndedRef.current?.();
    });

    // Listen for participant_removed broadcast from host
    channel.on('broadcast', { event: 'participant_removed' }, ({ payload }) => {
      const data = payload as { participantId?: string } | null;
      if (!data?.participantId) return;
      // If we are the removed participant, treat it like session ended
      if (data.participantId === participantId) {
        setSessionEnded(true);
        onSessionEndedRef.current?.();
      }
    });

    // Listen for participant_joined broadcast (fast path, sidesteps postgres_changes)
    channel.on('broadcast', { event: 'participant_joined' }, ({ payload }) => {
      const data = payload as {
        id?: string;
        displayName?: string;
        colorSlot?: number | null;
        clientId?: string;
      } | null;
      if (!data?.id || !data?.displayName) return;
      // Ignore our own join broadcast
      if (data.clientId === clientId) return;
      onParticipantJoinedRef.current?.({
        id: data.id,
        displayName: data.displayName,
        colorSlot: data.colorSlot ?? null,
      });
    });

    // Listen for participant_left broadcast (fast departure visibility)
    channel.on('broadcast', { event: 'participant_left' }, ({ payload }) => {
      const data = payload as {
        participantId?: string;
        clientId?: string;
      } | null;
      if (!data?.participantId) return;
      // Ignore our own leave broadcast
      if (data.clientId === clientId) return;
      onParticipantLeftRef.current?.(data.participantId);
    });

    try {
      channel.subscribe(status => {
        // Update connection state based on Realtime status
        if (status === 'SUBSCRIBED') {
          // Clear any pending disconnect timeout
          if (disconnectTimeoutRef.current) {
            clearTimeout(disconnectTimeoutRef.current);
            disconnectTimeoutRef.current = null;
          }
          setConnectionState('connected');
          // Mark that we've connected at least once (for UI purposes)
          if (!hasConnectedOnceRef.current) {
            hasConnectedOnceRef.current = true;
            setHasConnectedOnce(true);
          }

          // Start heartbeat to keep last_seen_at + pieces_found fresh.
          // Fire immediately on (re)connect so the host's last_seen_at is
          // updated right away (important after a page refresh — without this
          // the stale value could persist for up to 60 s).
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          if (participantId) {
            const sendHeartbeat = () => {
              const sb = getSupabaseBrowserClient();
              void sb
                .from('group_session_participants')
                .update({
                  last_seen_at: new Date().toISOString(),
                  pieces_found: piecesFoundRefRef.current?.current ?? 0,
                })
                .eq('id', participantId);
            };
            sendHeartbeat();
            heartbeatIntervalRef.current = setInterval(sendHeartbeat, 60_000);
          }

          // Notify caller of (re)connection so they can request/send snapshots
          onReconnectedRef.current?.();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          // Debounce disconnected state to avoid flickering
          // Only show disconnected after 2 seconds of being disconnected
          if (disconnectTimeoutRef.current) {
            clearTimeout(disconnectTimeoutRef.current);
          }
          disconnectTimeoutRef.current = setTimeout(() => {
            setConnectionState('disconnected');
            disconnectTimeoutRef.current = null;
          }, 2000);

          if (process.env.NODE_ENV !== 'production') {
            logEvent('group_session.channel_disconnected', { sessionId });
          }
        } else {
          // Handle other states like SUBSCRIBING, TIMED_OUT
          // Only set to connecting if we're not already connected to avoid flickering
          setConnectionState(prev =>
            prev === 'connected' ? 'connected' : 'connecting'
          );
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
      logger.warn('[GroupSessionChannel] subscribe failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      setConnectionState('disconnected');
    }

    // Flush all pending debounced deltas immediately (used on tab hide and cleanup)
    const flushPendingDeltas = () => {
      for (const [key, pendingData] of pendingDeltasRef.current.entries()) {
        // Clear the associated timer
        const timer = deltaTimersRef.current.get(key);
        if (timer) clearTimeout(timer);
        deltaTimersRef.current.delete(key);

        if (pendingData.accumulatedDelta === 0) continue;

        const flushPayload: PieceDeltaPayload = {
          key,
          delta: pendingData.accumulatedDelta,
          newOwned: pendingData.newOwned,
          participantId,
          clientId,
          setNumber,
        };

        channel
          .send({
            type: 'broadcast',
            event: 'piece_delta',
            payload: flushPayload,
          })
          .catch(() => {
            // Best-effort flush
          });
      }
      pendingDeltasRef.current.clear();
    };

    // Flush pending deltas when tab becomes hidden so remote clients stay in sync
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingDeltas();
      }
      // On visible: Supabase Realtime auto-reconnects, which triggers
      // SUBSCRIBED → onReconnected → snapshot handshake
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Capture refs for cleanup
    const deltaTimers = deltaTimersRef.current;
    const pendingDeltas = pendingDeltasRef.current;

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = null;
      }
      // Clear all pending delta timers
      for (const timer of deltaTimers.values()) {
        clearTimeout(timer);
      }
      deltaTimers.clear();
      pendingDeltas.clear();

      if (channelRef.current) {
        // Broadcast departure before unsubscribing so peers learn immediately
        if (participantId) {
          channelRef.current
            .send({
              type: 'broadcast',
              event: 'participant_left',
              payload: { participantId, clientId },
            })
            .catch(() => {
              // Best-effort — channel may already be closing
            });
        }
        void channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      // Reset connection state and tracking when cleaning up
      hasConnectedOnceRef.current = false;
      setHasConnectedOnce(false);
      setConnectionState('disconnected');
    };
    // Callbacks accessed via refs — only channel identity triggers resubscription
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId, setNumber, clientId, participantId]);

  const broadcastPieceDelta = useCallback(
    (args: { key: string; delta: number; newOwned: number }) => {
      if (!enabled || !sessionId) return;
      if (!args.key) return;

      const channel = channelRef.current;
      if (!channel) return;

      // Update local participant stats immediately for responsive UI
      if (onParticipantPiecesDelta) {
        onParticipantPiecesDelta(participantId ?? null, args.delta);
      }

      // Accumulate delta for this key (batches rapid changes)
      const pending = pendingDeltasRef.current.get(args.key);
      if (pending) {
        pending.accumulatedDelta += args.delta;
        pending.newOwned = args.newOwned; // Always use latest value
      } else {
        pendingDeltasRef.current.set(args.key, {
          accumulatedDelta: args.delta,
          newOwned: args.newOwned,
        });
      }

      // Clear existing timer for this key if any
      const existingTimer = deltaTimersRef.current.get(args.key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new debounce timer
      const timer = setTimeout(() => {
        const pendingData = pendingDeltasRef.current.get(args.key);
        if (!pendingData) return;

        // Clean up tracking state
        pendingDeltasRef.current.delete(args.key);
        deltaTimersRef.current.delete(args.key);

        // Skip if delta accumulated to zero (e.g., +1 then -1)
        if (pendingData.accumulatedDelta === 0) return;

        const payload: PieceDeltaPayload = {
          key: args.key,
          delta: pendingData.accumulatedDelta,
          newOwned: pendingData.newOwned,
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
            logger.warn('[GroupSessionChannel] broadcast failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }, PIECE_DELTA_DEBOUNCE_MS);

      deltaTimersRef.current.set(args.key, timer);
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
          logger.warn('[GroupSessionChannel] snapshot broadcast failed', {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [enabled, sessionId, setNumber, clientId]
  );

  const requestSnapshot = useCallback(() => {
    if (!enabled || !sessionId) return;
    const channel = channelRef.current;
    if (!channel) return;

    channel
      .send({
        type: 'broadcast',
        event: 'request_snapshot',
        payload: { setNumber, clientId },
      })
      .catch(err => {
        logger.warn('[GroupSessionChannel] request_snapshot failed', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }, [enabled, sessionId, setNumber, clientId]);

  const broadcastSessionEnded = useCallback(() => {
    if (!enabled || !sessionId) return;
    const channel = channelRef.current;
    if (!channel) return;

    channel
      .send({
        type: 'broadcast',
        event: 'session_ended',
        payload: {},
      })
      .catch(() => {
        // Best-effort
      });
  }, [enabled, sessionId]);

  const broadcastParticipantRemoved = useCallback(
    (removedParticipantId: string) => {
      if (!enabled || !sessionId) return;
      const channel = channelRef.current;
      if (!channel) return;

      channel
        .send({
          type: 'broadcast',
          event: 'participant_removed',
          payload: { participantId: removedParticipantId },
        })
        .catch(() => {
          // Best-effort
        });
    },
    [enabled, sessionId]
  );

  const broadcastParticipantJoined = useCallback(
    (participant: {
      id: string;
      displayName: string;
      colorSlot?: number | null;
    }) => {
      if (!enabled || !sessionId) return;
      const channel = channelRef.current;
      if (!channel) return;

      channel
        .send({
          type: 'broadcast',
          event: 'participant_joined',
          payload: {
            id: participant.id,
            displayName: participant.displayName,
            colorSlot: participant.colorSlot ?? null,
            clientId,
          },
        })
        .catch(() => {
          // Best-effort
        });
    },
    [enabled, sessionId, clientId]
  );

  const broadcastParticipantLeft = useCallback(() => {
    if (!enabled || !sessionId || !participantId) return;
    const channel = channelRef.current;
    if (!channel) return;

    channel
      .send({
        type: 'broadcast',
        event: 'participant_left',
        payload: { participantId, clientId },
      })
      .catch(() => {
        // Best-effort
      });
  }, [enabled, sessionId, participantId, clientId]);

  return {
    broadcastPieceDelta,
    broadcastOwnedSnapshot,
    requestSnapshot,
    broadcastSessionEnded,
    broadcastParticipantRemoved,
    broadcastParticipantJoined,
    broadcastParticipantLeft,
    connectionState,
    hasConnectedOnce,
    sessionEnded,
  };
}
