import type { WmsMaterialOption } from '@wms/api'
import { readWmsMaterialImportRows } from '@/utils/wms/document-import'
import { createImportReferenceLookup } from '@/utils/business/import-reference'

interface PreparedWmsMaterialImportRow {
  material: WmsMaterialOption
  quantity: number
  batchNo: string
  remark: string
}

/** Prepare the entire positive-quantity file before changing a WMS document draft. */
export async function prepareWmsMaterialImport(
  rows: Array<Record<string, unknown>>,
  resolve: (code: string) => Promise<{ data: WmsMaterialOption[] }>,
  isCurrent: () => boolean
): Promise<PreparedWmsMaterialImportRow[] | undefined> {
  if (!isCurrent()) return undefined
  const sourceRows = readWmsMaterialImportRows(rows)
  // A successful lookup retains only its selected record, within this import batch.
  const resolveMaterial = createImportReferenceLookup(async (code) => {
    const result = await resolve(code)
    return result.data.filter((item) => item.materialCode === code)
  })
  const imported: PreparedWmsMaterialImportRow[] = []
  try {
    for (const { row, code, fileRow, quantity } of sourceRows) {
      if (!isCurrent()) return undefined
      const material = await resolveMaterial(code, `第 ${fileRow} 行当前租户物料编码“${code}”`)
      if (!isCurrent()) return undefined
      imported.push({
        material,
        quantity,
        batchNo: String(row['批号'] ?? row.batchNo ?? '').trim(),
        remark: String(row['备注'] ?? row.remark ?? '').trim()
      })
    }
    return imported
  } catch (error) {
    if (!isCurrent()) return undefined
    throw error
  }
}
