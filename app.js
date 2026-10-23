
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);
const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_PROJECT_REF')
  && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
let roles=[], view='home', records=[], shown=[], deptMap=new Map(), youthMap=new Map();
const admin = () => roles.includes('super_admin');
const churchAdmin = () => roles.includes('church_admin');
const parentManager = () => admin() || churchAdmin();
const attendanceAdmin = () => roles.some(x=>['super_admin','attendance_manager'].includes(x));
const unregisteredViewer = () => roles.some(x=>['super_admin','church_admin','attendance_manager'].includes(x));
const youthEditor = () => roles.some(x=>['super_admin','church_admin','servant'].includes(x));
const parent = () => roles.includes('parent') && !roles.some(x=>x!=='parent');
const setMessage = text => $('message').textContent = text || '';
const note = text => $('notice').textContent = text || '';
const title = text => $('sectionTitle').textContent = text;
const clean = text => String(text ?? '').toLocaleLowerCase('ar').trim();
const validDate = d => String(d || '').slice(0,10);
// Display the local wall-clock time recorded by the fingerprint device; no UTC conversion.
function formatChecktime(raw){
  const s=String(raw||'').replace('T',' ');
  const m=s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if(!m)return s;
  const hour=Number(m[2]);
  return `${m[1]}   ${hour%12||12}:${m[3]}:${m[4]} ${hour>=12?'PM':'AM'}`;
}
function sortRows(rows){
  const key=document.getElementById('sortField')?.value||'CHECKTIME';
  const direction=document.getElementById('sortDirection')?.value==='asc'?1:-1;
  return [...rows].sort((a,b)=>{
    const av=a[key]??'',bv=b[key]??'';
    const cmp=['USERID','DEPTID','COUNT'].includes(key)?Number(av)-Number(bv):
      String(av).localeCompare(String(bv),'ar',{numeric:true,sensitivity:'base'});
    return direction*cmp;
  });
}
function ensureSorting(){
  if(document.getElementById('sortField'))return;
  const target=document.getElementById('applyFilters');
  if(!target)return;
  const wrapper=document.createElement('div');wrapper.className='sort-controls';
  wrapper.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0;';
  const label=document.createElement('label');label.textContent='ترتيب حسب: ';
  const select=document.createElement('select');select.id='sortField';
  [['CHECKTIME','التاريخ وأول وقت حضور'],['NAME','الاسم'],['CLASS_NAME','الفصل'],['USERID','رقم البصمة']].forEach(([value,name])=>select.add(new Option(name,value)));
  const dir=document.createElement('select');dir.id='sortDirection';
  dir.add(new Option('تنازلي','desc'));dir.add(new Option('تصاعدي','asc'));
  select.onchange=filter;dir.onchange=filter;
  label.append(select);wrapper.append(label,dir);
  target.parentElement.append(wrapper);
}
function updateSorting(){
  ensureSorting();
  const wrap=document.querySelector('.sort-controls');if(!wrap)return;
  wrap.hidden=['users','import','account'].includes(view);
  const field=document.getElementById('sortField');
  const allowed=['home','classes'].includes(view)?[['DEPTID','رقم الفصل'],['DEPTNAME','اسم الفصل'],['COUNT','عدد الشباب']]:
    view==='children'?[['USERID','رقم البصمة'],['NAME','الاسم'],['CLASS_NAME','الفصل'],['TITLE','الخادم']]:
    [['CHECKTIME','التاريخ وأول وقت حضور'],['NAME','الاسم'],['CLASS_NAME','الفصل'],['USERID','رقم البصمة']];
  const previous=field.value;
  field.replaceChildren(...allowed.map(([value,label])=>new Option(label,value)));
  field.value=allowed.some(([v])=>v===previous)?previous:allowed[0][0];
}


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
  $('roleLabel').textContent=admin()?'مدير النظام':churchAdmin()?'مسؤول الخدمة':roles.includes('servant')?'خادم':roles.includes('attendance_manager')?'مسؤول الحضور':'ولي أمر';
  for(const b of document.querySelectorAll('[data-view]')){
    const v=b.dataset.view;
    b.hidden=(['users','classes'].includes(v)&&!admin()&&v==='users') || (v==='classes'&&!admin()&&!churchAdmin()&& !roles.includes('servant')) || (v==='import'&&!attendanceAdmin()) || (v==='unregistered'&&!unregisteredViewer())
      || (v==='parents'&&!parentManager()) || (parent()&& !['home','attendance','reports','account'].includes(v));
  }
  toggleApp(true);
  await loadDepartments();
  await load('home');
}
async function load(v){
  if(!sb)return;
  if(parent()&& !['home','attendance','reports','account'].includes(v)){setMessage('غير مصرح لك بعرض هذه الشاشة.');return;}
  if(((v==='users'&&!admin()) || (v==='parents'&&!parentManager())) || (v==='import'&&!attendanceAdmin()) || (v==='unregistered'&&!unregisteredViewer())){setMessage('غير مصرح لك بعرض هذه الشاشة.');return;}
  $('datImporter').hidden=v!=='import';view=v;records=[];shown=[];setMessage('');note('جارٍ تحميل البيانات...');
  $('content').replaceChildren();
  updateSorting();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  const names={home:'القائمة الرئيسية - خدمة متوسط بنين',children:'إدارة الشباب',classes:'عرض الفصول - خدمة متوسط بنين',
    attendance:'سجل الحضور والبصمات',unregistered:'البصمات غير المسجلة',reports:'التقارير',users:'إدارة المستخدمين',parents:'ربط أولياء الأمور بالأبناء',account:'حسابي - تغيير كلمة المرور',import:'استيراد ملف البصمة الأسبوعي'};
  title(names[v]||'خدمة متوسط بنين');
  $('filterCard').hidden=['users','parents','import','account'].includes(v);
  $('exportCsv').hidden=['users','parents','import','account'].includes(v);
  $('printPdf').hidden=['users','parents','import','account'].includes(v);
  $('department').closest('label').hidden=parent()||v==='unregistered';
  $('dateFrom').closest('label').hidden=['children','classes','home','users','parents','account'].includes(v);
  $('dateTo').closest('label').hidden=['children','classes','home','users','parents','account'].includes(v);
  $('statusLabel').hidden=!['unregistered'].includes(v);
  try{
    if(parent() && ['home','attendance','reports'].includes(v)){await renderParentPortal();return;}
    if(v==='parents'){await renderParentManagement();return;}
    if(v==='import'){note('اختَر ملف DAT لمراجعته قبل الاستيراد.');return;}
    if(v==='home' && !parent()){await renderDashboard();return;}
    if(v==='account'){renderAccount();note('يمكنك تغيير كلمة مرور حسابك.');return;}
    if(v==='users'){
      note('يمكن لمدير النظام إنشاء الحسابات وإعادة تعيين كلمات المرور.');
      await renderAdminUsers();
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
  shown=sortRows(shown);
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
    content.append(table(['رقم البصمة','الاسم','الفصل','التاريخ وأول وقت حضور'],shown.map(r=>({...r,CHECKTIME:formatChecktime(r.CHECKTIME)})),
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
  const csv='\uFEFF'+[headings,...shown.map(r=>keys.map(k=>k==='CHECKTIME'?formatChecktime(r[k]):r[k]))].map(r=>r.map(esc).join(',')).join('\r\n');
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


// Weekly biometric-device DAT import: parse locally; server validates again.
let pendingDat=[];
const datFile=$('datFile'),datPreview=$('datPreview'),datResult=$('datResult'),datUpload=$('datUpload');
function datNumber(s,optional=false){
  const v=String(s??'').trim();
  if(optional&&v==='')return null;
  if(!/^\d{1,9}$/.test(v))throw new Error('رقم غير صحيح في ملف DAT');
  return Number(v);
}
function parseDat(text){
  const rows=[];const invalid=[];const seen=new Set();let duplicateFile=0;
  text.replace(/^\uFEFF/,'').split(/\r?\n/).forEach((raw,index)=>{
    const line=raw.trim();if(!line)return;
    const fields=line.split(/\t+/);
    if(fields.length!==6){invalid.push(index+1);return;}
    try{
      const uid=datNumber(fields[0]);
      const stamp=fields[1].trim();
      if(uid<=0||!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(stamp))throw Error();
      const iso=stamp.replace('T',' ');
      const d=new Date(stamp.replace(' ','T'));
      if(Number.isNaN(d.getTime())||d.getFullYear()!==Number(stamp.slice(0,4))||d.getMonth()+1!==Number(stamp.slice(5,7))||d.getDate()!==Number(stamp.slice(8,10)))throw Error();
      const sensor=datNumber(fields[2],true);
      const checktype=fields[3].trim();
      if(checktype.length>30)throw Error();
      const verify=datNumber(fields[4],true),work=datNumber(fields[5],true);
      const key=`${uid}|${iso}|${sensor??''}`;
      if(seen.has(key)){duplicateFile++;return;}seen.add(key);
      rows.push({USERID:uid,CHECKTIME:iso,SENSORID:sensor,CHECKTYPE:checktype||null,VERIFYCODE:verify,WorkCode:work});
    }catch{invalid.push(index+1)}
  });
  return {rows,invalid,duplicateFile};
}
datFile.addEventListener('change',async()=>{
  pendingDat=[];datUpload.disabled=true;datResult.textContent='';datPreview.textContent='';
  const file=datFile.files?.[0];if(!file)return;
  if(!/\.(dat|txt)$/i.test(file.name)||file.size>5*1024*1024){datPreview.textContent='اختر ملف DAT أو TXT حجمه أقل من 5 MB.';return;}
  try{
    const parsed=parseDat(await file.text());
    if(parsed.invalid.length){datPreview.textContent=`لم يتم الاستيراد: ${parsed.invalid.length} سطر غير مطابق. أمثلة: ${parsed.invalid.slice(0,8).join('، ')}. راجع الملف أولاً.`;return;}
    pendingDat=parsed.rows;
    const ids=new Set(pendingDat.map(r=>r.USERID));
    datPreview.textContent=`جاهز للمراجعة: ${pendingDat.length} بصمة، ${ids.size} رقم شاب، ${parsed.duplicateFile} تكرار داخل الملف تم تجاهله. أول تاريخ: ${pendingDat.reduce((a,r)=>!a||r.CHECKTIME<a?r.CHECKTIME:a,'')}؛ آخر تاريخ: ${pendingDat.reduce((a,r)=>r.CHECKTIME>a?r.CHECKTIME:a,'')}.`;
    datUpload.disabled=!pendingDat.length;
  }catch(err){datPreview.textContent='تعذر قراءة الملف: '+err.message;}
});
datUpload.addEventListener('click',async()=>{
  if(!attendanceAdmin()||!pendingDat.length||!sb)return;
  datUpload.disabled=true;let inserted=0,skipped=0;
  try{
    for(let i=0;i<pendingDat.length;i+=200){
      datResult.textContent=`جارٍ الاستيراد: ${Math.min(i+200,pendingDat.length)} من ${pendingDat.length}`;
      const {data,error}=await sb.rpc('import_weekly_dat',{p_rows:pendingDat.slice(i,i+200)});
      if(error)throw error;
      inserted+=Number(data?.inserted||0);skipped+=Number(data?.skipped||0);
    }
    datResult.textContent=`تم الاستيراد بنجاح: ${inserted} بصمة جديدة، و${skipped} بصمة موجودة بالفعل. يمكن إعادة رفع نفس الملف بأمان.`;
    pendingDat=[];datFile.value='';
  }catch(err){datResult.textContent=`توقف الاستيراد بعد حفظ ${inserted} بصمة جديدة. ${err.message}. يمكنك إعادة رفع نفس الملف بدون تكرار.`;datUpload.disabled=false;}
});


// Secure administration: all privileged actions execute inside the Supabase Edge Function.
async function adminApi(action, payload={}) {
  if(!admin()) throw new Error('هذه العملية لمدير النظام فقط.');
  const {data:{session},error:sessionError}=await sb.auth.getSession();
  if(sessionError || !session?.access_token) throw new Error('انتهت الجلسة. سجل الدخول مرة أخرى.');
  const response=await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/functions/v1/admin-users`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({action,...payload})
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.error || `خطأ HTTP ${response.status}`);
  return body;
}
function makeField(label,type='text',required=true){
  const holder=document.createElement('label');holder.textContent=label;
  const input=document.createElement('input');input.type=type;input.required=required;
  holder.append(input);return [holder,input];
}
async function renderAdminUsers(){
  if(!admin())return;
  const root=$('content');root.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='إضافة حساب خادم جديد';root.append(heading);
  const form=document.createElement('form');form.className='youth-form';
  const [nameBox,name]=makeField('الاسم الكامل');
  const [emailBox,email]=makeField('البريد الإلكتروني','email');
  const roleBox=document.createElement('label');roleBox.textContent='المجموعة';
  const role=document.createElement('select');
  [['church_admin','Church Admin'],['servant','Servant'],['attendance_manager','Attendance Manager']].forEach(([v,t])=>role.add(new Option(t,v)));
  roleBox.append(role);form.append(nameBox,emailBox,roleBox);
  const submit=document.createElement('button');submit.type='submit';submit.textContent='إنشاء الحساب';form.append(submit);
  const created=document.createElement('p');created.setAttribute('role','status');
  form.onsubmit=async e=>{
    e.preventDefault();submit.disabled=true;created.textContent='جارٍ إنشاء الحساب...';
    try{
      const result=await adminApi('create',{full_name:name.value.trim(),email:email.value.trim(),role:role.value});
      created.replaceChildren();
      const info=document.createElement('strong');info.textContent=`تم إنشاء ${result.email}. كلمة المرور المؤقتة: `;
      const secret=document.createElement('code');secret.textContent=result.temporary_password;
      const copy=document.createElement('button');copy.type='button';copy.textContent='نسخ كلمة المرور';copy.onclick=()=>navigator.clipboard.writeText(result.temporary_password);
      created.append(info,secret,document.createTextNode(' '),copy);
      form.reset();await loadAdminList(root);
    }catch(err){created.textContent='تعذر الإنشاء: '+err.message;}
    finally{submit.disabled=false;}
  };
  root.append(form,created);
  const divider=document.createElement('hr');root.append(divider);
  const listHeading=document.createElement('h3');listHeading.textContent='الحسابات وإعادة تعيين كلمة المرور';root.append(listHeading);
  const listArea=document.createElement('div');listArea.id='adminUsersList';root.append(listArea);
  await loadAdminList(root);
}
async function loadAdminList(root){
  const target=root.querySelector('#adminUsersList');if(!target)return;
  target.textContent='جارٍ تحميل الحسابات...';
  try{
    const {users}=await adminApi('list');target.replaceChildren();
    const search=document.createElement('input');search.placeholder='بحث بالاسم أو البريد الإلكتروني';
    search.style.cssText='width:100%;max-width:450px;margin:10px 0;padding:10px;';target.append(search);
    const rows=document.createElement('div');target.append(rows);
    const render=()=>{
      rows.replaceChildren();const q=clean(search.value);
      const filtered=users.filter(u=>clean(`${u.full_name} ${u.email} ${u.role}`).includes(q));
      const tbl=document.createElement('table');
      const th=document.createElement('thead');const hr=document.createElement('tr');
      ['الاسم','البريد الإلكتروني','المجموعة','الإجراء'].forEach(s=>{const c=document.createElement('th');c.textContent=s;hr.append(c)});
      th.append(hr);tbl.append(th);const tbody=document.createElement('tbody');
      filtered.forEach(u=>{
        const tr=document.createElement('tr');
        [u.full_name,u.email,u.role].forEach(v=>{const td=document.createElement('td');td.textContent=v||'—';tr.append(td)});
        const td=document.createElement('td');const btn=document.createElement('button');btn.textContent='Reset Password';btn.className='light';
        btn.onclick=async()=>{
          if(!confirm(`تعيين كلمة مرور مؤقتة جديدة للحساب ${u.email}؟`))return;
          btn.disabled=true;
          try{
            const result=await adminApi('reset_password',{user_id:u.id});
            const box=document.createElement('div');box.style.marginTop='8px';
            const secret=document.createElement('code');secret.textContent=result.temporary_password;
            const cp=document.createElement('button');cp.type='button';cp.textContent='نسخ';cp.onclick=()=>navigator.clipboard.writeText(result.temporary_password);
            box.append(document.createTextNode('كلمة المرور المؤقتة: '),secret,document.createTextNode(' '),cp);
            td.append(box);
          }catch(err){alert('تعذر التغيير: '+err.message)}finally{btn.disabled=false;}
        };
        td.append(btn);tr.append(td);tbody.append(tr);
      });tbl.append(tbody);const wrap=document.createElement('div');wrap.className='table-wrap';wrap.append(tbl);rows.append(wrap);
      note(`عدد الحسابات: ${filtered.length}`);
    };
    search.oninput=render;render();
  }catch(err){target.textContent='تعذر تحميل الحسابات: '+err.message;}
}
function renderAccount(){
  const root=$('content');root.replaceChildren();
  const form=document.createElement('form');form.className='youth-form';
  const [currentBox,current]=makeField('كلمة المرور الحالية','password');
  const [nextBox,next]=makeField('كلمة المرور الجديدة (12 حرفاً على الأقل)','password');
  const [confirmBox,confirmPassword]=makeField('تأكيد كلمة المرور الجديدة','password');
  current.autocomplete='current-password';next.autocomplete='new-password';confirmPassword.autocomplete='new-password';
  next.minLength=12;confirmPassword.minLength=12;
  const submit=document.createElement('button');submit.textContent='تغيير كلمة المرور';
  const msg=document.createElement('p');msg.setAttribute('role','status');
  form.append(currentBox,nextBox,confirmBox,submit,msg);
  form.onsubmit=async e=>{
    e.preventDefault();msg.textContent='';
    if(next.value!==confirmPassword.value){msg.textContent='كلمتا المرور غير متطابقتين.';return;}
    if(next.value===current.value){msg.textContent='اختر كلمة مرور مختلفة عن الحالية.';return;}
    submit.disabled=true;
    try{
      const {data:{user}}=await sb.auth.getUser();if(!user?.email)throw new Error('تعذر تحديد المستخدم');
      const {error:verifyError}=await sb.auth.signInWithPassword({email:user.email,password:current.value});
      if(verifyError)throw new Error('كلمة المرور الحالية غير صحيحة.');
      const {error}=await sb.auth.updateUser({password:next.value});if(error)throw error;
      msg.textContent='تم تغيير كلمة المرور بنجاح.';form.reset();
    }catch(err){msg.textContent='تعذر تغيير كلمة المرور: '+err.message;}
    finally{submit.disabled=false;}
  };root.append(form);
}


// Weekly dashboard: each registered youth is counted at most once per selected Thursday.
// Absence is a roster-minus-punch estimate; it is not proof of absence before DAT upload.
async function renderDashboard(){
  const root=$('content');root.replaceChildren();
  const youth=await loadYouth();
  const punches=await allRows((a,b)=>sb.from('checkinout').select('USERID,CHECKTIME').order('CHECKTIME',{ascending:false}).range(a,b));
  const iso=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const thursday=s=>{const d=new Date(`${s}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+3)%7);return iso(d)};
  const punchDates=punches.map(p=>validDate(p.CHECKTIME)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));
  const today=iso(new Date());
  const defaultWeek=thursday(punchDates.length?punchDates[0]:today);
  const controls=document.createElement('div');controls.className='dash-controls';
  const label=document.createElement('label');label.textContent='أسبوع الخدمة (الخميس): ';
  const week=document.createElement('input');week.type='date';week.value=defaultWeek;label.append(week);
  const explanation=document.createElement('p');explanation.className='dash-help';explanation.textContent='الحضور = شاب له بصمة يوم الخميس المختار. الغياب تقديري من قائمة الشباب المسجلين، ويتطلب رفع ملف DAT أولاً.';
  controls.append(label,explanation);root.append(controls);
  const area=document.createElement('div');root.append(area);
  const draw=()=>{
    area.replaceChildren();
    const day=week.value;if(!day){area.textContent='اختر تاريخاً.';return;}
    const target=thursday(day);if(target!==day)week.value=target;
    const roster=youth.filter(u=>u.DEFAULTDEPTID!=null && deptMap.has(u.DEFAULTDEPTID));
    const known=new Set(roster.map(u=>Number(u.USERID)));
    const present=new Set(punches.filter(p=>validDate(p.CHECKTIME)===target && known.has(Number(p.USERID))).map(p=>Number(p.USERID)));
    const rawCount=punches.filter(p=>validDate(p.CHECKTIME)===target).length;
    const total=roster.length, attended=present.size, absent=total-attended;
    const pct=total?100*attended/total:0;
    area.append(summary([['إجمالي الشباب المسجلين',total],['الحاضرون',attended],['بدون بصمة',absent],['نسبة الحضور',pct.toFixed(1)+'%']]));
    const warn=document.createElement('p');warn.className='dash-help';warn.textContent=rawCount?`تاريخ الخدمة: ${target} — عدد البصمات الخام: ${rawCount}.`:`لا توجد بصمات مسجلة بتاريخ ${target}. تأكد من رفع ملف DAT قبل اعتبار أي شاب غائباً.`;area.append(warn);
    const heading=document.createElement('h3');heading.textContent='الحضور حسب الفصل';area.append(heading);
    const classes=[...deptMap.entries()].filter(([id])=>roster.some(u=>u.DEFAULTDEPTID===id)).map(([id,name])=>{
      const students=roster.filter(u=>u.DEFAULTDEPTID===id),yes=students.filter(u=>present.has(Number(u.USERID))).length;
      return {name,total:students.length,yes,no:students.length-yes,pct:students.length?yes/students.length*100:0};
    });
    const chart=document.createElement('div');chart.className='dash-chart';
    classes.forEach(c=>{const item=document.createElement('div');item.className='dash-item';
      const header=document.createElement('div');header.className='dash-item-head';
      const name=document.createElement('strong');name.textContent=c.name;
      const rate=document.createElement('span');rate.textContent=`${c.yes} / ${c.total} (${c.pct.toFixed(1)}%)`;
      header.append(name,rate);const track=document.createElement('div');track.className='dash-track';
      const fill=document.createElement('div');fill.className='dash-fill';fill.style.width=c.pct+'%';track.append(fill);item.append(header,track);chart.append(item);
    });area.append(chart);
    area.append(table(['الفصل','إجمالي الشباب','الحاضرون','بدون بصمة','نسبة الحضور'],classes.map(c=>({'name':c.name,'total':c.total,'yes':c.yes,'no':c.no,'rate':c.pct.toFixed(1)+'%'})),['name','total','yes','no','rate']));
    const absentHeading=document.createElement('h3');absentHeading.textContent='الشباب بدون بصمة في الأسبوع المختار';area.append(absentHeading);
    const missing=roster.filter(u=>!present.has(Number(u.USERID))).map(u=>({USERID:u.USERID,NAME:u.NAME,CLASS_NAME:deptMap.get(u.DEFAULTDEPTID)||'—'}));
    area.append(table(['رقم البصمة','الاسم','الفصل'],missing,['USERID','NAME','CLASS_NAME']));
    note(`لوحة متابعة أسبوع ${target} — ${attended} حاضر من ${total} شاب مسجل`);
  };
  week.addEventListener('change',draw);draw();
}


// Parent portal: private data is returned ONLY by the server after checking the session.
async function parentApi(action, payload={}){
  const {data:{session},error}=await sb.auth.getSession();
  if(error || !session?.access_token) throw new Error('يرجى تسجيل الدخول مجدداً.');
  const response=await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/functions/v1/parent-portal`,{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({action,...payload})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}
async function renderParentPortal(){
  const root=$('content');root.replaceChildren();
  note('جارٍ تحميل بيانات الأبناء...');
  const {children}=await parentApi('my_children');
  note(`الأبناء المرتبطون بحسابك: ${children.length}`);
  if(!children.length){root.textContent='لا يوجد أبناء مرتبطون بحسابك حتى الآن. تواصل مع مسؤول الخدمة لربط حسابك.';return;}
  const intro=document.createElement('p');intro.textContent='سجل حضور أبنائك فقط. الأيام بدون بصمة لا تعني غياباً مؤكداً إلا بعد اكتمال رفع الملف.';root.append(intro);
  for(const child of children){
    const section=document.createElement('section');section.className='parent-child-card';
    const heading=document.createElement('h3');heading.textContent=child.name;section.append(heading);
    const sub=document.createElement('p');sub.textContent=`الفصل: ${child.class_name||'غير محدد'} — رقم البصمة: ${child.user_id}`;section.append(sub);
    const dates=[...new Set((child.attendance||[]).map(a=>validDate(a.checktime)))].sort().reverse();
    const count=document.createElement('p');count.textContent=`أيام الحضور المسجلة: ${dates.length}`;section.append(count);
    const rows=dates.map(day=>({date:day,time:formatChecktime((child.attendance||[]).filter(a=>validDate(a.checktime)===day).map(a=>a.checktime).sort()[0])}));
    section.append(table(['تاريخ الحضور','أول بصمة'],rows,['date','time']));root.append(section);
  }
}
async function renderParentManagement(){
  if(!parentManager())throw new Error('هذه الصفحة لمدير النظام أو مسؤول الخدمة فقط.');
  const root=$('content');root.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='إنشاء حساب ولي أمر وربط الأبناء';root.append(heading);
  const form=document.createElement('form');form.className='youth-form';
  const [nameBox,name]=makeField('اسم ولي الأمر');const [emailBox,email]=makeField('البريد الإلكتروني','email');
  const create=document.createElement('button');create.type='submit';create.textContent='إنشاء حساب ولي أمر';
  const result=document.createElement('p');result.setAttribute('role','status');form.append(nameBox,emailBox,create,result);root.append(form);
  form.onsubmit=async e=>{e.preventDefault();create.disabled=true;result.textContent='جارٍ الإنشاء...';try{
    const r=await parentApi('create_parent',{full_name:name.value.trim(),email:email.value.trim()});
    result.textContent=`تم إنشاء الحساب: ${r.email} — كلمة المرور المؤقتة: ${r.temporary_password} (انسخها الآن، ولا تشاركها علناً)`;
    await loadLinks();
  }catch(err){result.textContent='خطأ: '+err.message;}finally{create.disabled=false;}};
  const linkTitle=document.createElement('h3');linkTitle.textContent='ربط ابن بحساب ولي أمر';root.append(linkTitle);
  const linkForm=document.createElement('form');linkForm.className='youth-form';
  const [parentBox,parentEmail]=makeField('بريد ولي الأمر','email');const [childBox,childId]=makeField('رقم بصمة الشاب','number');
  const relationshipBox=document.createElement('label');relationshipBox.textContent='صلة القرابة';const relationship=document.createElement('select');
  [['father','الأب'],['mother','الأم'],['guardian','ولي أمر']].forEach(([v,l])=>relationship.add(new Option(l,v)));relationshipBox.append(relationship);
  const link=document.createElement('button');link.type='submit';link.textContent='ربط الابن';const feedback=document.createElement('p');
  linkForm.append(parentBox,childBox,relationshipBox,link,feedback);root.append(linkForm);
  linkForm.onsubmit=async e=>{e.preventDefault();link.disabled=true;try{
    await parentApi('link_child',{parent_email:parentEmail.value.trim(),user_id:Number(childId.value),relationship:relationship.value});
    feedback.textContent='تم الربط بنجاح.';await loadLinks();
  }catch(err){feedback.textContent='تعذر الربط: '+err.message;}finally{link.disabled=false;}};
  const list=document.createElement('div');root.append(list);
  async function loadLinks(){list.textContent='جارٍ تحميل الروابط...';try{
    const {links}=await parentApi('list_links');list.replaceChildren();
    const rows=links.map(l=>({email:l.email,name:l.name,child:l.child_name,user_id:l.user_id,relationship:l.relationship}));
    list.append(table(['بريد ولي الأمر','الاسم','الشاب','رقم البصمة','صلة القرابة'],rows,['email','name','child','user_id','relationship']));
    for(const [i,l] of links.entries()){
      const tr=list.querySelectorAll('tbody tr')[i];const td=document.createElement('td');const btn=document.createElement('button');btn.className='light';btn.textContent='إلغاء الربط';
      btn.onclick=async()=>{if(!confirm('هل تريد إلغاء ربط هذا الابن؟'))return;btn.disabled=true;try{await parentApi('unlink_child',{parent_id:l.parent_id,user_id:l.user_id});await loadLinks();}catch(e){alert(e.message);btn.disabled=false;}};
      td.append(btn);tr.append(td);
    }
  }catch(err){list.textContent='تعذر تحميل الروابط: '+err.message;}}
  await loadLinks();
}
