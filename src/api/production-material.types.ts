import type { WmsMaterialOption, WmsStockBatch } from './warehouse.types'

export type WmsProductionMaterialKind = 'issue' | 'return' | 'finished_inbound' | 'finished_return'
export type WmsProductionDocumentStatus = 'draft' | 'submitted' | 'approved'
export type WmsProductionMaterialStatus = 'pending' | 'partial' | 'fulfilled' | 'void' | 'closed'

export interface WmsProductionMaterialLine {
  id?: string
  lineNo: number
  materialId: string
  material?: WmsMaterialOption | null
  workOrderId: string | null
  projectId: string | null
  constructionNo: string | null
  inventoryUnitId: string
  productionUnitId: string | null
  workOrderQuantity: number | null
  requestedQuantity: number
  actualQuantity: number
  baseUnitId: string | null
  baseQuantity: number | null
  batchNo: string | null
  warehouseId: string
  binId: string | null
  sourceBatchId: string | null
  packId: string | null
  sourceLineId: string | null
  returnType: 'good' | 'incoming_defect' | 'operation_defect' | null
  stockType: string
  ownerType: 'self' | 'supplier' | 'customer'
  ownerId: string | null
  stockStatus: 'available' | 'scrapped' | 'defective' | 'frozen'
  keeperId: string | null
  auxiliaryUnitId: string | null
  auxiliaryQuantity: number | null
  auxiliaryUnit2Id: string | null
  auxiliaryQuantity2: number | null
  productionDate: string | null
  expiryDate: string | null
  trackingNo: string | null
  fulfilledQuantity: number
  sourceDocument: string | null
  sourceLineNo: string | null
  remark: string | null
  serialIds: string[]
  serialNos: string[]
  movementId: string | null
  availableInventoryQuantity?: number
}

export interface WmsProductionMaterialDocument {
  id: string
  tenantId: string
  kind: WmsProductionMaterialKind
  documentNo: string
  documentTypeId: string
  businessTypeId: string
  organizationId: string
  businessDate: string
  warehouseId: string
  workOrderId: string | null
  projectId: string | null
  customerId: string | null
  demandDate: string | null
  applicantId: string | null
  departmentId: string | null
  keeperId: string | null
  status: WmsProductionDocumentStatus
  materialStatus: WmsProductionMaterialStatus
  remark: string | null
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  lines: WmsProductionMaterialLine[]
}

export type WmsProductionMaterialInput = Pick<
  WmsProductionMaterialDocument,
  | 'tenantId'
  | 'kind'
  | 'documentTypeId'
  | 'businessTypeId'
  | 'organizationId'
  | 'businessDate'
  | 'warehouseId'
  | 'workOrderId'
  | 'projectId'
  | 'demandDate'
  | 'applicantId'
  | 'departmentId'
  | 'keeperId'
  | 'remark'
> & {
  id?: string
  saveAction?: 'add' | 'copy' | 'edit'
  lines: Array<
    Omit<
      WmsProductionMaterialLine,
      | 'id'
      | 'lineNo'
      | 'material'
      | 'fulfilledQuantity'
      | 'movementId'
      | 'availableInventoryQuantity'
    >
  >
}

export interface WmsProductionMaterialListRow {
  documentId: string
  tenantId: string
  kind: WmsProductionMaterialKind
  documentNo: string
  documentTypeId: string
  businessTypeId: string
  organizationId: string
  businessDate: string
  warehouseId: string
  workOrderId: string | null
  projectId: string | null
  customerId: string | null
  demandDate: string | null
  applicantId: string | null
  departmentId: string | null
  keeperId: string | null
  status: WmsProductionDocumentStatus
  materialStatus: WmsProductionMaterialStatus
  documentRemark: string | null
  createdAt: string
  lineId: string
  lineNo: number
  materialId: string
  materialCode: string
  materialName: string
  materialDescription: string | null
  specificationModel: string | null
  requestedQuantity: number
  actualQuantity: number
  fulfilledQuantity: number
  workOrderQuantity: number | null
  productionUnitId: string | null
  productionUnitName: string | null
  packId: string | null
  sourceLineId: string | null
  returnType: string | null
  stockType: string
  stockStatus: string
  warehouseName: string
  workOrderNo: string | null
  projectName: string | null
  customerName: string | null
  applicantName: string | null
  departmentName: string | null
  keeperName: string | null
  documentTypeName: string
  businessTypeName: string
  inventoryUnitName: string
  binName: string | null
  batchNo: string | null
  availableInventoryQuantity: number
}

export interface WmsReturnableIssueLine extends WmsProductionMaterialListRow {
  returnableQuantity: number
}

export interface WmsProductionProjectOption {
  id: string
  tenantId: string
  projectCode: string
  projectName: string
  customerId: string | null
  customer?: { customerName: string } | null
}

export interface WmsProductionDocumentTypeOption {
  id: string
  tenantId: string
  documentTypeCode: string
  documentTypeName: string
  isDefault: boolean
}

export interface WmsProductionBusinessTypeOption {
  id: string
  tenantId: string
  documentTypeId: string
  businessTypeCode: string
  businessTypeName: string
  isDefault: boolean
}

export interface WmsProductionBomItem {
  key: string
  material: WmsMaterialOption
  requiredQuantity: number
  selectedQuantity: number
  issuedQuantity: number
  goodReturnQuantity: number
  incomingDefectReturnQuantity: number
  remainingQuantity: number
  unitName: string | null
  basicQuantity: number | null
  positionNo: string | null
  operationName: string | null
  sequenceNo: string
  workOrderNo: string
  sourceLineNo: string
}

export interface WmsWorkOrderBomIssueTotal {
  sourceLineNo: string
  selectedQuantity: number
  issuedQuantity: number
  goodReturnQuantity: number
  incomingDefectReturnQuantity: number
}

export type WmsProductionStockOption = WmsStockBatch & {
  batchLabel: string
  allocatedQuantity: number
  availableQuantity: number
  materialDescription: string
  materialCode: string
  specificationModel: string | null
  inventoryUnitName: string
  amount: number
  warehouseName: string
  binName: string
  projectName: string
  material?: (WmsStockBatch['material'] & { description?: string | null }) | null
}

export interface WmsFinishedInboundSourceOption {
  id: string
  tenantId: string
  documentId: string
  documentNo: string
  lineNo: number
  workOrderId: string
  workOrderNo: string
  materialId: string
  materialCode: string
  materialName: string
  materialDescription: string | null
  specificationModel: string | null
  inventoryUnitId: string
  productionUnitId: string | null
  workOrderQuantity: number | null
  warehouseId: string
  binId: string | null
  sourceBatchId: string
  batchNo: string
  projectId: string | null
  constructionNo: string | null
  stockType: string
  ownerType: 'self' | 'supplier' | 'customer'
  ownerId: string | null
  stockStatus: 'available' | 'scrapped' | 'defective' | 'frozen'
  availableQuantity: number
  inboundQuantity: number
}
