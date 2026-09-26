<template>
  <WmsPurchaseDocumentWorkspace kind="entrusted_processing_return" :permissions="permissions" />
</template>

<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'
  import { WMS_ENTRUSTED_PROCESSING_RETURN_PERMISSIONS } from '../permissions'

  defineOptions({ name: 'WmsEntrustedProcessingReturn' })
  const permissions = WMS_ENTRUSTED_PROCESSING_RETURN_PERMISSIONS
</script>
