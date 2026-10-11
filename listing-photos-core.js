/* Listing media is separate from account avatars. Public access is checked by RLS. */
(function(root) {
  'use strict';
  const MAX = 5, MAX_BYTES = 20 * 1024 * 1024, OUTPUT_MAX_BYTES = 5 * 1024 * 1024, BUCKET = 'listing-photos';
  const HEIF_ERROR = 'ამ ბრაუზერში HEIC/HEIF ფოტოს გარდაქმნა ვერ მოხერხდა. აირჩიეთ JPEG, PNG ან WebP ვერსია, ან სცადეთ Safari-ის განახლებული ვერსია.';
  const SETUP = 'ფოტოების საცავი ჯერ არ არის გამართული. შეგიძლია განცხადება ფოტოების გარეშე გამოაქვეყნო.';
  function assertCount(count) { if (count > MAX) throw Error('მაქსიმუმ 5 ფოტოს დამატება შეგიძლიათ'); }
  const photoKey = photo => photo.id || photo.localId || photo.remote?.id;
  function moveFirst(items,key) {
    const index=items.findIndex(item=>photoKey(item)===key);
    if(index<=0)return false;
    items.unshift(...items.splice(index,1));
    return true;
  }
  function movePhoto(items,key,offset) {
    if(offset!==-1&&offset!==1)return false;
    const index=items.findIndex(item=>photoKey(item)===key),next=index+offset;
    if(index<0||next<0||next>=items.length)return false;
    [items[index],items[next]]=[items[next],items[index]];
    return true;
  }
  async function validateFile(file) {
    if (!file || !file.size) throw Error('ფოტოს ფაილი ცარიელია.');
    if (file.size > MAX_BYTES) throw Error('ფოტოს ზომა 20 MB-ს აღემატება. აირჩიეთ უფრო მცირე ფაილი.');
    const b = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));
    const boxSize=b.length>=8?new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0):0;
    const brands=[];
    if(ascii(4,8)==='ftyp'&&boxSize>=16&&boxSize<=b.length){brands.push(ascii(8,12));for(let i=16;i+4<=boxSize;i+=4)brands.push(ascii(i,i+4));}
    const heif=brands.some(x=>['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1'].includes(x))&&!brands.some(x=>['avif','avis'].includes(x));
    const type = b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg'
      : [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v) ? 'image/png'
      : ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP' ? 'image/webp' : heif ? 'image/heif' : '';
    const mime=(file.type||'').toLowerCase();
    const allowed=type==='image/heif'?['image/heif','image/heic','image/heif-sequence','image/heic-sequence','application/octet-stream','']:['',type];
    if (!type || !allowed.includes(mime)) throw Error('აირჩიეთ ნამდვილი JPEG, PNG, WebP ან HEIC/HEIF ფოტო.');
    return type;
  }
  async function decodeImage(file,type) {
    // Runtime decoding, not user-agent detection. EXIF is applied once by the decoder.
    if(typeof createImageBitmap==='function')try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}
    if(typeof Image!=='undefined') {
      const url=URL.createObjectURL(file),img=new Image();img.decoding='async';
      try {
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('decode timeout')),30000);img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(Error('decode'));};img.src=url;});
        return {width:img.naturalWidth,height:img.naturalHeight,source:img,close:()=>{img.src='';URL.revokeObjectURL(url);}};
      }catch{img.src='';URL.revokeObjectURL(url);}
    }
    throw Error(type==='image/heif'?HEIF_ERROR:'ფოტოს გახსნა ვერ მოხერხდა. ფაილი შესაძლოა დაზიანებული იყოს. აირჩიეთ სხვა ფოტო.');
  }
  async function processFile(file) {
    const type=await validateFile(file);
    const bitmap=await decodeImage(file,type);
    let canvas;
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64000000) throw Error('ფოტოს გარჩევადობა ძალიან დიდია (მაქსიმუმ 64 მეგაპიქსელი).');
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(bitmap.source||bitmap, 0, 0, canvas.width, canvas.height);
      let blob;
      for(const quality of [.86,.8,.74]) {
        // Asynchronous encoding; never flatten transparency or upload the original.
        blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
        if(!blob||blob.type!=='image/webp'||!blob.size)throw Error('encode');
        if(blob.size<=1024*1024)break;
      }
      if (blob.size > OUTPUT_MAX_BYTES) throw Error('encode');
      return blob;
    } catch(error) {throw Error(error.message?.includes('64')?error.message:'ფოტოს დამუშავება ვერ მოხერხდა. აირჩიეთ სხვა ფოტო ან სცადეთ ხელახლა.');}
    finally { bitmap.close?.();if(canvas){canvas.width=1;canvas.height=1;} }
  }
  function repository(client, owner, currentOwner = () => owner) {
    const sameSession = () => { if(currentOwner()!==owner)throw Error('ანგარიში შეიცვალა. თავიდან გახსენი ფორმა.'); };
    const checked = async promise => { const result = await promise; sameSession(); if (result.error) throw result.error; return result.data; };
    const rpc = (name, args) => { sameSession(); return checked(client.rpc(name, args)); };
    return {
      async list(kind, id) { return await rpc('listing_photo_manifest', { p_kind:kind, p_listing:id }) || []; },
      async stage(blob) {
        const photo = await rpc('reserve_listing_photo', {});
        sameSession();
        try {await checked(client.storage.from(BUCKET).upload(photo.storage_path, blob, {contentType:'image/webp',upsert:false,cacheControl:'0'}));}
        catch {throw Error('ფოტოს ატვირთვა ვერ მოხერხდა. სცადეთ ხელახლა.');}
        return photo;
      },
      async capabilities() { return await rpc('listing_photo_capabilities', {}); },
      async preview(path) { sameSession(); return (await checked(client.storage.from(BUCKET).createSignedUrl(path, 60))).signedUrl; },
      async commit(kind, id, expected, selected) {
        assertCount(selected.length);
        return await rpc('commit_listing_photos', {p_kind:kind,p_listing:id,p_expected:expected,p_selected:selected}) || [];
      },
      async cleanup() {
        // Cleanup is a trusted scheduled service; browsers cannot delete metadata or objects.
        // Kept as a no-op to preserve save/retry behavior for existing callers.
      }
    };
  }
  async function saveWithPhotos({state, row, kind, repo, saveListing}) {
    assertCount(state.items.length);
    if (state.dirty) {
      if (!state.loaded) throw Error(SETUP);
      for (const item of state.items) {
        if (item.blob && !item.remote) item.remote = await repo.stage(item.blob);
      }
    }
    // Retry the same identity after a partial save; never create another listing.
    const saved = await saveListing(kind, row);
    state.savedRow = saved;
    if (state.dirty) {
      const ids = state.items.map(item => item.remote?.id || item.id);
      try {
        const manifest = await repo.commit(kind, saved.uuid, state.expected, ids);
        state.expected = manifest.map(item => item.id);
        state.items = manifest;
        state.dirty = false;
      } catch (error) {
        // A response may be lost after commit. Recover by reading, not deleting.
        const current = await repo.list(kind, saved.uuid).catch(() => null);
        if (current && current.length === ids.length && current.every((item,index) => item.id===ids[index])) {
          state.expected = current.map(item => item.id); state.items = current; state.dirty = false;
        } else throw Error('განცხადება შენახულია, მაგრამ ფოტოები ვერ შეინახა. არჩეული ფოტოები შენარჩუნებულია — სცადე ხელახლა.');
      }
      await repo.cleanup().catch(() => {}); // Retired files remain recoverably queued on failure.
    }
    return saved;
  }
  const api = {MAX,MAX_BYTES,OUTPUT_MAX_BYTES,BUCKET,SETUP,photoKey,moveFirst,movePhoto,assertCount,validateFile,processFile,repository,saveWithPhotos};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PoveListingPhotoCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
