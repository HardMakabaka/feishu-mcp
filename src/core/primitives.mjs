import { createHash } from 'node:crypto';
export function hash(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
}
export function clone(value) { return structuredClone(value); }
export class SerialQueue {
  #tail = Promise.resolve();
  run(action) {
    const task = this.#tail.then(action);
    this.#tail = task.catch(() => {});
    return task;
  }
  drain() { return this.#tail; }
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
