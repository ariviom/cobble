import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock BroadcastChannel
class MockBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

// Type for accessing private channel field in tests
interface TabCoordinatorInternals {
  channel: MockBroadcastChannel | null;
}

function getChannel(coordinator: object): MockBroadcastChannel {
  return (coordinator as TabCoordinatorInternals).channel!;
}

describe('TabCoordinator callbacks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onSyncRequested callback when leader receives sync_request', async () => {
    const mod = await import('../tabCoordinator');
    const coordinator = mod.getTabCoordinator()!;
    const callback = vi.fn();
    coordinator.onSyncRequested(callback);

    // Make this tab the leader by advancing past the claim timeout
    await vi.advanceTimersByTimeAsync(800);

    // Simulate receiving a sync_request from another tab
    const channel = getChannel(coordinator);
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'other_tab' },
    } as MessageEvent);

    // Debounce: callback should not fire immediately
    expect(callback).not.toHaveBeenCalled();

    // After debounce window (500ms)
    await vi.advanceTimersByTimeAsync(500);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('fires onPullRequested callback when pull_request received', async () => {
    const mod = await import('../tabCoordinator');
    const coordinator = mod.getTabCoordinator()!;
    const callback = vi.fn();
    coordinator.onPullRequested(callback);

    const channel = getChannel(coordinator);
    channel.onmessage?.({
      data: { type: 'pull_request', tabId: 'leader_tab' },
    } as MessageEvent);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('debounces multiple sync_requests within 500ms', async () => {
    const mod = await import('../tabCoordinator');
    const coordinator = mod.getTabCoordinator()!;
    const callback = vi.fn();
    coordinator.onSyncRequested(callback);

    await vi.advanceTimersByTimeAsync(800); // become leader

    const channel = getChannel(coordinator);

    // Fire 3 sync requests rapidly
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'tab_a' },
    } as MessageEvent);
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'tab_b' },
    } as MessageEvent);
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'tab_c' },
    } as MessageEvent);

    await vi.advanceTimersByTimeAsync(500);
    expect(callback).toHaveBeenCalledTimes(1); // coalesced into one
  });
});
