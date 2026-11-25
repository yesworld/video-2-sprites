import type { FramePacket } from './types'

const storeName = 'frames'
const storageWindow = 2 * 24 * 60 * 60 * 1000
const memoryBudget = 256 * 1024 ** 2

function openStorage(): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve) => {
    if (!('indexedDB' in globalThis)) return resolve(null)
    const request = indexedDB.open('stripe-studio-extraction', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  }).catch(() => null)
}

function committed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Frame storage failed.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Frame storage failed.'))
  })
}

export class FrameAssets {
  private readonly group = [Date.now(), crypto.getRandomValues(new Uint32Array(2)).join('-')]
  private readonly database = openStorage()
  private readonly thumbnails: string[] = []
  private readonly memory = new Map<number, Blob>()
  private bytes = 0

  async add(batch: FramePacket[]) {
    const offset = this.thumbnails.length
    const db = await this.database
    if (db) {
      const transaction = db.transaction(storeName, 'readwrite')
      const complete = committed(transaction)
      const store = transaction.objectStore(storeName)
      if (offset === 0) store.delete(IDBKeyRange.upperBound([Date.now() - storageWindow]))
      for (const [index, frame] of batch.entries()) store.put(frame.image, [...this.group, offset + index])
      try {
        await complete
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          throw new Error('Local frame storage is full. Choose a shorter range or a lower extraction FPS.')
        }
        throw error
      }
    } else {
      this.bytes += batch.reduce((sum, frame) => sum + frame.image.size, 0)
      if (this.bytes > memoryBudget) {
        throw new Error('The in-memory frame limit was reached. Choose a shorter range or enable browser storage.')
      }
      for (const [index, frame] of batch.entries()) this.memory.set(offset + index, frame.image)
    }

    return batch.map((frame, index) => {
      const thumbnail = URL.createObjectURL(frame.thumbnail ?? frame.image)
      this.thumbnails.push(thumbnail)
      return { asset: offset + index, thumbnail, small: !frame.thumbnail, time: frame.time }
    })
  }

  async original(asset: number): Promise<Blob | undefined> {
    const db = await this.database
    if (!db) return this.memory.get(asset)
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get([...this.group, asset])
      request.onsuccess = () => resolve(request.result as Blob | undefined)
      request.onerror = () => reject(request.error)
    })
  }

  async clear() {
    for (const url of this.thumbnails) URL.revokeObjectURL(url)
    this.thumbnails.length = 0
    this.memory.clear()
    this.bytes = 0
    const db = await this.database
    if (db) {
      const transaction = db.transaction(storeName, 'readwrite')
      const complete = committed(transaction)
      transaction.objectStore(storeName).delete(IDBKeyRange.bound(this.group, [...this.group, Infinity]))
      await complete
    }
  }

  async dispose() {
    const db = await this.database
    try { await this.clear() } finally { db?.close() }
  }
}
