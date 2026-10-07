import type { WmsMaterialOption } from '@wms/api'

/** Prepare the entire file before changing a WMS document draft. */
export async function prepareWmsMaterialImport(
  rows: Array<Record<string, unknown>>,
  resolve: (code: string) => Promise<{ data: WmsMaterialOption[] }>,
  isCurrent: () => boolean
) {
  if (!rows.length || rows.length > 500)
    throw new Error('请选择包含 1 至 500 行明细的文件；必填列为物料编码、数量')
  const imported: Array<{
    material: WmsMaterialOption
    quantity: number
    batchNo: string
    remark: string
  }> = []
  for (const [index, row] of rows.entries()) {
    const code = String(row['物料编码'] ?? row.materialCode ?? '').trim()
    const quantity = Number(row['数量'] ?? row.quantity)
    if (!code || !Number.isFinite(quantity) || quantity <= 0)
      throw new Error(`第 ${index + 2} 行请填写物料编码和大于零的数量`)
    const result = await resolve(code)
    if (!isCurrent()) return undefined
    const matches = result.data.filter((item) => item.materialCode === code)
    if (matches.length !== 1)
      throw new Error(`第 ${index + 2} 行物料编码“${code}”未匹配到唯一物料，请检查当前租户物料`)
    imported.push({
      material: matches[0],
      quantity,
      batchNo: String(row['批号'] ?? row.batchNo ?? '').trim(),
      remark: String(row['备注'] ?? row.remark ?? '').trim()
    })
  }
  return imported
}
