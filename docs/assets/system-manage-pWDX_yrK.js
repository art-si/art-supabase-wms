import"./supabase-adyVcRTj.js";import{C as e,Mt as t,St as n}from"./sys-GsDUhIQW.js";import"./read-system-param-DZOkhMe1.js";import"./tenant-scope-HpANs1tM.js";var{supabase:r,keysToSnakeDeep:i,responseHandle:a}=n(),o=new e({idKey:`id`,parentKey:`parentId`,childrenKey:`children`});async function s(e={},n={}){let i=t(e.tenantId),s=r.from(`mdm_organization`).select(`id,tenant_id,parent_id,organization_code,organization_name,organization_type,status,sort,is_system,
       tenant:sys_tenant!sys_organization_tenant_id_fkey(tenant_code,tenant_name)`).order(`sort`).order(`organization_name`);i&&(s=s.eq(`tenant_id`,i)),e.status&&(s=s.eq(`status`,e.status));let c=await a(()=>s,{showErrorMessage:n.showErrorMessage??!0});return{...c,data:o.listToTree(c.data??[],(e,t)=>(e.sort??0)-(t.sort??0)||e.organizationName.localeCompare(t.organizationName,`zh-CN`))}}async function c(e={}){if(!e?.tenantId)return{data:[],error:null};let t=await s({tenantId:e.tenantId,status:`1`}),n=e.excludeId?o.removeNodesByCondition(t.data??[],t=>t.id===e.excludeId).tree:t.data;return{...t,data:n}}async function l(e={}){if(!e?.tenantId)return{data:[],error:null};let t=r.from(`sys_user`).select(`
        id,
        tenant_id,
        organization_id,
        avatar,
        user_name,
        nick_name,
        user_email,
        status,
        organization:mdm_organization!sys_user_organization_id_fkey(
          id,
          organization_code,
          organization_name
        )
      `).eq(`tenant_id`,e.tenantId).eq(`status`,`1`).is(`deleted_at`,null).order(`nick_name`,{ascending:!0});return await a(()=>t,{showErrorMessage:!0})}export{l as n,s as r,c as t};