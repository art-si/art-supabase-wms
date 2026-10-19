import type { WmsCountLine } from '@wms/api'

type CountedLine = Pick<
  WmsCountLine,
  | 'expectedQuantity'
  | 'countedQuantity'
  | 'adjustmentQuantity'
  | 'recountQuantity'
  | 'expectedSerialIds'
  | 'countedSerialIds'
  | 'newSerialNos'
  | 'recountSerialIds'
  | 'recountNewSerialNos'
  | 'material'
>

export interface CountVariance {
  gain: number
  loss: number
}

export function countLineVariance(line: CountedLine, recountEnabled = false): CountVariance | null {
  const quantity = recountEnabled ? line.recountQuantity : line.countedQuantity
  if (quantity === null || quantity === undefined) return null

  if (line.material?.serialManagementEnabled || line.expectedSerialIds.length) {
    const countedIds = new Set(
      recountEnabled ? (line.recountSerialIds ?? []) : line.countedSerialIds
    )
    return {
      gain: recountEnabled ? (line.recountNewSerialNos?.length ?? 0) : line.newSerialNos.length,
      loss: line.expectedSerialIds.filter((id) => !countedIds.has(id)).length
    }
  }

  const difference = quantity - line.expectedQuantity - (line.adjustmentQuantity ?? 0)
  return { gain: Math.max(difference, 0), loss: Math.max(-difference, 0) }
}
