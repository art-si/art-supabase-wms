import { isPlainObjectRecord } from '@/utils/type-guards'

/** Original packing composition; never represents a board-level inventory balance. */
export interface WmsPackCompositionItem {
  boardId: string
  area: string
  boardNo: string
  lengthMm: number
  pieces: number
}

export interface WmsPackComposition {
  packNo?: string | null
  packArea?: string | null
  packDetails?: WmsPackCompositionItem[] | null
}

/** Older, unlinked records may omit packing metadata. Validate new JSON at the API boundary. */
export function isWmsPackComposition(value: unknown): value is WmsPackComposition {
  if (!isPlainObjectRecord(value)) return false
  if (!['packNo', 'packArea'].every((key) => value[key] == null || typeof value[key] === 'string'))
    return false
  return (
    value.packDetails == null ||
    (Array.isArray(value.packDetails) &&
      value.packDetails.every(
        (item: unknown) =>
          isPlainObjectRecord(item) &&
          typeof item.boardId === 'string' &&
          typeof item.area === 'string' &&
          typeof item.boardNo === 'string' &&
          typeof item.lengthMm === 'number' &&
          Number.isFinite(item.lengthMm) &&
          typeof item.pieces === 'number' &&
          Number.isFinite(item.pieces)
      ))
  )
}
