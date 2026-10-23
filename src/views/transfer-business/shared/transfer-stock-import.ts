import { normalizeNullableNumber } from '@/utils/form/normalize'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { memoize } from 'lodash-es'

export interface TransferStockImportRow {
  materialCode: string
  batchNo: string
  quantity: number
  fileRow: number
}

/** Validate the complete file before inventory reads begin. */
export function readTransferStockImportRows(rows: readonly unknown[]): TransferStockImportRow[] {
  return rows.map((raw, index) => {
    if (!isPlainObjectRecord(raw)) throw invalidTransferStockRow(index)
    const materialCode = String(raw['物料编码'] ?? raw.materialCode ?? '').trim()
    const batchNo = String(raw['批次号'] ?? raw.batchNo ?? '').trim()
    const quantity = normalizeNullableNumber(raw['数量'] ?? raw.quantity)
    if (!materialCode || !batchNo || quantity === null || quantity <= 0)
      throw invalidTransferStockRow(index)
    return { materialCode, batchNo, quantity, fileRow: index + 1 }
  })
}

/** Reuse an exact material and batch lookup within one import attempt. */
export function createTransferStockCandidateLoader<T>(
  load: (materialCode: string, batchNo: string) => Promise<readonly T[]>
): (materialCode: string, batchNo: string) => Promise<readonly T[]> {
  return memoize(load, (materialCode, batchNo) => JSON.stringify([materialCode, batchNo]))
}

function invalidTransferStockRow(index: number): Error {
  return new Error(`第 ${index + 1} 行须填写物料编码、批次号和正数数量`)
}
