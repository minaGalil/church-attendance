import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $ = id => document.getElementById(id);
const message = txt => { $('message').textContent = txt || ''; };
const configured = !SUPABASE_URL.includes('YOUR_PROJECT_REF') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
if (!configured) message('ضع Project URL وPublishable Key في config.js أولاً.');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
let roles=[], currentView='children', rows=[], departments=new Map();
const parentOnly=()=>roles.length>0 && roles.every(r=>r==='parent');
function show(view){$('login').hidden=view==='app';$('app').hidden=view!=='app';}
function makeTable(headers,data,keys){const wrap=document.createElement('div');wrap.className='table-wrap';const t=document.createElement('table');const thead=document.createElement('thead');const head=document.createElement('tr');headers.forEach(h=>{const th=document.createElement('th');th.textContent=h;head.append(th)});thead.append(head);t.append(thead);const body=document.createElement('tbody');data.forEach(item=>{const tr=document.createElement('tr');keys.forEach(k=>{const td=document.createElement('td');td.textContent=item[k]??'';tr.append(td)});body.append(tr)});t.append(body);wrap.append(t);return wrap;}
async function initialize(){if(!sb)return;const {data:{user},error}=await sb.auth.getUser();if(error||!user){show('login');return;}
 const {data:account,error:ae}=await sb.from('APP_USERS').select('FULL_NAME,IS_ACTIVE').eq('AUTH_USER_ID',user.id).maybeSingle();
 const {data:roleRows,error:re}=await sb.from('APP_USER_ROLES').select('ROLE').eq('AUTH_USER_ID',user.id);
 if(ae||re||!account?.IS_ACTIVE||!roleRows?.length){await sb.auth.signOut();show('login');message('الحساب غير مفعل أو ليس له صلاحيات.');return;}
 roles=roleRows.map(x=>x.ROLE);$('who').textContent=account.FULL_NAME||user.email;show('app');
 document.querySelector('[data-view="children"]').hidden=parentOnly();
 document.querySelector('[data-view="unregistered"]').hidden=!roles.some(r=>['super_admin','church_admin','attendance_manager'].includes(r));
 await loadDepartments();await load(parentOnly()?'attendance':'children');
}
async function loadDepartments(){departments=new Map();const sel=$('department');sel.replaceChildren(new Option('كل الفصول',''));
 if(parentOnly()){sel.closest('label').hidden=true;return;}sel.closest('label').hidden=false;
 const {data,error}=await sb.from('DEPARTMENTS').select('DEPTID,DEPTNAME').order('DEPTID');if(error)return;
 (data||[]).forEach(d=>{departments.set(d.DEPTID,d.DEPTNAME);sel.add(new Option(d.DEPTNAME,String(d.DEPTID)))});
}
async function fetchAll(queryFactory,max=5000){let out=[];for(let from=0;from<max;from+=500){const {data,error}=await queryFactory(from,from+499);if(error)throw error;out.push(...(data||[]));if(!data||data.length<500)break;}return out;}
async function load(view){if(!sb)return;currentView=view;rows=[];message('');$('content').replaceChildren();$('notice').textContent='جارٍ تحميل البيانات...';$('sectionTitle').textContent=view==='children'?'إدارة شباب متوسط بنين':view==='attendance'?'سجل الحضور':'البصمات غير المسجلة';
 $('dateFrom').closest('label').hidden=view==='children';$('dateTo').closest('label').hidden=view==='children';$('department').closest('label').hidden=parentOnly()||view==='unregistered';
 if(view==='unregistered'){$('notice').textContent='هذا التقرير يحتاج API آمن لربط البصمات غير المسجلة دون كشف بيانات الشباب. سيتم تفعيله في التحديث القادم.';$('exportCsv').hidden=true;return;}
 if(view==='children'&&parentOnly()){$('notice').textContent='غير مصرح';return;}
 try{
  if(view==='children'){
   rows=await fetchAll((a,b)=>sb.from('USERINFO').select('USERID,NAME,DEFAULTDEPTID').order('USERID').range(a,b));
   rows=rows.map(x=>({...x,CLASS_NAME:departments.get(x.DEFAULTDEPTID)||`فصل ${x.DEFAULTDEPTID??'غير محدد'}`}));
  }else{
   rows=await fetchAll((a,b)=>sb.from('checkinout').select('ID,USERID,CHECKTIME,SENSORID').order('CHECKTIME',{ascending:false}).range(a,b));
   // Parent attendance remains restricted by RLS. Never query unrestricted children for parent accounts.
   if(!parentOnly()){
    const {data:users}=await sb.from('USERINFO').select('USERID,NAME,DEFAULTDEPTID').limit(1000);
    const names=new Map((users||[]).map(x=>[x.USERID,x]));
    rows=rows.map(x=>{const u=names.get(x.USERID);return {...x,NAME:u?.NAME||'غير مسجل / غير متاح',DEFAULTDEPTID:u?.DEFAULTDEPTID??null,CLASS_NAME:departments.get(u?.DEFAULTDEPTID)||'غير محدد'};});
   }
  }
  applyFilters();
 }catch(e){$('notice').textContent='تعذر تحميل البيانات.';message(e.message||'حدث خطأ');}
}
let visibleRows=[];
function applyFilters(){if(currentView==='unregistered')return;const q=$('search').value.trim().toLocaleLowerCase('ar');const dept=$('department').value;const start=$('dateFrom').value;const end=$('dateTo').value;
 visibleRows=rows.filter(r=>{if(q&&!String(r.USERID).includes(q)&&!String(r.NAME||'').toLocaleLowerCase('ar').includes(q))return false;if(dept&&String(r.DEFAULTDEPTID)!==dept)return false;if(currentView==='attendance'){const d=String(r.CHECKTIME||'').slice(0,10);if(start&&d<start)return false;if(end&&d>end)return false;}return true;});
 $('content').replaceChildren();$('notice').textContent=`عدد السجلات: ${visibleRows.length}${rows.length>=5000?' (أول 5000 سجل فقط)':''}`;
 const keys=currentView==='children'?['USERID','NAME','CLASS_NAME']:parentOnly()?['USERID','CHECKTIME']:['USERID','NAME','CLASS_NAME','CHECKTIME'];
 const headers=currentView==='children'?['رقم البصمة','اسم الشاب','اسم الفصل']:parentOnly()?['رقم البصمة','تاريخ ووقت الحضور']:['رقم البصمة','اسم الشاب','اسم الفصل','تاريخ ووقت الحضور'];
 $('content').append(makeTable(headers,visibleRows,keys));$('exportCsv').hidden=false;
}
function exportCsv(){if(!visibleRows.length){message('لا توجد نتائج للتصدير.');return;}const keys=currentView==='children'?['USERID','NAME','CLASS_NAME']:parentOnly()?['USERID','CHECKTIME']:['USERID','NAME','CLASS_NAME','CHECKTIME'];const header=currentView==='children'?['رقم البصمة','الاسم','الفصل']:parentOnly()?['رقم البصمة','وقت الحضور']:['رقم البصمة','الاسم','الفصل','وقت الحضور'];
 const escape=v=>'"'+String(v??'').replaceAll('"','""')+'"';const csv='\uFEFF'+[header,...visibleRows.map(r=>keys.map(k=>r[k]))].map(a=>a.map(escape).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=currentView==='children'?'شباب_متوسط_بنين.csv':'الحضور.csv';a.click();URL.revokeObjectURL(url);
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!sb)return;message('');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){message('فشل تسجيل الدخول. تأكد من البريد وكلمة المرور.');return;}await initialize();});
$('logout').addEventListener('click',async()=>{if(sb)await sb.auth.signOut();roles=[];rows=[];show('login');message('');});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>load(b.dataset.view)));
['search','department','dateFrom','dateTo'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',applyFilters));
$('clearFilters').addEventListener('click',()=>{['search','department','dateFrom','dateTo'].forEach(id=>$(id).value='');applyFilters();});
$('exportCsv').addEventListener('click',exportCsv);
initialize();
