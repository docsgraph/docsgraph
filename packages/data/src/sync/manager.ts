import type { LocalStore } from '../store';
import type { SyncClient } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncManagerOptions {
  store: LocalStore;
  client: SyncClient;
  /** Custom status change callback */
  onStatusChange?: (status: SyncStatus) => void;
  /** Optional periodic sync interval in milliseconds. If omitted, no auto-polling. */
  pollIntervalMs?: number;
}

/**
 * Orchestrator coordinating synchronization cycles between the local SQLite
 * data layer and the remote server sync client. Handles network state changes,
 * polling, and handles graceful degradation when offline.
 */
export class SyncManager {
  private store: LocalStore;
  private client: SyncClient;
  private onStatusChange?: (status: SyncStatus) => void;
  private pollIntervalMs?: number;

  private status: SyncStatus = 'idle';
  private syncPromise: Promise<void> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private destroyCallbacks: Array<() => void> = [];

  constructor(options: SyncManagerOptions) {
    this.store = options.store;
    this.client = options.client;
    this.onStatusChange = options.onStatusChange;
    this.pollIntervalMs = options.pollIntervalMs;

    this.setupNetworkListeners();
    this.startPolling();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private setStatus(newStatus: SyncStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      if (this.onStatusChange) {
        this.onStatusChange(newStatus);
      }
    }
  }

  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined' && window.addEventListener) {
      const handleOnline = () => {
        // Resume sync when reconnecting
        this.sync().catch(() => {});
      };
      const handleOffline = () => {
        this.setStatus('offline');
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      this.destroyCallbacks.push(() => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      });

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.status = 'offline';
      }
    }
  }

  private startPolling(): void {
    if (this.pollIntervalMs && this.pollIntervalMs > 0) {
      this.intervalId = setInterval(() => {
        this.sync().catch(() => {});
      }, this.pollIntervalMs);

      this.destroyCallbacks.push(() => {
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
      });
    }
  }

  /**
   * Run a sync cycle: Push local mutations, then Pull and apply remote mutations.
   * Resolves when the sync cycle is complete (either successfully or gracefully stopped/failed).
   */
  async sync(): Promise<void> {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = (async () => {
      // Check offline status
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.setStatus('offline');
        return;
      }

      this.setStatus('syncing');

      try {
        // 1. Push phase: push all unsynced ops
        const unsyncedOps = await this.store.getUnsyncedOps();
        if (unsyncedOps.length > 0) {
          const cursor = await this.store.getSyncCursor();
          const pushResult = await this.client.push(unsyncedOps, cursor);
          for (const ack of pushResult.acks) {
            await this.store.applyAck(ack.opId, ack.seq);
          }
          await this.store.setSyncCursor(pushResult.cursor);
        }

        // 2. Pull phase: pull remote changes since local cursor
        let hasMore = true;
        let currentCursor = await this.store.getSyncCursor();

        while (hasMore) {
          const pullResult = await this.client.pull(currentCursor);
          if (pullResult.ops.length > 0) {
            await this.store.applyRemoteOps(pullResult.ops);
          }
          currentCursor = pullResult.cursor;
          await this.store.setSyncCursor(currentCursor);
          hasMore = pullResult.hasMore;
        }

        this.setStatus('idle');
      } catch (error) {
        // Check if error is network related to degrade gracefully
        const isOffline =
          (typeof navigator !== 'undefined' && !navigator.onLine) ||
          this.isNetworkError(error);

        if (isOffline) {
          this.setStatus('offline');
        } else {
          this.setStatus('error');
        }
      }
    })();

    try {
      await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  private isNetworkError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network error') ||
      msg.includes('dns') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused')
    );
  }

  /**
   * Stop periodic polling and clean up all listeners.
   */
  destroy(): void {
    for (const cleanup of this.destroyCallbacks) {
      cleanup();
    }
    this.destroyCallbacks = [];
  }
}
