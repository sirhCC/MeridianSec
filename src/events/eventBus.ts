type Listener<T> = (event: T) => void | Promise<void>;

export class EventBus<EventMap extends { [event: string]: unknown }> {
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    (this.listeners[event] ||= []).push(listener);
  }

  async emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void> {
    const list = this.listeners[event];
    if (!list) return;
    for (const l of list) {
      await l(payload);
    }
  }
}
