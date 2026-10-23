
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);
const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_PROJECT_REF')
  && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
let roles=[], view='home', records=[], shown=[], deptMap=new Map(), youthMap=new Map();
const admin = () => roles.some(x=>['super_admin','church_admin'].includes(x));
const attendanceAdmin = () => roles.some(x=>['super_admin','church_admin','attendance_manager'].includes(x));
const youthEditor = () => roles.some(x=>['super_admin','church_admin','servant'].includes(x));
const parent = () => roles.includes('parent') && !roles.some(x=>x!=='parent');
const setMessage = text => $('message').textContent = text || '';
const note = text => $('notice').textContent = text || '';
const title = text => $('sectionTitle').textContent = text;
const clean = text => String(text ?? '').toLocaleLowerCase('ar').trim();
const validDate = d => String(d || '').slice(0,10);

function toggleApp(logged) {
  $('login').hidden=logged;
  $('app').hidden=!logged;
}
function table(headers, data, fields) {
  const wrap=document.createElement('div'); wrap.className='table-wrap';
  const t=document.createElement('table'), head=document.createElement('thead'), tr=document.createElement('tr');
  headers.forEach(h=>{const th=document.createElement('th'); th.textContent=h; tr.append(th)});
  head.append(tr); t.append(head);
  const body=document.createElement('tbody');
  for (const row of data) {
    const tr=document.createElement('tr');
    fields.forEach(f=>{const td=document.createElement('td'); td.textContent=row[f]??'—'; tr.append(td)});
    body.append(tr);
  }
  t.append(body); wrap.append(t); return wrap;
}
function summary(items) {
  const wrap=document.createElement('div'); wrap.className='stat-grid';
  items.forEach(([name,num])=>{const c=document.createElement('div');c.className='stat';
    const label=document.createElement('span');label.textContent=name;
    const value=document.createElement('strong');value.textContent=num;
    c.append(label,value);wrap.append(c)});
  return wrap;
}
async function allRows(factory,limit=10000) {
  let data=[];
  for(let i=0;i<limit;i+=500) {
    const result=await factory(i,i+499);
    if(result.error) throw result.error;
    data.push(...(result.data||[]));
    if((result.data||[]).length<500)break;
  }
  return data;
}
async function loadDepartments(){
  deptMap.clear();
  const sel=$('department');sel.replaceChildren(new Option('كل الفصول',''));
  const {data,error}=await sb.from('DEPARTMENTS').select('DEPTID,DEPTNAME,SUPDEPTID').order('DEPTID');
  if(error) return;
  for(const d of data||[]) {
    deptMap.set(d.DEPTID,d.DEPTNAME);
    if(d.SUPDEPTID && d.SUPDEPTID!==0) sel.add(new Option(d.DEPTNAME,String(d.DEPTID)));
  }
}
async function loadYouth(){
  const data=await allRows((a,b)=>sb.from('USERINFO').select('USERID,NAME,DEFAULTDEPTID,TITLE').order('USERID').range(a,b));
  youthMap=new Map(data.map(u=>[u.USERID,u]));
  return data;
}
async function enter(){
  if(!sb){setMessage('افتح config.js وضع رابط المشروع ومفتاح Publishable Key.');return;}
  const {data:{user},error}=await sb.auth.getUser();
  if(error||!user){toggleApp(false);return;}
  const [{data:account,error:ae},{data:rs,error:re}]=await Promise.all([
    sb.from('APP_USERS').select('FULL_NAME,IS_ACTIVE').eq('AUTH_USER_ID',user.id).maybeSingle(),
    sb.from('APP_USER_ROLES').select('ROLE').eq('AUTH_USER_ID',user.id)
  ]);
  if(ae||re||!account?.IS_ACTIVE||!rs?.length){
    await sb.auth.signOut();toggleApp(false);setMessage('الحساب غير مفعل أو لا يملك صلاحية دخول.');return;
  }
  roles=rs.map(r=>r.ROLE);
  $('who').textContent=account.FULL_NAME||user.email;
  $('roleLabel').textContent=admin()?'مدير النظام':roles.includes('servant')?'خادم':roles.includes('attendance_manager')?'مسؤول الحضور':'ولي أمر';
  for(const b of document.querySelectorAll('[data-view]')){
    const v=b.dataset.view;
    b.hidden=(v==='users'&&!admin()) || (v==='unregistered'&&!attendanceAdmin())
      || (parent()&&['children','classes','users','unregistered'].includes(v));
  }
  toggleApp(true);
  await loadDepartments();
  await load('home');
}
async function load(v){
  if(!sb)return;
  if(parent()&&['children','classes','users','unregistered'].includes(v)){setMessage('غير مصرح لك بعرض هذه الشاشة.');return;}
  if(v==='users'&&!admin() || v==='unregistered'&&!attendanceAdmin()){setMessage('غير مصرح لك بعرض هذه الشاشة.');return;}
  view=v;records=[];shown=[];setMessage('');note('جارٍ تحميل البيانات...');
  $('content').replaceChildren();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  const names={home:'القائمة الرئيسية - خدمة متوسط بنين',children:'إدارة الشباب',classes:'قائمة الفصول - خدمة متوسط بنين',
    attendance:'سجل الحضور والبصمات',unregistered:'البصمات غير المسجلة',reports:'التقارير',users:'إدارة المستخدمين'};
  title(names[v]||'خدمة متوسط بنين');
  $('filterCard').hidden=v==='users';
  $('exportCsv').hidden=v==='users';
  $('printPdf').hidden=v==='users';
  $('department').closest('label').hidden=parent()||v==='unregistered';
  $('dateFrom').closest('label').hidden=['children','classes','home','users'].includes(v);
  $('dateTo').closest('label').hidden=['children','classes','home','users'].includes(v);
  $('statusLabel').hidden=!['unregistered'].includes(v);
  try{
    if(v==='users'){
      note('إدارة الحسابات تحتاج Secure Admin API؛ لن نعرض أو نعدل حسابات المستخدمين من المتصفح مباشرة.');
      return;
    }
    if(v==='home'||v==='classes'||v==='children'||v==='reports'||v==='unregistered'||v==='attendance'){
      if(!parent()){
        const youth=await loadYouth();
        if(['home','classes'].includes(v)){
          const counts=new Map();
          youth.forEach(u=>counts.set(u.DEFAULTDEPTID,(counts.get(u.DEFAULTDEPTID)||0)+1));
          records=[...deptMap.entries()].filter(([id])=>counts.has(id)).map(([id,name])=>({
            DEPTID:id,DEPTNAME:name,COUNT:counts.get(id)||0
          }));
        } else if(v==='children'){
          records=youth.map(u=>({...u,CLASS_NAME:deptMap.get(u.DEFAULTDEPTID)||'غير محدد'}));
        }
      }
      if(['attendance','unregistered','reports'].includes(v)){
        const punches=await allRows((a,b)=>sb.from('checkinout').select('ID,USERID,CHECKTIME,SENSORID').order('CHECKTIME',{ascending:false}).range(a,b));
        records=punches.map(p=>{
          const u=youthMap.get(p.USERID);
          return {...p,NAME:u?.NAME||'غير مسجل',DEFAULTDEPTID:u?.DEFAULTDEPTID??null,
            CLASS_NAME:deptMap.get(u?.DEFAULTDEPTID)||'غير محدد'};
        });
        if(v==='unregistered')records=records.filter(p=>!youthMap.has(p.USERID));
      }
    }
    filter();
  }catch(err){note('تعذر تحميل البيانات. راجع سياسات RLS وصلاحيات الحساب.');setMessage(err.message||'خطأ في الاتصال');}
}
function filter(){
  if(view==='users')return;
  const q=clean($('search').value),dept=$('department').value,from=$('dateFrom').value,to=$('dateTo').value;
  shown=records.filter(r=>{
    if(q && ![r.USERID,r.NAME,r.DEPTNAME,r.CLASS_NAME,r.DEPTID,r.TITLE].some(v=>clean(v).includes(q)))return false;
    if(dept && String(r.DEFAULTDEPTID??r.DEPTID)!==dept)return false;
    if(['attendance','unregistered','reports'].includes(view)){
      const date=validDate(r.CHECKTIME);
      if(from&&date<from)return false;
      if(to&&date>to)return false;
    }
    return true;
  });
  // Attendance reports: one row per fingerprint ID per calendar date, keeping earliest punch.
  if(view==='attendance'||view==='reports'){
    const firstByDay=new Map();
    for(const row of shown){
      const key=`${row.USERID}|${validDate(row.CHECKTIME)}`;
      const prior=firstByDay.get(key);
      if(!prior || String(row.CHECKTIME)<String(prior.CHECKTIME)) firstByDay.set(key,row);
    }
    shown=[...firstByDay.values()].sort((a,b)=>String(b.CHECKTIME).localeCompare(String(a.CHECKTIME)));
  }
  const content=$('content');content.replaceChildren();
  note(`عدد النتائج: ${shown.length}${records.length>=10000?' (أول 10000 سجل فقط)':''}`);
  if(view==='children' && youthEditor()){const b=document.createElement('button');b.textContent='＋ إضافة شاب جديد';b.className='add-youth';b.onclick=()=>openYouth();content.append(b);}
  if(!shown.length){const p=document.createElement('p');p.className='empty';p.textContent='لا توجد نتائج مطابقة.';content.append(p);return;}
  if(view==='home'||view==='classes'){
    content.append(summary([['عدد الفصول',shown.length],['إجمالي الشباب',shown.reduce((s,r)=>s+r.COUNT,0)]]));
    content.append(table(['رقم الفصل','اسم الفصل','عدد الشباب'],shown,['DEPTID','DEPTNAME','COUNT']));
  }else if(view==='children'){
    const t=table(['رقم البصمة','اسم الشاب','اسم الفصل','الخادم',...(youthEditor()?['الإجراءات']:[])],shown,['USERID','NAME','CLASS_NAME','TITLE']);
    if(youthEditor()) t.querySelectorAll('tbody tr').forEach((tr,i)=>{const td=document.createElement('td');const b=document.createElement('button');b.textContent='تعديل';b.className='light';b.onclick=()=>openYouth(shown[i].USERID);td.append(b);tr.append(td);});
    content.append(t);
  }else if(view==='unregistered'){
    const byUser=new Map();
    shown.forEach(p=>{
      if(!byUser.has(p.USERID))byUser.set(p.USERID,{USERID:p.USERID,COUNT:0,FIRST:p.CHECKTIME,LAST:p.CHECKTIME});
      const v=byUser.get(p.USERID);v.COUNT++;
      if(p.CHECKTIME<v.FIRST)v.FIRST=p.CHECKTIME;
      if(p.CHECKTIME>v.LAST)v.LAST=p.CHECKTIME;
    });
    const data=[...byUser.values()];
    note(`عدد أرقام البصمة غير المسجلة: ${data.length} — إجمالي البصمات: ${shown.length}`);
    content.append(table(['رقم البصمة','عدد البصمات','أول بصمة','آخر بصمة'],data,['USERID','COUNT','FIRST','LAST']));
  }else if(view==='attendance'||view==='reports'){
    const distinct=new Set(shown.map(r=>`${r.USERID}|${validDate(r.CHECKTIME)}`));
    content.append(summary([['سجلات الحضور (بدون تكرار)',shown.length],['أيام حضور الشباب',distinct.size]]));
    content.append(table(['رقم البصمة','الاسم','الفصل','التاريخ وأول وقت حضور'],shown,
      ['USERID','NAME','CLASS_NAME','CHECKTIME']));
  }
}
function csvExport(){
  if(!shown.length){setMessage('لا توجد بيانات للتصدير.');return;}
  const keys=view==='home'||view==='classes'?['DEPTID','DEPTNAME','COUNT']:
    view==='children'?['USERID','NAME','CLASS_NAME','TITLE']:
    ['USERID','NAME','CLASS_NAME','CHECKTIME'];
  const headings=view==='home'||view==='classes'?['رقم الفصل','اسم الفصل','عدد الشباب']:
    view==='children'?['رقم البصمة','الاسم','الفصل','الخادم']:
    ['رقم البصمة','الاسم','الفصل','التاريخ وأول وقت حضور'];
  const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const csv='\uFEFF'+[headings,...shown.map(r=>keys.map(k=>r[k]))].map(r=>r.map(esc).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`خدمة_متوسط_بنين_${view}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!sb){setMessage('بيانات Supabase غير مكتملة في config.js');return;}
  setMessage('جارٍ تسجيل الدخول...');
  const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  if(error){setMessage('تعذر تسجيل الدخول؛ راجع البريد الإلكتروني وكلمة المرور.');return;}
  setMessage('');await enter();
});
$('logout').addEventListener('click',async()=>{if(sb)await sb.auth.signOut();roles=[];toggleApp(false);});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>load(b.dataset.view)));
$('applyFilters').addEventListener('click',filter);
$('clearFilters').addEventListener('click',()=>{
  ['search','department','statusFilter','dateFrom','dateTo'].forEach(id=>$(id).value='');filter();
});
$('exportCsv').addEventListener('click',csvExport);
$('printPdf').addEventListener('click',()=>window.print());
if(sb)enter();else setMessage('قبل البدء، افتح config.js وضع Project URL وPublishable Key.');

const youthFields=[['USERID','رقم البصمة','number'],['NAME','اسم الشاب','text'],['DEFAULTDEPTID','الفصل','select'],
 ['TITLE','الخادم','text'],['GENDER','وظيفة الأب','text'],['BIRTHDAY','تاريخ الميلاد','date'],
 ['PAGER','هاتف الأب','tel'],['OPHONE','هاتف الأم','tel'],['FPHONE','هاتف الشاب','tel'],
 ['STREET','العنوان','text'],['CITY','المدينة','text'],['STATE','المنطقة','text']];
async function openYouth(id=null){
 if(!youthEditor())return;
 const dlg=$('youthDialog'),form=$('youthForm');form.replaceChildren();
 $('youthHeading').textContent=id?'تعديل بيانات الشاب':'إضافة شاب جديد';
 $('youthFeedback').textContent='';
 let data={};
 if(id){
  const {data:details,error}=await sb.rpc('get_youth_for_edit',{p_userid:id});
  if(error){setMessage('تعذر فتح بيانات الشاب: '+error.message);return;}
  data=details||{};
 }
 for(const [field,label,type] of youthFields){
  const wrap=document.createElement('label');wrap.textContent=label;
  let control;
  if(type==='select'){
   control=document.createElement('select');control.add(new Option('اختر الفصل',''));
   for(const [key,name] of deptMap)if(key!==1)control.add(new Option(name,String(key)));
  }else{control=document.createElement('input');control.type=type;}
  control.name=field;control.value=data[field]??'';
  if(field==='BIRTHDAY')control.value=String(data[field]||'').slice(0,10);
  if(field==='USERID'&&id)control.readOnly=true;
  if(['USERID','NAME','DEFAULTDEPTID'].includes(field))control.required=true;
  wrap.append(control);form.append(wrap);
 }
 dlg.showModal();
}
$('youthCancel').addEventListener('click',()=>$('youthDialog').close());
$('youthForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!youthEditor())return;
 const data=Object.fromEntries(new FormData(e.currentTarget).entries());
 const btn=$('youthSave');btn.disabled=true;$('youthFeedback').textContent='جارٍ الحفظ...';
 try{
  const {error}=await sb.rpc('manage_youth',{p_data:data});
  if(error)throw error;
  $('youthDialog').close();await load('children');setMessage('تم حفظ بيانات الشاب بنجاح.');
 }catch(err){$('youthFeedback').textContent='تعذر الحفظ: '+(err.message||'خطأ غير معروف');}
 finally{btn.disabled=false;}
});
