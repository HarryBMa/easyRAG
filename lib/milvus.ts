import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node'

const COLLECTION = 'protocol_chunks'
const DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10)

let client: MilvusClient | null = null

export function getMilvusClient(): MilvusClient {
  if (!client) {
    client = new MilvusClient({
      address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
      token: process.env.MILVUS_TOKEN,
    })
  }
  return client
}

export async function ensureCollection(): Promise<void> {
  const c = getMilvusClient()
  const { value: exists } = await c.hasCollection({ collection_name: COLLECTION })
  if (exists) return

  await c.createCollection({
    collection_name: COLLECTION,
    fields: [
      { name: 'id', data_type: DataType.VarChar, max_length: 80, is_primary_key: true, auto_id: false },
      { name: 'guideline_id', data_type: DataType.VarChar, max_length: 64 },
      { name: 'entity_type', data_type: DataType.VarChar, max_length: 16 }, // 'guideline' | 'trick'
      { name: 'content', data_type: DataType.VarChar, max_length: 4096 },
      { name: 'chunk_index', data_type: DataType.Int32 },
      { name: 'embedding', data_type: DataType.FloatVector, dim: DIM },
    ],
    enable_dynamic_field: false,
  })

  await c.createIndex({
    collection_name: COLLECTION,
    field_name: 'embedding',
    index_type: 'HNSW',
    metric_type: 'COSINE',
    params: { M: 16, efConstruction: 64 },
  })

  await c.loadCollection({ collection_name: COLLECTION })
}

export interface ChunkEntity {
  id: string
  guideline_id: string
  entity_type: string
  content: string
  chunk_index: number
  embedding: number[]
}

export async function upsertChunks(entities: ChunkEntity[]): Promise<void> {
  if (!entities.length) return
  const c = getMilvusClient()
  await c.insert({ collection_name: COLLECTION, data: entities })
}

export async function searchSimilar(
  embedding: number[],
  limit = 6,
  filter?: string,
): Promise<{ guideline_id: string; content: string; score: number }[]> {
  const c = getMilvusClient()
  const params: Record<string, unknown> = {
    collection_name: COLLECTION,
    data: [embedding],
    anns_field: 'embedding',
    limit,
    output_fields: ['guideline_id', 'content'],
    metric_type: 'COSINE',
  }
  if (filter) params.filter = filter

  const results = await c.search(params)
  return (results.results ?? []).map((h) => ({
    guideline_id: h.guideline_id as string,
    content: h.content as string,
    score: h.score as number,
  }))
}

export async function deleteByGuideline(guidelineId: string): Promise<void> {
  const c = getMilvusClient()
  await c.delete({
    collection_name: COLLECTION,
    filter: `guideline_id == "${guidelineId}"`,
  })
}
