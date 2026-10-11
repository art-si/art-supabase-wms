<template>
  <InitialSalesDrawer
    ref="drawerRef"
    kind="other_outbound"
    issue-request
    import-permission="WmsIssueRequest:Add"
    @success="emit('success')"
  />
</template>
<script setup lang="ts">
  import InitialSalesDrawer from '../../../initialization/initial-sales/modules/initial-sales-drawer.vue'
  import type { WmsProject, WmsWarehouse } from '@wms/api'
  interface Context {
    tenantId?: string
    warehouses: WmsWarehouse[]
    projects: WmsProject[]
    workOrderId?: string
  }
  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<InstanceType<typeof InitialSalesDrawer>>()
  async function handleOpen(context: Context): Promise<void> {
    await drawerRef.value?.handleOpen({
      mode: 'create',
      tenantId: context.tenantId,
      requestWorkOrderId: context.workOrderId
    })
  }
  defineExpose({ handleOpen })
</script>
