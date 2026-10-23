import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $ = id => document.getElementById(id);
const message = txt => { $('message').textContent = txt || ''; };
const configured = !SUPABASE_URL.includes('YOUR_PROJECT_REF') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
if (!configured) message('افتح ملف config.js وضع Project URL وPublishable Key أولاً.');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
let roles = [];
function cell(row, val){const td=document.createElement('td');td.textContent=val == null ? '' : String(val);row.append(td);}
function table(headers, data, keys){const wrap=document.createElement('div');wrap.className='table-wrap';const t=document.createElement('table');const tr=document.createElement('tr');headers.forEach(h=>{const th=document.createElement('th');th.textContent=h;tr.append(th)});const thead=document.createElement('thead');thead.append(tr);t.append(thead);const tbody=document.createElement('tbody');data.forEach(item=>{const r=document.createElement('tr');keys.forEach(k=>cell(r,item[k]));tbody.append(r)});t.append(tbody);wrap.append(t);return wrap;}
function show(view){$('login').hidden=view==='app';$('app').hidden=view!=='app';}
async function initialize(){if(!sb)return;const {data:{user},error}=await sb.auth.getUser();if(error||!user){show('login');return;}
 const {data:account,error:ae}=await sb.from('APP_USERS').select('FULL_NAME,IS_ACTIVE').eq('AUTH_USER_ID',user.id).maybeSingle();
 const {data:roleRows,error:re}=await sb.from('APP_USER_ROLES').select('ROLE').eq('AUTH_USER_ID',user.id);
 if(ae||re||!account?.IS_ACTIVE||!roleRows?.length){await sb.auth.signOut();show('login');message('الحساب غير مفعل أو ليس له صلاحيات.');return;}
 roles=roleRows.map(x=>x.ROLE);$('who').textContent=account.FULL_NAME||user.email;show('app');
 const parentOnly=roles.every(r=>r==='parent');
 document.querySelector('[data-view="children"]').hidden=parentOnly;
 document.querySelector('[data-view="unregistered"]').hidden=!roles.some(r=>['super_admin','church_admin','attendance_manager'].includes(r));
 await load(parentOnly?'attendance':'children');
}
async function load(view){if(!sb)return;message('');$('content').replaceChildren();$('notice').textContent='جارٍ تحميل البيانات...';let query;
 if(view==='children'){
  if(roles.every(r=>r==='parent')){$('notice').textContent='غير مصرح';return;}
  query=sb.from('USERINFO').select('USERID,NAME,DEFAULTDEPTID').order('NAME').limit(200);
 } else if(view==='attendance'){
  query=sb.from('checkinout').select('USERID,CHECKTIME').order('CHECKTIME',{ascending:false}).limit(200);
 } else if(view==='unregistered'){
  // A secured backend endpoint is required for a cross-table orphan report.
  $('notice').textContent='تقرير البصمات غير المسجلة سيتم تفعيله من خلال API آمن في المرحلة التالية.';return;
 }else return;
 const {data,error}=await query;
 if(error){$('notice').textContent='تعذر تحميل البيانات.';message(error.message);return;}
 $('notice').textContent=`عدد السجلات المعروضة: ${data.length} (بحد أقصى 200 سجل)`;
 $('content').append(view==='children'?table(['رقم الطفل','الاسم','رقم الفصل'],data,['USERID','NAME','DEFAULTDEPTID']):table(['رقم الطفل','وقت البصمة'],data,['USERID','CHECKTIME']));
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!sb)return;message('');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){message('فشل تسجيل الدخول. تأكد من البريد وكلمة المرور.');return;}await initialize();});
$('logout').addEventListener('click',async()=>{if(sb)await sb.auth.signOut();roles=[];show('login');message('');});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>load(b.dataset.view)));
initialize();
