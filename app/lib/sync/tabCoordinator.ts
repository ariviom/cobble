'use client';

/**
 * TabCoordinator - Cross-tab coordination for sync operations.
 *
 * Uses BroadcastChannel for leader election so only one tab performs
 * sync operations at a time. Prevents race conditions when multiple
 * tabs have the same set open and edit owned quantities.
 *
 * Features:
 * - Leader election via BroadcastChannel
 * - Heartbeat to detect dead leaders
 * - Graceful fallback when BroadcastChannel unavailable
 * - Sync request forwarding to leader
 */

const CHANNEL_NAME = 'brick_party_sync_coordinator';
const HEARTBEAT_INTERVAL_MS = 5000;
const LEADER_TIMEOUT_MS = 12000; // 2.4x heartbeat interval

type SyncMessage =
  | { type: 'heartbeat'; tabId: string; timestamp: number }
  | { type: 'claim_leader'; tabId: string; timestamp: number }
  | { type: 'leader_ack'; tabId: string }
  | { type: 'sync_request'; tabId: string }
  | { type: 'sync_complete'; tabId: string; success: boolean };

type LeaderChangeCallback = (isLeader: boolean) => void;

class TabCoordinator {
  private channel: BroadcastChannel | null = null;
  private readonly tabId: string;
  private isLeader = false;
  private leaderTabId: string | null = null;
  private lastLeaderHeartbeat = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private leaderCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onLeaderChangeCallbacks: Set<LeaderChangeCallback> = new Set();
  private isDestroyed = false;
  private isClaiming = false;
  private rivalClaimTabId: string | null = null;

