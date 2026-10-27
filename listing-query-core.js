/* On-demand Supabase reads; RPC integration retains RLS and legacy filter predicates. */
(function(root){
  'use strict';
  const tables={jobs:'job_posts',workers:'worker_profiles'};
  const columns={
    jobs:'id,legacy_id,owner_id,created_at,updated_at,title,description,city,area,work_date,work_date_end,date_mode,start_time,end_time,duration,payment_type,payment_amount,payment_min,payment_max,display_name,status,is_urgent',
    workers:'id,legacy_id,owner_id,created_at,updated_at,display_name,city,area,has_experience,experience_duration,payment_type,pay,availability,offer,about,avatar_path,status'
  };
  const unsupported=()=>{throw new Error('This filter requires the reviewed server search contract.');};
  const integer=(value,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new TypeError('Invalid pagination value');return value;};
  const literal=value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
  const pattern=value=>'%'+String(value).replace(/[\\%_]/g,'\\$&')+'%';
  function normalize(input={}){
    if(!Object.hasOwn(tables,input.kind))throw new TypeError('Invalid listing kind');
    if(Object.keys(input).some(k=>!['kind','page','size','sort','filters'].includes(k)))unsupported();
    const page=integer(input.page??1,1,Number.MAX_SAFE_INTEGER),size=integer(input.size??12,1,100);
    if(!Number.isSafeInteger((page-1)*size))throw new TypeError('Invalid page offset');
    const sort=input.sort||'newest';
    if(!['newest','oldest','price-asc','price-desc'].includes(sort))throw new TypeError('Invalid sort');
    if(input.kind==='jobs'&&sort.startsWith('price'))unsupported();
    const filters=input.filters||{};
    if(Object.keys(filters).some(k=>!['city','area','paymentType'].includes(k)))unsupported();
    for(const value of Object.values(filters))if(typeof value!=='string'||value.length>200)throw new TypeError('Invalid filter');
    if(filters.paymentType&&!['all','daily','hourly','fixed','negotiable'].includes(filters.paymentType))throw new TypeError('Invalid payment type');
    return {kind:input.kind,page,size,sort,filters:{city:filters.city||'',area:filters.area||'',paymentType:filters.paymentType||''}};
  }
  function filtered(query,filters){
    if(filters.city)query=query.ilike('city',pattern(filters.city));
    const area=filters.area.trim();
    if(area&&area!=='ყველა')query=query.or('area.is.null,area.eq."",area.ilike.'+literal(pattern(area)));
    const payment=filters.paymentType;
    if(payment&&payment!=='all')query=payment==='daily'?query.or('payment_type.eq.daily,payment_type.is.null'):query.eq('payment_type',payment);
    return query;
  }
  function ranked(query,rank){
    if(rank==='other')return query.or('status.is.null,status.not.in.(active,completed)');
    return rank?query.eq('status',rank):query;
  }
  function ordered(query,kind,sort){
    if(sort.startsWith('price'))return query.order('pay',{ascending:sort==='price-asc',nullsFirst:false}).order('id',{ascending:true});
    return query.order('created_at',{ascending:sort==='oldest',nullsFirst:sort==='oldest'}).order('id',{ascending:true});
  }
  async function checked(query){
    const result=await query;
    if(result.error)throw new Error('Listing query failed');
    return result;
  }
  function create(client){
    if(!client?.from)throw new TypeError('Supabase client required');
    const pending=new Map();
    let generation=0;
    function invalidate(){generation++;pending.clear();}
    async function execute(request){
      const {kind,page,size,sort,filters}=request;
      const ranks=kind==='jobs'?['active','completed','other']:[null];
      const counts=await Promise.all(ranks.map(async rank=>{
        const result=await checked(ranked(filtered(client.from(tables[kind]).select('id',{count:'exact',head:true}),filters),rank));
        if(!Number.isSafeInteger(result.count)||result.count<0)throw new Error('Missing exact result count');
        return result.count;
      }));
      const total=counts.reduce((sum,n)=>sum+n,0),pages=Math.ceil(total/size);
      const effectivePage=Math.max(1,Math.min(page,pages||1));
      let skip=(effectivePage-1)*size,remaining=size;
      const reads=[];
      for(let i=0;i<ranks.length;i++){
        if(skip>=counts[i]){skip-=counts[i];continue;}
        const take=Math.min(remaining,counts[i]-skip),start=skip;
        reads.push(checked(ordered(ranked(filtered(client.from(tables[kind]).select(columns[kind]),filters),ranks[i]),kind,sort).range(start,start+take-1)));
        remaining-=take;skip=0;if(!remaining)break;
      }
      const results=await Promise.all(reads);
      return {rows:results.flatMap(r=>r.data||[]),total,page:effectivePage,pages,size};
    }
    function page(input){
      const request=normalize(input),key=JSON.stringify(request);
      if(!pending.has(key)){
        const epoch=generation;
        const promise=execute(request).then(result=>{
          if(epoch!==generation)throw new Error('Listing request invalidated');
          return result;
        }).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});pending.set(key,promise);
      }
      return pending.get(key);
    }
    async function home({size=12,cursors={}}={}){
      integer(size,1,99);
      const epoch=generation;
      const results=await Promise.all(Object.keys(tables).map(async kind=>{
        let query=client.from(tables[kind]).select(columns[kind]).eq('status','active');
        const cursor=cursors[kind];
        if(cursor){
          if(!/^[0-9a-f-]{36}$/i.test(cursor.id)||cursor.createdAt!==null&&!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(cursor.createdAt))throw new TypeError('Invalid feed cursor');
          query=cursor.createdAt===null?query.is('created_at',null).gt('id',cursor.id):query.or('created_at.is.null,created_at.lt.'+literal(cursor.createdAt)+',and(created_at.eq.'+literal(cursor.createdAt)+',id.gt.'+cursor.id+')');
        }
        const result=await checked(query.order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:true}).range(0,size));
        return (result.data||[]).map(row=>({kind,row}));
      }));
      if(epoch!==generation)throw new Error('Listing request invalidated');
      const entries=results.flat().sort((a,b)=>{
        const time=(Date.parse(b.row.created_at)||0)-(Date.parse(a.row.created_at)||0);
        const aKey=(a.kind==='jobs'?'job':'worker')+':'+a.row.id,bKey=(b.kind==='jobs'?'job':'worker')+':'+b.row.id;
        return time||(aKey<bKey?-1:aKey>bKey?1:0);
      });
      const rows=entries.slice(0,size),next={...cursors};
      for(const {kind,row}of rows)next[kind]={id:row.id,createdAt:row.created_at??null};
      return {rows,cursors:next,hasMore:entries.length>size};
    }
    async function available(){
      const {data,error}=await client.rpc('pove_listing_candidates_v1',{p_kind:'capabilities'});
      if(error){if(['PGRST202','42883'].includes(error.code))return false;throw new Error('Listing service unavailable');}
      return data?.version===1;
    }
    async function rpcPage(input){
      const {kind,page:pageNumber=1,size=12,sort='newest',city='',paymentType='',id=null}=input;
      if(!['jobs','workers','home'].includes(kind))throw new TypeError('Invalid listing kind');
      integer(pageNumber,1,90071992547409);integer(size,1,100);
      if(!['newest','oldest','price-asc','price-desc'].includes(sort))throw new TypeError('Invalid sort');
      const epoch=generation;
      const result=await checked(client.rpc('pove_listing_candidates_v1',{
        p_kind:kind,p_page:pageNumber,p_size:size,p_sort:sort,p_city:city,p_payment:paymentType,p_id:id
      }));
      if(epoch!==generation)throw new Error('Listing request invalidated');
      const value=result.data;
      if(!value||!Array.isArray(value.rows)||!Number.isSafeInteger(value.total)||value.total<0||
        !Number.isSafeInteger(value.page)||value.page<1||value.pages!==Math.ceil(value.total/size)||
        value.size!==size||value.rows.length>size)throw new Error('Invalid listing response');
      return value;
    }
    async function compatiblePage(input, matches, residual=false, isCurrent=()=>true){
      if(!residual)return rpcPage(input);
      const size=integer(input.size??12,1,100),wanted=integer(input.page??1,1,90071992547409);
      const epoch=generation;let total=0,rows=[],last=[],candidatePage=1,expectedTotal;
      do {
        if(epoch!==generation||!isCurrent())throw new Error('Listing request invalidated');
        const batch=await rpcPage({...input,page:candidatePage,size:100});
        if(expectedTotal!==undefined&&batch.total!==expectedTotal||batch.page!==candidatePage&&batch.total>0)
          throw new Error('Listing results changed; retry');
        if(!isCurrent())throw new Error('Listing request invalidated');
        expectedTotal=batch.total;
        for(const row of batch.rows){
          if(!matches(row))continue;
          if(total%size===0)last=[];
          last.push(row);
          if(Math.floor(total/size)+1===wanted)rows.push(row);
          total++;
        }
        if(candidatePage>=batch.pages)break;
        if(!batch.rows.length)throw new Error('Incomplete listing page');
        candidatePage++;
      } while(true);
      const pages=Math.ceil(total/size),effectivePage=Math.max(1,Math.min(wanted,pages||1));
      return {rows:effectivePage===wanted?rows:last,total,page:effectivePage,pages,size};
    }
    return Object.freeze({page,home,invalidate,available,rpcPage,compatiblePage});
  }
  const api=Object.freeze({create,normalize});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PoveListingQueries=api;
})(typeof window==='undefined'?globalThis:window);
