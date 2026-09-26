export interface WmsInventoryOrganization {
  id: string
  tenantId: string
  organizationCode: string
  organizationName: string
  organizationType: string
  status: string
  enabledOn: string | null
  initializationClosedAt: string | null
}

export interface WmsInitializationOption {
  id: string
  name: string
  code: string
  tenantId: string
  documentTypeId?: string
}

export interface WmsInitialMaterial extends WmsInitializationOption {
  description: string | null
  specificationModel: string | null
  inventoryUnitId: string | null
  baseUnitId: string | null
  auxiliaryUnitId: string | null
  auxiliaryUnit2Id: string | null
  unitConversions: Array<{ sourceUnitId: string; sourceFactor: number; baseFactor: number }>
  serialManagementEnabled: boolean
}

export interface WmsInitialStockLine {
  id?: string
  lineNo: number
  materialId: string
  material?: WmsInitialMaterial | null
  projectId: string | null
  project?: WmsInitializationOption | null
  constructionNo: string | null
  gift: boolean
  unitPrice: number
  amount: number
  inventoryUnitId: string
  inventoryUnit?: { unitName: string } | null
  openingQuantity: number
  baseUnitId: string | null
  baseQuantity: number
  yearlyOpeningQuantity: number
  yearlyReceivedQuantity: number
  yearlyIssuedQuantity: number
  batchNo: string | null
  inboundDate: string | null
  warehouseId: string
  warehouse?: WmsInitializationOption | null
  binId: string | null
  bin?: { binName: string } | null
  stockType: string
  ownerType: 'self' | 'supplier' | 'customer'
  ownerId: string | null
  stockStatus: string
  keeperId: string | null
  auxiliaryUnitId: string | null
  openingAuxQuantity: number | null
  yearlyOpeningAuxQuantity: number | null
  yearlyReceivedAuxQuantity: number | null
  yearlyIssuedAuxQuantity: number | null
  productionDate: string | null
  expiryDate: string | null
  trackingNo: string | null
  sourceDocument: string | null
  remark: string | null
  serialNos: string[]
}

export interface WmsInitialStockDocument {
  id: string
  tenantId: string
  organizationId: string
  organization?: Pick<
    WmsInventoryOrganization,
    'id' | 'organizationCode' | 'organizationName'
  > | null
  keeper?: { employeeName: string } | null
  documentNo: string
  documentTypeId: string
  businessTypeId: string
  businessDate: string
  accountingDate: string
  keeperId: string | null
  status: 'draft' | 'submitted' | 'approved'
  remark: string | null
  currencyCode: string
  amountEntryEnabled: boolean
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  lines: WmsInitialStockLine[]
}

export interface WmsInitialStockPayload {
  id?: string
  tenantId: string
  organizationId: string
  documentTypeId: string
  businessTypeId: string
  businessDate: string
  keeperId: string | null
  remark: string | null
  currencyCode: string
  amountEntryEnabled: boolean
  lines: WmsInitialStockLine[]
}