  constructor() {
    // Generate unique tab ID
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Only initialize BroadcastChannel on client
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = this.handleMessage.bind(this);
        this.channel.onmessageerror = () => {
          // Ignore message errors - likely serialization issues
        };
        this.startHeartbeat();
        this.startLeaderCheck();
        this.claimLeadership();
      } catch {
        // BroadcastChannel creation failed - fallback to single-tab mode
        this.isLeader = true;
        this.leaderTabId = this.tabId;
      }
    } else {
      // No BroadcastChannel support - this tab is always the leader
      this.isLeader = true;
      this.leaderTabId = this.tabId;
    }
  }

  private handleMessage(event: MessageEvent<SyncMessage>) {
    if (this.isDestroyed) return;

    const msg = event.data;
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'heartbeat':
        if (msg.tabId === this.leaderTabId) {
          this.lastLeaderHeartbeat = msg.timestamp;
        }
        break;

      case 'claim_leader':
        // If we're the leader, respond with ack
        if (this.isLeader) {
          this.channel?.postMessage({
            type: 'leader_ack',
            tabId: this.tabId,
          } satisfies SyncMessage);
        }
        // If we're also claiming, track the rival for tiebreaking
        else if (this.isClaiming) {
          // Keep the strongest rival (lowest tabId wins)
          if (!this.rivalClaimTabId || msg.tabId < this.rivalClaimTabId) {
            this.rivalClaimTabId = msg.tabId;
          }
        }
        // If we know of an existing leader, tell the claimer
        else if (this.leaderTabId) {
          this.channel?.postMessage({
            type: 'leader_ack',
            tabId: this.leaderTabId,
          } satisfies SyncMessage);
        }
        break;

      case 'leader_ack':
        // Another tab is the leader
        if (!this.isLeader && msg.tabId !== this.tabId) {
          this.leaderTabId = msg.tabId;
          this.lastLeaderHeartbeat = Date.now();
        }
        break;

      case 'sync_request':
        // If we're the leader, trigger a sync
        if (this.isLeader) {
          // The DataProvider will handle this via shouldSync() returning true
          // We just acknowledge the request was received
        }
        break;

      case 'sync_complete':
        // Sync completed by leader - other tabs can update their UI
        break;
    }
  }

  private claimLeadership() {
    if (this.isDestroyed || !this.channel) return;

    this.isClaiming = true;
    this.rivalClaimTabId = null;

    this.channel.postMessage({
      type: 'claim_leader',
      tabId: this.tabId,
      timestamp: Date.now(),
    } satisfies SyncMessage);

    // Phase 1: Wait 500ms for an existing leader to ack
    setTimeout(() => {
      if (this.isDestroyed || !this.channel) {
        this.isClaiming = false;
        return;
      }

      // An existing leader responded — defer to it
      if (this.leaderTabId) {
        this.isClaiming = false;
        return;
      }

      // Phase 2: Broadcast a second claim to flush out simultaneous claimers
      this.channel.postMessage({
        type: 'claim_leader',
        tabId: this.tabId,
        timestamp: Date.now(),
      } satisfies SyncMessage);

      setTimeout(() => {
        this.isClaiming = false;
        if (this.isDestroyed) return;

        // An existing leader responded during phase 2
        if (this.leaderTabId) return;

        // Deterministic tiebreak: lowest tabId wins
        if (this.rivalClaimTabId && this.rivalClaimTabId < this.tabId) {
          // Rival wins — don't become leader; wait for their heartbeat
          this.rivalClaimTabId = null;
          return;
        }

        this.rivalClaimTabId = null;
        this.becomeLeader();
      }, 200);
    }, 500);
  }

  private becomeLeader() {
    if (this.isDestroyed) return;

    const wasLeader = this.isLeader;
    this.isLeader = true;
    this.leaderTabId = this.tabId;
    this.lastLeaderHeartbeat = Date.now();

    if (!wasLeader) {
      this.notifyLeaderChange(true);
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.isDestroyed) return;

      if (this.isLeader && this.channel) {
        this.channel.postMessage({
          type: 'heartbeat',
          tabId: this.tabId,
          timestamp: Date.now(),
        } satisfies SyncMessage);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private startLeaderCheck() {
    if (this.leaderCheckInterval) return;

    this.leaderCheckInterval = setInterval(() => {
      if (this.isDestroyed) return;

      // If we're not the leader, check if the leader is still alive
      if (!this.isLeader && this.leaderTabId) {
        const timeSinceHeartbeat = Date.now() - this.lastLeaderHeartbeat;
        if (timeSinceHeartbeat > LEADER_TIMEOUT_MS) {
          // Leader is dead, try to claim leadership
          this.leaderTabId = null;
          this.claimLeadership();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private notifyLeaderChange(isLeader: boolean) {
    for (const callback of this.onLeaderChangeCallbacks) {
      try {
        callback(isLeader);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Returns true if this tab should perform sync operations.
   * Only the leader tab should sync to prevent race conditions.
   */
  shouldSync(): boolean {
    // If BroadcastChannel unavailable, always allow sync
    if (!this.channel) return true;

    return this.isLeader;
  }

  /**
   * Request the leader to perform a sync.
   * If this tab is the leader, it will sync directly.
   * If not, it sends a request to the leader.
   */
  requestSync(): void {
    if (this.isDestroyed) return;

    if (!this.isLeader && this.channel) {
      this.channel.postMessage({
        type: 'sync_request',
        tabId: this.tabId,
      } satisfies SyncMessage);
    }
  }

  /**
   * Notify other tabs that a sync completed.
   */
  notifySyncComplete(success: boolean): void {
    if (this.isDestroyed || !this.channel) return;

    this.channel.postMessage({
      type: 'sync_complete',
      tabId: this.tabId,
      success,
    } satisfies SyncMessage);
  }

  /**
   * Register a callback for leader status changes.
   * Returns an unsubscribe function.
   */
  onLeaderChange(callback: LeaderChangeCallback): () => void {
    this.onLeaderChangeCallbacks.add(callback);

    // Immediately notify of current status
    callback(this.isLeader);

    return () => {
      this.onLeaderChangeCallbacks.delete(callback);
    };
  }

  /**
   * Get the current tab's ID.
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Check if this tab is currently the leader.
   */
  isCurrentLeader(): boolean {
    return this.isLeader;
  }

  /**
   * Clean up resources when the coordinator is no longer needed.
   */
  destroy(): void {
    this.isDestroyed = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.leaderCheckInterval) {
      clearInterval(this.leaderCheckInterval);
      this.leaderCheckInterval = null;
    }

    this.onLeaderChangeCallbacks.clear();

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

// Singleton instance - created once per tab
let coordinatorInstance: TabCoordinator | null = null;

/**
 * Get the TabCoordinator singleton instance.
 * Creates it on first access (client-side only).
 */
export function getTabCoordinator(): TabCoordinator | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!coordinatorInstance) {
    coordinatorInstance = new TabCoordinator();
  }

  return coordinatorInstance;
}

/**
 * Check if this tab should perform sync operations.
 * Returns true if:
 * - BroadcastChannel is not available (fallback mode)
 * - This tab is the leader
 */
export function shouldSync(): boolean {
  const coordinator = getTabCoordinator();
  return coordinator?.shouldSync() ?? true;
}

/**
 * Request a sync from the leader tab.
 */
export function requestSync(): void {
  getTabCoordinator()?.requestSync();
}

/**
 * Notify other tabs that a sync completed.
 */
export function notifySyncComplete(success: boolean): void {
  getTabCoordinator()?.notifySyncComplete(success);
}
