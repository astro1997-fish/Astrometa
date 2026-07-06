import{c as t,s}from"./index-fhFRR6HM.js";import{a as o}from"./index-DhXgJQ-f.js";/**
 * @license lucide-react v0.309.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=t("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);/**
 * @license lucide-react v0.309.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=t("Loader2",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]),r=o.create({baseURL:"http://localhost:8000"});r.interceptors.request.use(async e=>{const{data:{session:a}}=await s.auth.getSession();return a!=null&&a.access_token&&(e.headers.Authorization=`Bearer ${a.access_token}`),e});export{h as C,p as L,r as a};
