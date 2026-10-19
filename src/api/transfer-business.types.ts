import type { WmsBusinessDocumentStatus, WmsTransferRequestLineInput } from './warehouse.types'

export type WmsTransferBusinessKind =
  'direct' | 'step' | 'direct_return' | 'step_return' | 'step_receipt'

export interface WmsTransferBusinessDocument {
  id: string
  tenantId: string
  kind: WmsTransferBusinessKind
  documentNo: string
  documentTypeId: string
  businessTypeId: string
  businessDate: string
  projectId: string | null
  sourceOrganizationId: string
  sourceDepartmentId: string | null
  sourceKeeperId: string | null
  targetOrganizationId: string
  targetDepartmentId: string | null
  targetKeeperId: string | null
  status: WmsBusinessDocumentStatus
  remark: string | null
  sourceRequestId: string | null
  returnOfDocumentId: string | null
  receiptOfDocumentId?: string | null
  submittedAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WmsTransferBusinessLine extends WmsTransferRequestLineInput {
  id: string
  tenantId: string
  documentId: string
  lineNo: number
  sourceBatchId: string | null
  quantity: number
  sourceRequestLineId: string | null
  returnOfLineId: string | null
  receiptOfLineId?: string | null
  movementId: string | null
  stepTransferId: string | null
  serialIds: string[]
  returnedQuantity: number
}

export interface WmsTransferBusinessRow extends WmsTransferBusinessDocument {
  documentId: string
  lineId: string
  line: WmsTransferBusinessLine
  materialCode: string
  materialName: string
  materialDescription: string
  specificationModel: string | null
  materialBaseUnitId: string | null
  materialInventoryUnitId: string | null
  materialAuxiliaryUnitId: string | null
  materialAuxiliaryUnit2Id: string | null
  unitConversions: Array<{ sourceUnitId: string; sourceFactor: number; baseFactor: number }>
  projectCode: string | null
  projectName: string | null
  sourceOrganizationName: string
  sourceWarehouseName: string
  sourceBinName: string | null
  targetOrganizationName: string
  targetWarehouseName: string
  targetBinName: string | null
  documentTypeName: string
  businessTypeName: string
  ownerName: string | null
  keeperName: string | null
  stepStatus: 'draft' | 'in_transit' | 'received' | 'returned' | 'cancelled' | null
  inTransitQuantity: number | null
  stepReceivedAt: string | null
  inventoryUnitName: string | null
  baseUnitName: string | null
}

export interface WmsTransferBusinessLineInput extends WmsTransferRequestLineInput {
  sourceBatchId?: string | null
  sourceRequestLineId?: string | null
  returnOfLineId?: string | null
  serialIds?: string[]
}

export interface WmsTransferBusinessInput {
  id?: string
  tenantId?: string
  kind: WmsTransferBusinessKind
  documentTypeId: string
  businessTypeId: string
  businessDate: string
  projectId?: string | null
  sourceOrganizationId: string
  sourceDepartmentId?: string | null
  sourceKeeperId?: string | null
  targetOrganizationId: string
  targetDepartmentId?: string | null
  targetKeeperId?: string | null
  remark?: string | null
  sourceRequestId?: string | null
  returnOfDocumentId?: string | null
  lines: WmsTransferBusinessLineInput[]
}
