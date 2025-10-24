import { createLogger } from '@kasstamp/utils';

const emitterLogger = createLogger('kasstamp:rpc:events');

/**
 * Universal EventEmitter for both Node.js and browser
 *
 * Provides a simple event emitter pattern for RPC client events.
 */
export class UniversalEventEmitter {
  private events: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  /**
   * Register an event listener
   *
   * @param event - Event name to listen for
   * @param listener - Callback function to invoke when event is emitted
   * @returns This emitter instance for chaining
   */
  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
    return this;
  }

  /**
   * Emit an event to all registered listeners
   *
   * @param event - Event name to emit
   * @param args - Arguments to pass to event listeners
   * @returns True if the event had listeners, false otherwise
   */
  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this.events.get(event);
    if (!listeners) return false;

    listeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        emitterLogger.error(`Error in event listener for ${event}`, error as Error);
      }
    });
    return true;
  }

  /**
   * Remove a specific event listener
   *
   * @param event - Event name
   * @param listener - The listener function to remove
   * @returns This emitter instance for chaining
   */
  off(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Remove all listeners for an event or all events
   *
   * @param event - Optional event name. If not provided, removes all listeners
   * @returns This emitter instance for chaining
   */
  removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }
}
