import type { WmsInitialMaterial, WmsInitializationOption } from './initialization.types'

export type WmsInitialSalesKind =
  'initial_outbound' | 'initial_return' | 'outbound' | 'return' | 'other_outbound' | 'other_return'
export type WmsInitialSalesStatus = 'draft' | 'submitted' | 'approved'

export interface WmsInitialSalesLine {
  id?: string
  lineNo: number
  returnType: 'return' | 'replace' | 'refund_only' | null
  materialId: string
  material?: WmsInitialMaterial | null
  projectId: string | null
  project?: WmsInitializationOption | null
  constructionNo: string | null
  gift: boolean
  inventoryUnitId: string
  quantity: number
  baseUnitId: string | null
  baseQuantity: number
  unitPrice: number
  taxInclusiveUnitPrice: number
  priceBasis?: 'untaxed' | 'taxed'
  taxRate: number
  discountMethod: 'none' | 'rate' | 'amount'
  unitDiscountRate: number
  discountAmount: number
  amount: number
  taxAmount: number
  totalAmount: number
  batchNo: string | null
  warehouseId: string | null
  binId: string | null
  bin?: { binName: string; binCode: string } | null
  stockType: string
  ownerType: 'self' | 'supplier' | 'customer'
  ownerId: string | null
  stockStatus: string
  keeperId: string | null
  auxiliaryUnitId: string | null
  auxiliaryQuantity: number | null
  auxiliaryUnit2Id: string | null
  auxiliaryQuantity2: number | null
  productionDate: string | null
  expiryDate: string | null
  trackingNo: string | null
  sourceDocument: string | null
  sourceLineNo: string | null
  remark: string | null
  serialNos: string[]
}

export interface WmsInitialSalesDocument {
  id: string
  tenantId: string
  organizationId: string
  organization?: { organizationName: string; organizationCode: string } | null
  customer?: { customerName: string } | null
  salesperson?: { employeeName: string } | null
  keeper?: { employeeName: string } | null
  kind: WmsInitialSalesKind
  documentNo: string
  documentTypeId: string
  businessTypeId: string
  businessDate: string
  accountingDate: string
  customerId: string
  salespersonId: string | null
  salesDepartmentId: string | null
  keeperId: string | null
  status: WmsInitialSalesStatus
  isInitialization: boolean
  remark: string | null
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  lines: WmsInitialSalesLine[]
}

export interface WmsInitialSalesListRow {
  documentId: string
  tenantId: string
  organizationId: string
  kind: WmsInitialSalesKind
  documentNo: string
  businessDate: string
  accountingDate: string
  customerId: string
  customerCode: string
  customerName: string
  status: WmsInitialSalesStatus
  lineId: string
  lineNo: number
  returnType: string | null
  materialId: string
  materialCode: string
  materialName: string
  materialDescription: string
  specificationModel: string | null
  projectId: string | null
  projectName: string | null
  inventoryUnitName: string | null
  quantity: number
  batchNo: string | null
  warehouseName: string | null
  binName: string | null
  stockType: string
  stockStatus: string
  unitPrice: number
  taxInclusiveUnitPrice: number
  taxRate: number
  discountAmount: number
  amount: number
  taxAmount: number
  totalAmount: number
  gift: boolean
  documentRemark: string | null
}

export interface WmsInitialSalesPayload extends Omit<
  WmsInitialSalesDocument,
  'id' | 'documentNo' | 'accountingDate' | 'status' | 'createdAt' | 'updatedAt' | 'approvedAt'
> {
  id?: string
}
