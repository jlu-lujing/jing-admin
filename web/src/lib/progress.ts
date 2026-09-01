type Listener = (busy: boolean) => void;
const listeners = new Set<Listener>();
let busy = false;

export function setBusy(next: boolean) {
  if (busy === next) return;
  busy = next;
  listeners.forEach((l) => l(busy));
}

export function subscribeProgress(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function isBusy() {
  return busy;
}
