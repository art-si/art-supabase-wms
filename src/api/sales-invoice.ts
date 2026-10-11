import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { normalizeNullableText } from '@/utils/form/normalize'

export interface WmsSalesInvoiceLine {
  id: string
  sourceLineId: string
  quantity: number
  amount: number
  taxAmount: number
  totalAmount: number
  source: {
    lineNo: number
    material: { materialCode: string; materialName: string; description: string | null }
    project: { projectName: string } | null
    constructionNo: string | null
    inventoryUnit: { unitName: string } | null
    unitPrice: number
    taxRate: number
    batchNo: string | null
    bin: { binName: string } | null
  }
}
export interface WmsSalesInvoice {
  id: string
  tenantId: string
  documentNo: string
  invoiceType: 'ordinary' | 'special'
  redLetter: boolean
  issueDate: string
  remark: string | null
  createdAt: string
  sourceDocumentId: string
  source: { documentNo: string; kind: 'outbound' | 'return' }
  customer: { customerName: string }
  lines: WmsSalesInvoiceLine[]
}
const { supabase, responseHandle } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '销售发票草稿加载失败，请重试'
}
const select = `*,customer:mdm_customer!wms_sales_invoice_customer_id_fkey(customer_name),
source:wms_sales_document!wms_sales_invoice_source_document_id_fkey(document_no,kind),
lines:wms_sales_invoice_line(*,source:wms_sales_document_line!wms_sales_invoice_line_source_line_id_fkey(
line_no,construction_no,unit_price,tax_rate,batch_no,material:mdm_material!wms_sales_document_line_material_id_fkey(material_code,material_name,description),
project:mdm_project!wms_sales_document_line_project_id_fkey(project_name),inventory_unit:mdm_unit_of_measure!wms_sales_document_line_inventory_unit_id_fkey(unit_name),bin:mdm_warehouse_bin!wms_sales_document_line_bin_id_fkey(bin_name)))`
export async function fetchWmsSalesInvoices(query: {
  current: number
  size: number
  keyword?: string
  tenantId?: string
}): Promise<{ data: WmsSalesInvoice[]; total: number }> {
  const range = buildSupabasePageRange(query)
  let request = supabase
    .from('wms_sales_invoice')
    .select(select, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.keyword?.trim()) request = request.ilike('document_no', `%${query.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsSalesInvoice[]>(
    () => request.range(range.from, range.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}
export async function fetchWmsSalesInvoice(id: string): Promise<WmsSalesInvoice> {
  const { data } = await responseHandle<WmsSalesInvoice>(
    () => supabase.from('wms_sales_invoice').select(select).eq('id', id).single(),
    readOptions
  )
  if (!data) throw new Error('发票草稿不存在或无权查看')
  return data
}
export async function pushWmsSalesInvoices(
  invoiceType: 'ordinary' | 'special',
  selections: Array<{ documentId: string; lineIds: string[] | null }>
): Promise<string[]> {
  const { data } = await responseHandle<string[]>(
    () =>
      supabase.rpc('wms_push_sales_invoice_secure', {
        p_invoice_type: invoiceType,
        p_selections: selections.map((item) => ({
          document_id: item.documentId,
          line_ids: item.lineIds
        }))
      }),
    { ...readOptions, errorMessage: '下推销售发票失败，请重新选择明细' }
  )
  if (!data?.length) throw new Error('未生成销售发票草稿，请重试')
  return data
}
export async function editWmsSalesInvoice(
  id: string,
  issueDate: string,
  remark: string
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_edit_sales_invoice_secure', {
        p_id: id,
        p_issue_date: issueDate,
        p_remark: normalizeNullableText(remark)
      }),
    { ...readOptions, errorMessage: '发票草稿保存失败，请重试' }
  )
}
