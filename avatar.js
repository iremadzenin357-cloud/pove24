/* Shared profile avatar renderer. Photo references may later be hosted URLs. */
const avatarSizeMap={sm:34,md:46,lg:82,profile:116};
function avatarEscape(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function resolveAvatarProfile(profile){
 const source=typeof profile==='string'?{email:profile}:(profile||{}),email=source.email||source.owner||'',account=typeof get==='function'&&email?get('dge-accounts',[]).find(row=>row.email===email):null;
 const hasExplicitPhoto=Object.prototype.hasOwnProperty.call(source,'profilePhoto'),accountHasPhotoField=!!account&&Object.prototype.hasOwnProperty.call(account,'profilePhoto'),photo=hasExplicitPhoto?source.profilePhoto:(source.avatarUrl||source.photoUrl||(accountHasPhotoField?account.profilePhoto:(account?.avatarUrl||account?.photoUrl||null)));return {...(account||{}),...source,email,profilePhoto:photo||null,gender:source.gender||account?.gender||'unspecified'}
}
function avatarIllustration(gender){
 const common='<circle cx="40" cy="30" r="13" fill="#f3cdb7"/><path d="M14 78c1-16 12-26 26-26s25 10 26 26" fill="#7a9b83"/>';
 const female='<path d="M24 33c-3-17 4-27 16-27s19 10 16 27l-3 12-7-8H34l-7 8-3-12Z" fill="#526d5a"/><circle cx="40" cy="30" r="11" fill="#f3cdb7"/><path d="M14 78c2-16 12-25 26-25s24 9 26 25" fill="#8da78f"/>';
 const male='<path d="M27 27c1-11 6-17 13-17 8 0 13 6 14 17l-4-3-2-5-4 3H34l-4 5-3 1Z" fill="#526d5a"/><circle cx="40" cy="31" r="12" fill="#efc7ae"/><path d="M14 78c2-16 12-25 26-25s24 9 26 25" fill="#718b7a"/>';
 const art=gender==='female'?female:gender==='male'?male:common;
 return '<svg viewBox="0 0 80 80" role="presentation" aria-hidden="true" focusable="false"><circle cx="40" cy="40" r="40" fill="#edf2ed"/>'+art+'</svg>'
}
function avatarContents(profile){const p=resolveAvatarProfile(profile),photo=p.profilePhoto;return photo?'<img src="'+avatarEscape(photo)+'" alt="" loading="lazy">':avatarIllustration(p.gender)}
function Avatar(profile={},size='md',extraClass=''){
 const p=resolveAvatarProfile(profile),scale=avatarSizeMap[size]||Number(size)||avatarSizeMap.md,label=p.name||'მომხმარებელი',email=p.email||'';
 return '<span class="market-avatar '+avatarEscape(extraClass)+'" style="--avatar-size:'+scale+'px" data-avatar-size="'+scale+'"'+(email?' data-avatar-email="'+avatarEscape(email)+'"':'')+' role="img" aria-label="'+avatarEscape(label)+'">'+avatarContents(p)+'</span>'
}
function refreshAvatars(){
 document.querySelectorAll('.market-avatar[data-avatar-email]').forEach(node=>{const p=resolveAvatarProfile(node.dataset.avatarEmail);node.innerHTML=avatarContents(p);node.setAttribute('aria-label',p.name||'მომხმარებელი')});
 document.querySelectorAll('.day-avatar[data-avatar-email]').forEach(node=>{const p=resolveAvatarProfile(node.dataset.avatarEmail);node.innerHTML=avatarContents(p)})
}
