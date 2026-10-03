<template>
  <ArtDrawer ref="drawerRef" size="xl" show-fullscreen-button>
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:file-transfer-line"
        eyebrow="TRANSFER REQUEST"
        :title="
          mode === 'view'
            ? form.documentNo || '调拨申请单'
            : mode === 'edit'
              ? '编辑调拨申请单'
              : '新增调拨申请单'
        "
        description="按月自动生成三位流水号；一张申请单可同时登记多种物料。"
      />
      <ArtSectionCard title="单据表头" subtitle="编号按月生成；审核后可下推调拨业务。">
        <ArtDescriptions v-if="mode === 'view'" :data="viewData" :items="viewItems" :columns="3" />
        <ArtForm
          v-else
          ref="formRef"
          v-model="form"
          :items="headerItems"
          :rules="rules"
          :span="12"
          :gutter="20"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #applicantId>
            <ArtEmployeeSelect
              v-model="form.applicantId"
              :tenant-id="context?.tenantId"
              placeholder="选择申请人"
              @selected="onApplicantSelected"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>

      <ArtSectionCard
        title="物料明细"
        :subtitle="`共 ${lines.length} 行；行号按 10 递增。`"
        :empty="!lines.length"
        empty-title="请选择物料"
        empty-description="支持一次多选物料，编码、规格与默认单位自动带入。"
      >
        <template #actions>
          <ArtTableMultipleSelect
            v-if="mode !== 'view'"
            :model-value="selectedMaterialIds"
            :api-fn="materialApi"
            :selected-data="selectedMaterials"
            :columns="materialColumns"
            title="选择调拨物料"
            subtitle="按物料分类筛选，可一次选择多种物料"
            placeholder="添加物料"
            search-placeholder="输入物料编码、名称或规格"
            label-key="materialName"
            :show-pagination="true"
            :page-size="20"
            @update:selected-data="onMaterialsSelected"
          >
            <template #trigger="{ open }">
              <ElButton type="primary" @click="open">
                <ArtSvgIcon icon="ri:add-line" />添加物料
              </ElButton>
            </template>
          </ArtTableMultipleSelect>
        </template>
        <ArtTable
          v-if="mode === 'view'"
          :data="documentRows"
          :pagination="false"
          :show-table-header="false"
          row-key="lineId"
          table-layout="fixed"
          class="transfer-line-table"
        >
          <ElTableColumn prop="lineNo" label="行号" width="68" fixed="left" />
          <ElTableColumn label="物料描述" min-width="220" fixed="left">
            <template #default="{ row }">
              <strong class="block truncate">{{
                row.materialDescription || row.materialName
              }}</strong>
              <small class="text-[var(--el-text-color-secondary)]"
                >{{ row.materialCode }} · {{ row.specificationModel || '无规格' }}</small
              >
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="projectName"
            label="项目名称"
            min-width="160"
            show-overflow-tooltip
          />
          <ElTableColumn prop="constructionNo" label="施工号" min-width="115" />
          <ElTableColumn prop="inventoryUnitName" label="库存单位" width="100" />
          <ElTableColumn label="数量" width="110" align="right"
            ><template #default="{ row }"
              ><strong class="tabular-nums">{{ numberText(row.quantity) }}</strong></template
            ></ElTableColumn
          >
          <ElTableColumn prop="baseUnitName" label="基本单位" width="100" />
          <ElTableColumn label="基本数量" width="110" align="right"
            ><template #default="{ row }">{{
              numberText(row.baseQuantity)
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="batchNo" label="批号" min-width="120" />
          <ElTableColumn prop="sourceOrganizationName" label="调出组织" min-width="150" />
          <ElTableColumn prop="sourceWarehouseName" label="调出仓库" min-width="150" />
          <ElTableColumn prop="sourceBinName" label="调出仓位" min-width="120" />
          <ElTableColumn prop="targetOrganizationName" label="调入组织" min-width="150" />
          <ElTableColumn prop="targetWarehouseName" label="调入仓库" min-width="150" />
          <ElTableColumn prop="targetBinName" label="调入仓位" min-width="120" />
          <ElTableColumn label="货主类型" width="105"
            ><template #default="{ row }">{{
              ownerTypeLabel(row.ownerType)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="库存类型" width="110"
            ><template #default="{ row }">{{
              stockTypeLabel(row.stockType)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="库存状态" width="105"
            ><template #default="{ row }">{{
              stockStatusLabel(row.stockStatus)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="赠品" width="72" align="center"
            ><template #default="{ row }">{{ row.gift ? '✓' : '—' }}</template></ElTableColumn
          >
          <ElTableColumn prop="auxiliaryUnitName" label="辅助单位" width="105" />
          <ElTableColumn prop="auxiliaryQuantity" label="辅助数量" width="105" align="right" />
          <ElTableColumn prop="auxiliaryUnit2Name" label="辅助单位2" width="110" />
          <ElTableColumn prop="auxiliaryQuantity2" label="辅助数量2" width="110" align="right" />
          <ElTableColumn prop="productionDate" label="生产日期" width="115" />
          <ElTableColumn prop="expiryDate" label="有效期至" width="115" />
          <ElTableColumn prop="trackingNo" label="跟踪号" min-width="125" />
          <ElTableColumn prop="sourceDocument" label="来源单据" min-width="130" />
          <ElTableColumn prop="sourceLineNo" label="源行号" width="95" />
          <ElTableColumn prop="lineRemark" label="备注" min-width="150" show-overflow-tooltip />
        </ArtTable>
        <ArtTable
          v-else
          :data="lines"
          :pagination="false"
          :show-table-header="false"
          row-key="key"
          table-layout="fixed"
          class="transfer-line-table"
        >
          <ElTableColumn label="行号" width="68" fixed="left">
            <template #default="{ $index }">{{ ($index + 1) * 10 }}</template>
          </ElTableColumn>
          <ElTableColumn label="物料描述" min-width="210" fixed="left">
            <template #default="{ row }">
              <strong class="block truncate">{{
                row.material?.description || row.material?.materialName
              }}</strong>
              <small class="text-[var(--el-text-color-secondary)]"
                >{{ row.material?.materialCode }} ·
                {{ row.material?.specificationModel || '无规格' }}</small
              >
            </template>
          </ElTableColumn>
          <ElTableColumn label="项目名称" min-width="170">
            <template #default="{ row }">
              <ElSelect
                v-model="row.projectId"
                clearable
                filterable
                :disabled="false"
                placeholder="选择项目"
              >
                <ElOption
                  v-for="item in projects"
                  :key="item.id"
                  :label="`${item.projectName} · ${item.projectCode}`"
                  :value="item.id"
                />
              </ElSelect>
            </template>
          </ElTableColumn>
          <ElTableColumn label="施工号" min-width="130"
            ><template #default="{ row }"><ElInput v-model="row.constructionNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="库存单位" min-width="130">
            <template #default="{ row }"
              ><ElSelect v-model="row.inventoryUnitId" filterable
                ><ElOption
                  v-for="unit in units"
                  :key="unit.id"
                  :label="unit.unitName"
                  :value="unit.id" /></ElSelect
            ></template>
          </ElTableColumn>
          <ElTableColumn label="数量" min-width="130"
            ><template #default="{ row }"
              ><ElInputNumber
                v-model="row.quantity"
                :min="0.0001"
                :precision="4"
                :controls="false"
                :disabled="false"
                class="w-full!" /></template
          ></ElTableColumn>
          <ElTableColumn label="基本数量" min-width="120"
            ><template #default="{ row }"
              ><span class="tabular-nums">{{ row.quantity.toFixed(4) }}</span></template
            ></ElTableColumn
          >
          <ElTableColumn label="批号" min-width="140"
            ><template #default="{ row }"><ElInput v-model="row.batchNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="调出组织" min-width="190"
            ><template #default="{ row }"
              ><ElTreeSelect
                v-model="row.sourceOrganizationId"
                :data="organizationSelectTree"
                node-key="id"
                :props="organizationTreeProps"
                filterable
                check-strictly
                default-expand-all
                :render-after-expand="false"
                :disabled="false"
                @change="onSourceOrganizationChange(row)" /></template
          ></ElTableColumn>
          <ElTableColumn label="调出仓库" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.sourceWarehouseId"
                filterable
                :disabled="false"
                @change="loadSourceBins(row)"
                ><ElOption
                  v-for="item in warehouseOptions(row.sourceOrganizationId)"
                  :key="item.id"
                  :label="item.warehouseName"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="调出仓位" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.sourceBinId"
                clearable
                filterable
                :disabled="!row.sourceWarehouseId"
                ><ElOption
                  v-for="item in row.sourceBins"
                  :key="item.id"
                  :label="`${item.binCode} · ${item.binName}`"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="调入组织" min-width="190"
            ><template #default="{ row }"
              ><ElTreeSelect
                v-model="row.targetOrganizationId"
                :data="organizationSelectTree"
                node-key="id"
                :props="organizationTreeProps"
                filterable
                check-strictly
                default-expand-all
                :render-after-expand="false"
                :disabled="false"
                @change="onTargetOrganizationChange(row)" /></template
          ></ElTableColumn>
          <ElTableColumn label="调入仓库" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.targetWarehouseId"
                filterable
                :disabled="false"
                @change="loadTargetBins(row)"
                ><ElOption
                  v-for="item in warehouseOptions(row.targetOrganizationId)"
                  :key="item.id"
                  :label="item.warehouseName"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="调入仓位" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.targetBinId"
                clearable
                filterable
                :disabled="!row.targetWarehouseId"
                ><ElOption
                  v-for="item in row.targetBins"
                  :key="item.id"
                  :label="`${item.binCode} · ${item.binName}`"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="货主类型" min-width="120"
            ><template #default="{ row }"
              ><ElSelect v-model="row.ownerType"
                ><ElOption
                  v-for="option in userStore.getDictMap.mdmBusinessOwnerType ?? []"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="库存类型" min-width="120"
            ><template #default="{ row }"
              ><ElSelect v-model="row.stockType"
                ><ElOption
                  v-for="item in stockTypes"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="库存状态" min-width="120"
            ><template #default="{ row }"
              ><ElSelect v-model="row.stockStatus"
                ><ElOption
                  v-for="option in userStore.getDictMap.wmsStockStatus ?? []"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="赠品" width="86" align="center"
            ><template #default="{ row }"><ElCheckbox v-model="row.gift" /></template
          ></ElTableColumn>
          <ElTableColumn label="生产日期" min-width="140"
            ><template #default="{ row }"
              ><ElDatePicker v-model="row.productionDate" value-format="YYYY-MM-DD" /></template
          ></ElTableColumn>
          <ElTableColumn label="有效期至" min-width="140"
            ><template #default="{ row }"
              ><ElDatePicker v-model="row.expiryDate" value-format="YYYY-MM-DD" /></template
          ></ElTableColumn>
          <ElTableColumn label="跟踪号" min-width="140"
            ><template #default="{ row }"><ElInput v-model="row.trackingNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="来源单据" min-width="150"
            ><template #default="{ row }"><ElInput v-model="row.sourceDocument" /></template
          ></ElTableColumn>
          <ElTableColumn label="源行号" min-width="110"
            ><template #default="{ row }"><ElInput v-model="row.sourceLineNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="备注" min-width="160"
            ><template #default="{ row }"><ElInput v-model="row.remark" /></template
          ></ElTableColumn>
          <ElTableColumn label="操作" width="82" fixed="right"
            ><template #default="{ row }"
              ><ElButton link type="danger" @click="removeLine(row.key)">移除</ElButton></template
            ></ElTableColumn
          >
        </ArtTable>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { fetchGetEnableOrganizationTree } from '@/api/system-manage'
  import TreeUtils from '@/utils/tree'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchWmsBins,
    fetchWmsInitialOptions,
    fetchWmsMaterialOptions,
    fetchWmsProjects,
    fetchWmsTransferRequest,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    saveWmsTransferRequest,
    type WmsBin,
    type WmsInitializationOption,
    type WmsMaterialOption,
    type WmsProject,
    type WmsTransferRequestRow,
    type WmsUnitOption,
    type WmsWarehouse
  } from '@wms/api'

  interface Context {
    tenantId?: string
  }
  interface OpenData extends Context {
    mode: 'create' | 'edit' | 'copy' | 'view'
    documentId?: string
  }
  interface DraftLine {
    key: string
    materialId: string
    material: WmsMaterialOption | null
    projectId: string
    constructionNo: string
    inventoryUnitId: string
    quantity: number
    batchNo: string
    sourceOrganizationId: string
    sourceWarehouseId: string
    sourceBinId: string
    sourceBins: WmsBin[]
    targetOrganizationId: string
    targetWarehouseId: string
    targetBinId: string
    targetBins: WmsBin[]
    ownerType: 'self' | 'supplier' | 'customer'
    stockType: string
    stockStatus: string
    gift: boolean
    productionDate: string
    expiryDate: string
    trackingNo: string
    sourceDocument: string
    sourceLineNo: string
    remark: string
  }
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  void Promise.all(
    ['mdmBusinessOwnerType', 'wmsCountStockType', 'wmsStockStatus'].map((code) =>
      userStore.ensureDictLoaded(code)
    )
  )
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const mode = ref<OpenData['mode']>('create')
  const lines = ref<DraftLine[]>([])
  const documentRows = ref<WmsTransferRequestRow[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const projects = ref<WmsProject[]>([])
  const units = ref<WmsUnitOption[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const organizations = computed(() =>
    treeUtils
      .treeToList(organizationTree.value)
      .filter((row): row is Api.SystemManage.OrganizationListItem & { id: string } =>
        Boolean(row.id)
      )
  )
  type OrganizationSelectNode = Api.SystemManage.OrganizationListItem & {
    organizationLabel: string
    children?: OrganizationSelectNode[]
  }
  const organizationSelectTree = computed<OrganizationSelectNode[]>(() => {
    const decorate = (nodes: Api.SystemManage.OrganizationListItem[]): OrganizationSelectNode[] =>
      nodes.map((node) => ({
        ...node,
        organizationLabel: `${node.organizationName} · ${node.organizationCode}`,
        children: node.children ? decorate(node.children) : undefined
      }))
    return decorate(organizationTree.value)
  })
  const organizationTreeProps = {
    value: 'id',
    label: 'organizationLabel',
    children: 'children'
  }
  const form = reactive({
    id: '',
    documentNo: '保存后自动生成',
    organizationId: '',
    documentTypeId: '',
    businessTypeId: '',
    applicationDate: new Date().toISOString().slice(0, 10),
    applicantId: '',
    departmentId: '',
    remark: ''
  })
  const selectedMaterialIds = computed(() => lines.value.map((row) => row.materialId))
  const selectedMaterials = computed(() =>
    lines.value.map((row) => row.material).filter((row): row is WmsMaterialOption => Boolean(row))
  )
  const stockTypes = computed(() => userStore.getDictMap.wmsCountStockType ?? [])
  const stockStatusLabels: Record<string, string> = {
    available: '可用',
    scrap: '报废',
    defective: '不良',
    frozen: '冻结'
  }
  const ownerTypeLabels: Record<string, string> = {
    self: '自有',
    supplier: '供应商',
    customer: '客户'
  }
  const firstDocumentRow = computed(() => documentRows.value[0])
  const viewData = computed(() => ({
    documentNo: form.documentNo,
    organization: organizationLabel(form.organizationId),
    documentType:
      firstDocumentRow.value?.documentTypeName ||
      optionName(documentTypes.value, form.documentTypeId),
    businessType:
      firstDocumentRow.value?.businessTypeName ||
      optionName(businessTypes.value, form.businessTypeId),
    applicationDate: form.applicationDate,
    applicant: firstDocumentRow.value?.applicantName || '未指定',
    department: firstDocumentRow.value?.departmentName || organizationLabel(form.departmentId),
    status: statusLabel(firstDocumentRow.value?.status),
    pushedMode: pushModeLabel(firstDocumentRow.value?.pushedMode),
    remark: form.remark || '—'
  }))
  const viewItems: ArtDescriptionItem<typeof viewData.value>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo', copyable: true },
    { key: 'organization', label: '申请组织', field: 'organization' },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'applicationDate', label: '申请日期', field: 'applicationDate' },
    { key: 'applicant', label: '申请人', field: 'applicant' },
    { key: 'department', label: '申请部门', field: 'department' },
    { key: 'status', label: '单据状态', field: 'status' },
    { key: 'pushedMode', label: '下推状态', field: 'pushedMode' },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ]
  const materialColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialName', label: '物料名称', minWidth: 190 },
    { prop: 'description', label: '物料描述', minWidth: 210 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 140 }
  ]
  const headerItems = computed<FormItem[]>(() => [
    { key: 'documentNo', label: '单据编号', type: 'input', props: { disabled: true } },
    {
      key: 'organizationId',
      label: '申请组织',
      type: 'treeSelect',
      options: organizationTree.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      labelFn: (row) => `${row.organizationName ?? ''} · ${row.organizationCode ?? ''}`,
      props: {
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false
      }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((row) => ({ label: row.name, value: row.id })),
      props: { filterable: true, onChange: selectDefaultBusinessType }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter((row) => !form.documentTypeId || row.documentTypeId === form.documentTypeId)
        .map((row) => ({ label: row.name, value: row.id })),
      props: { filterable: true }
    },
    {
      key: 'applicationDate',
      label: '申请日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD' }
    },
    { key: 'applicantId', label: '申请人', type: 'slot' },
    {
      key: 'departmentId',
      label: '申请部门',
      type: 'treeSelect',
      options: organizationTree.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      props: {
        filterable: true,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false
      }
    },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    organizationId: [{ required: true, message: '请选择申请组织', trigger: 'change' }],
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    applicationDate: [{ required: true, message: '请选择申请日期', trigger: 'change' }]
  }
  function numberText(value: number | null | undefined): string {
    return Number(value || 0).toFixed(4)
  }
  function stockTypeLabel(value: string): string {
    return stockTypes.value.find((item) => item.value === value)?.label || value || '—'
  }
  function stockStatusLabel(value: string): string {
    return stockStatusLabels[value] || value || '—'
  }
  function ownerTypeLabel(value: string): string {
    return ownerTypeLabels[value] || value || '—'
  }
  function optionName(options: WmsInitializationOption[], id: string): string {
    return options.find((item) => item.id === id)?.name || '—'
  }
  function organizationLabel(id: string): string {
    const item = organizations.value.find((row) => row.id === id)
    return item ? `${item.organizationName} · ${item.organizationCode}` : '—'
  }
  function statusLabel(value?: string): string {
    return value === 'approved' ? '已审核' : value === 'submitted' ? '已提交' : '暂存'
  }
  function pushModeLabel(value?: string | null): string {
    return value === 'direct'
      ? '已下推直接调拨'
      : value === 'in_transit'
        ? '已下推调出在途'
        : '未下推'
  }
  function warehouseOptions(organizationId: string) {
    return warehouses.value.filter(
      (row) => row.organizationId === organizationId && row.status === 'enabled'
    )
  }
  function onApplicantSelected(rows: Array<{ departmentId?: string | null }>) {
    if (!form.departmentId && rows[0]?.departmentId) form.departmentId = rows[0].departmentId
  }
  function selectDefaultBusinessType() {
    form.businessTypeId =
      businessTypes.value.find((row) => row.documentTypeId === form.documentTypeId)?.id || ''
  }
  function newLine(material: WmsMaterialOption): DraftLine {
    const orgId = form.organizationId || organizations.value[0]?.id || ''
    const wh = warehouseOptions(orgId)
    return {
      key: crypto.randomUUID(),
      materialId: material.id,
      material,
      projectId: '',
      constructionNo: '',
      inventoryUnitId: material.inventoryUnitId || material.baseUnitId || units.value[0]?.id || '',
      quantity: 1,
      batchNo: '',
      sourceOrganizationId: orgId,
      sourceWarehouseId: wh[0]?.id || '',
      sourceBinId: '',
      sourceBins: [],
      targetOrganizationId: orgId,
      targetWarehouseId: wh[1]?.id || wh[0]?.id || '',
      targetBinId: '',
      targetBins: [],
      ownerType: 'self',
      stockType: 'normal',
      stockStatus: 'available',
      gift: false,
      productionDate: '',
      expiryDate: '',
      trackingNo: '',
      sourceDocument: '',
      sourceLineNo: '',
      remark: ''
    }
  }
  async function materialApi(params: DataSelectFetchParams) {
    return context.value?.tenantId
      ? fetchWmsMaterialOptions(
          context.value.tenantId,
          params.keyword,
          params.page,
          params.pageSize
        )
      : { data: [], total: 0 }
  }
  function onMaterialsSelected(rows: DataSelectRecord[]) {
    const materials = rows.filter(
      (row): row is WmsMaterialOption =>
        typeof row.id === 'string' && typeof row.materialCode === 'string'
    )
    const previous = new Map(lines.value.map((row) => [row.materialId, row]))
    lines.value = materials.map((item) => previous.get(item.id) || newLine(item))
  }
  function removeLine(key: string) {
    lines.value = lines.value.filter((row) => row.key !== key)
  }
  function onSourceOrganizationChange(value: unknown) {
    const row = value as DraftLine
    row.sourceWarehouseId = warehouseOptions(row.sourceOrganizationId)[0]?.id || ''
    row.sourceBinId = ''
    row.sourceBins = []
    void loadSourceBins(row)
  }
  function onTargetOrganizationChange(value: unknown) {
    const row = value as DraftLine
    row.targetWarehouseId = warehouseOptions(row.targetOrganizationId)[0]?.id || ''
    row.targetBinId = ''
    row.targetBins = []
    void loadTargetBins(row)
  }
  async function loadSourceBins(value: unknown) {
    const row = value as DraftLine
    row.sourceBinId = ''
    row.sourceBins = row.sourceWarehouseId ? await fetchWmsBins(row.sourceWarehouseId) : []
  }
  async function loadTargetBins(value: unknown) {
    const row = value as DraftLine
    row.targetBinId = ''
    row.targetBins = row.targetWarehouseId ? await fetchWmsBins(row.targetWarehouseId) : []
  }
  function rowMaterial(row: WmsTransferRequestRow): WmsMaterialOption {
    return {
      id: row.materialId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      description: row.materialDescription,
      specificationModel: row.specificationModel,
      inventoryUnitId: row.inventoryUnitId,
      baseUnitId: row.baseUnitId,
      auxiliaryUnitId: row.auxiliaryUnitId,
      auxiliaryUnit2Id: row.auxiliaryUnit2Id,
      unitConversions: [],
      serialManagementEnabled: false
    }
  }
  async function loadDocument(id: string) {
    const rows = await fetchWmsTransferRequest(id)
    documentRows.value = rows
    const first = rows[0]
    if (!first) throw new Error('调拨申请不存在')
    Object.assign(form, {
      id: first.documentId,
      documentNo: first.documentNo,
      organizationId: first.organizationId,
      documentTypeId: first.documentTypeId,
      businessTypeId: first.businessTypeId,
      applicationDate: first.applicationDate,
      applicantId: first.applicantId || '',
      departmentId: first.departmentId || '',
      remark: first.documentRemark || ''
    })
    lines.value = await Promise.all(
      rows.map(async (row) => ({
        key: crypto.randomUUID(),
        materialId: row.materialId,
        material: rowMaterial(row),
        projectId: row.projectId || '',
        constructionNo: row.constructionNo || '',
        inventoryUnitId: row.inventoryUnitId,
        quantity: Number(row.quantity),
        batchNo: row.batchNo || '',
        sourceOrganizationId: row.sourceOrganizationId,
        sourceWarehouseId: row.sourceWarehouseId,
        sourceBinId: row.sourceBinId || '',
        sourceBins: row.sourceWarehouseId ? await fetchWmsBins(row.sourceWarehouseId) : [],
        targetOrganizationId: row.targetOrganizationId,
        targetWarehouseId: row.targetWarehouseId,
        targetBinId: row.targetBinId || '',
        targetBins: row.targetWarehouseId ? await fetchWmsBins(row.targetWarehouseId) : [],
        ownerType: row.ownerType,
        stockType: row.stockType,
        stockStatus: row.stockStatus,
        gift: row.gift,
        productionDate: row.productionDate || '',
        expiryDate: row.expiryDate || '',
        trackingNo: row.trackingNo || '',
        sourceDocument: row.sourceDocument || '',
        sourceLineNo: row.sourceLineNo || '',
        remark: row.lineRemark || ''
      }))
    )
  }
  async function loadOptions(tenantId: string) {
    const [docRows, businessRows, projectRows, unitRows, warehouseRows, orgResult] =
      await Promise.all([
        fetchWmsInitialOptions('mdm_document_type', tenantId),
        fetchWmsInitialOptions('mdm_business_type', tenantId),
        fetchWmsProjects(tenantId),
        fetchWmsUnitOptions(tenantId),
        fetchWmsWarehouses(tenantId),
        fetchGetEnableOrganizationTree({ tenantId })
      ])
    documentTypes.value = docRows.filter(
      (row) => row.code === 'WMS_TRANSFER_REQUEST_STANDARD' || row.name.includes('调拨')
    )
    businessTypes.value = businessRows
    projects.value = projectRows
    units.value = unitRows
    warehouses.value = warehouseRows
    organizationTree.value = orgResult.data || []
  }
  async function save(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!lines.value.length) {
        ElMessage.warning('请至少选择一条物料')
        return false
      }
      if (
        lines.value.some(
          (row) =>
            !row.inventoryUnitId ||
            row.quantity <= 0 ||
            !row.sourceOrganizationId ||
            !row.sourceWarehouseId ||
            !row.targetOrganizationId ||
            !row.targetWarehouseId
        )
      ) {
        ElMessage.warning('请完整填写物料、数量、调出和调入信息')
        return false
      }
      await saveWmsTransferRequest({
        id: mode.value === 'edit' ? form.id : undefined,
        tenantId: context.value?.tenantId,
        organizationId: form.organizationId,
        documentTypeId: form.documentTypeId,
        businessTypeId: form.businessTypeId,
        applicationDate: form.applicationDate,
        applicantId: form.applicantId || null,
        departmentId: form.departmentId || null,
        remark: normalizeNullableText(form.remark),
        lines: lines.value.map((row) => ({
          materialId: row.materialId,
          projectId: row.projectId || null,
          constructionNo: normalizeNullableText(row.constructionNo),
          inventoryUnitId: row.inventoryUnitId,
          quantity: row.quantity,
          baseQuantity: row.quantity,
          batchNo: normalizeNullableText(row.batchNo),
          sourceOrganizationId: row.sourceOrganizationId,
          sourceWarehouseId: row.sourceWarehouseId,
          sourceBinId: row.sourceBinId || null,
          targetOrganizationId: row.targetOrganizationId,
          targetWarehouseId: row.targetWarehouseId,
          targetBinId: row.targetBinId || null,
          ownerType: row.ownerType,
          stockType: row.stockType,
          stockStatus: row.stockStatus,
          gift: row.gift,
          productionDate: row.productionDate || null,
          expiryDate: row.expiryDate || null,
          trackingNo: normalizeNullableText(row.trackingNo),
          sourceDocument: normalizeNullableText(row.sourceDocument),
          sourceLineNo: normalizeNullableText(row.sourceLineNo),
          remark: normalizeNullableText(row.remark)
        }))
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '调拨申请提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: OpenData) {
    context.value = { tenantId: data.tenantId }
    mode.value = data.mode
    lines.value = []
    documentRows.value = []
    Object.assign(form, {
      id: '',
      documentNo: '保存后自动生成',
      organizationId: '',
      documentTypeId: '',
      businessTypeId: '',
      applicationDate: new Date().toISOString().slice(0, 10),
      applicantId: '',
      departmentId: '',
      remark: ''
    })
    await drawerRef.value?.handleOpen(data, {
      title:
        data.mode === 'view'
          ? '查看调拨申请单'
          : data.mode === 'edit'
            ? '编辑调拨申请单'
            : data.mode === 'copy'
              ? '复制调拨申请单'
              : '新增调拨申请单',
      subtitle: '暂存 → 提交 → 审核 → 下推调拨',
      showFooter: data.mode !== 'view',
      onConfirm: save,
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          if (!data.tenantId) throw new Error('缺少租户')
          await loadOptions(data.tenantId)
          form.organizationId = organizations.value[0]?.id || ''
          form.documentTypeId =
            documentTypes.value.find((row) => row.code === 'WMS_TRANSFER_REQUEST_STANDARD')?.id ||
            documentTypes.value[0]?.id ||
            ''
          selectDefaultBusinessType()
          if (data.documentId) {
            await loadDocument(data.documentId)
            if (data.mode === 'copy') {
              form.id = ''
              form.documentNo = '保存后自动生成'
            }
          }
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>

<style scoped>
  :deep(.transfer-line-table .el-input-number),
  :deep(.transfer-line-table .el-select),
  :deep(.transfer-line-table .el-date-editor) {
    width: 100%;
  }
</style>
