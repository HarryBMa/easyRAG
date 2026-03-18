/**
 * LEANN — in-memory HNSW index for fast approximate nearest-neighbor search.
 * Uses hnswlib-node for sub-millisecond candidate retrieval.
 * pgvector remains the source of truth; this index accelerates the hot query path.
 *
 * Lifecycle:
 *   - Populated lazily from pgvector on first search (loadFromDb)
 *   - Updated incrementally as new chunks are indexed (add)
 *   - Falls back to pgvector automatically if hnswlib is unavailable
 */

import { createRequire } from 'module'

const DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HierarchicalNSW: any = null
try {
  const require = createRequire(import.meta.url)
  HierarchicalNSW = require('hnswlib-node').HierarchicalNSW
} catch {
  // hnswlib-node not installed — all searches fall through to pgvector
}

export interface LeannResult {
  chunkId: string
  score: number // cosine similarity [0, 1]
}

class LeannIndex {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hnsw: any = null
  /** chunkId at each HNSW integer label */
  private labels: string[] = []
  private initialized = false
  private capacity: number

  constructor(capacity = 100_000) {
    this.capacity = capacity
  }

  private ensureInit() {
    if (this.initialized || !HierarchicalNSW) return
    this.hnsw = new HierarchicalNSW('cosine', DIM)
    this.hnsw.initIndex(this.capacity)
    this.initialized = true
  }

  /** Add a chunk embedding to the in-memory index. */
  add(chunkId: string, embedding: number[]) {
    this.ensureInit()
    if (!this.hnsw) return
    const label = this.labels.length
    this.labels.push(chunkId)
    this.hnsw.addPoint(embedding, label)
  }

  /** Search for k nearest neighbours. Returns [] if index is not ready. */
  search(embedding: number[], k: number): LeannResult[] {
    if (!this.hnsw || this.labels.length === 0) return []
    const n = Math.min(k, this.labels.length)
    const { distances, neighbors } = this.hnsw.searchKnn(embedding, n)
    return (neighbors as number[]).map((label, i) => ({
      chunkId: this.labels[label],
      score: 1 - (distances as number[])[i], // cosine dist → similarity
    }))
  }

  get ready(): boolean {
    return this.initialized && this.labels.length > 0
  }

  get size(): number {
    return this.labels.length
  }
}

/** Singleton index shared across the process lifetime. */
export const leannIndex = new LeannIndex()
