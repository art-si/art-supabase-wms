<template>
  <WmsPurchaseDocumentWorkspace kind="purchase_inbound" :permissions="permissions" />
</template>

<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'
  import { WMS_PURCHASE_INBOUND_PERMISSIONS } from '../permissions'

  defineOptions({ name: 'WmsPurchaseInbound' })
  const permissions = WMS_PURCHASE_INBOUND_PERMISSIONS
</script>
