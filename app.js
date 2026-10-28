import { createStudioSound } from './soundscape.js?v=life-20261028-2';
const $ = (s) => document.querySelector(s);
const studioSound = createStudioSound();
const categories = ['Infographics','AI images','Podcasts','Explainer films','AI songs','Articles'];
const descriptions = {
  All:'Twenty-seven experiments in making with AI. Open a piece to see the finished work and a carefully reconstructed creative prompt.',
  Infographics:'Nine visual explanations of technology, culture, and the way we communicate. See each original image, then unpack its visual instructions.',
  'AI images':'Two interpretations of the apple: one about the force of an idea, the other about an unexpected point of view.',
  Podcasts:'Six audio explorations. Listen to the submitted recordings and examine a proposed prompt for producing each format.',
  'Explainer films':'Four films that turn a complex subject into a visual story, from motorsport to the influence of online creators.',
  'AI songs':'Five Suno tracks, transcribed from the supplied screenshot. Open the original song pages and explore a proposed creative direction.',
  Articles:'A news-style coursework article, paired with its source document, readable preview, and a reconstructed editorial brief.'
};
const songs = [
  ['main-character-hoon','Main Character Hoon','652c4e02-5f15-47b5-89fc-6a5ef9d94080','Write an original Hindi/Hinglish song titled “Main Character Hoon” about finding confidence in an ordinary day. Build a first-person narrative with a memorable recurring title phrase, clear verse-to-chorus development, and everyday images rather than borrowed lines. As a proposed musical treatment, use a buoyant contemporary pop groove, a warm bass line, restrained rhythmic percussion, and a chorus that opens into a fuller arrangement. Let the performance move from conversational verses to an assured, melodic hook. Keep the vocal intelligible and leave space between phrases. Avoid references to any existing singer or song. This is a title-led creative proposal: confirm the actual lyrics, genre, arrangement, voice, and generation settings by reviewing the linked recording.'],
  ['scene-bana-do','Scene Bana Do','9e2303cd-ab7d-4c38-9e41-c0025da5c957','Develop an original Hindi/Hinglish song titled “Scene Bana Do”. Use the title as an energetic invitation to turn a small shared moment into something memorable. Create concise verses, a rising pre-chorus, and a repeatable chorus built around an original title hook. As a possible production direction, combine a tight danceable beat, syncopated bass, short rhythmic instrumental responses, and a lively lead vocal. Give the chorus a clear lift without covering the words; introduce a brief contrast section before the final refrain. Write original lyrics and preserve natural pronunciation. The title is supplied evidence; this suggested musical direction is not a recovered description of the recording. Match the final style to the linked track when its audio and original settings can be reviewed.'],
  ['bas-nikalna-hai','Bas Nikalna Hai','607429c4-cadb-4f42-9c96-f096a43968a8','Write an original Hindi song titled “Bas Nikalna Hai”, using the desire to step out as an emotional throughline. Develop an opening scene, an internal hesitation, and a chorus that turns that hesitation into forward movement. Keep the language direct and singable, with specific physical details rather than generic motivational claims. One possible musical treatment is a reflective pop arrangement that begins with a restrained guitar or keyboard motif and gains drums and bass as the resolve strengthens. Maintain a clear lead vocal, a recognizable melodic refrain, and a purposeful ending. Do not imitate an existing artist or reuse existing lyrics. This prompt is a title-based reconstruction and proposes a mood; the actual track must establish its genre, instrumentation, lyrics, vocal identity, and pacing.'],
  ['flavours-of-india','Flavours of India','9cbaeb45-6b9d-4079-829a-c73325c03c21','Create an original song titled “Flavours of India”. Use sensory details of food, shared tables, and everyday travel to create a welcoming narrative. Organise the lyrics into focused verses and a memorable chorus, avoiding a checklist of stereotypes or claims to represent every region. As a possible arrangement, blend contemporary rhythm with a small, intentional selection of acoustic textures and hand percussion. Give each instrumental layer a clear role, preserve vocal clarity, and use a short contrasting bridge before the final chorus. Verify cultural references and pronunciation; avoid imitating named performers. Only the title and Suno link are established by the supplied screenshot. This is a proposed creative brief, not a claim about the track’s actual lyrics, languages, regional styles, or arrangement.'],
  ['amity-ki-kahani','Amity Ki Kahani','9e8f5efa-a751-4af6-a834-c3ed6070e005','Write an original Hindi/Hinglish campus song titled “Amity Ki Kahani”. Tell a personal-feeling student story through lectures, friendships, small setbacks, creative work, and the sense of a shared chapter coming together. Use concrete scenes without inventing an institution’s official statements or achievements. Build clear verses, a chorus using the original title phrase, and a bridge that reflects on what has changed. A proposed production approach is warm contemporary pop with an approachable vocal, rhythmic acoustic or keyboard texture, supportive bass, and a fuller final refrain. Keep the words understandable and avoid existing lyrics or imitation of a named artist. This is a reconstruction based on the supplied title; the actual recording and generation log are needed to establish its language, music, lyrics, and intended institutional context.']
].map(([id,title,uuid,prompt])=>({id,title,category:'AI songs',url:`https://suno.com/song/${uuid}`,prompt,description:'An original Suno link supplied in the assignment screenshot. The prompt below is a title-based creative reconstruction; the song’s audio and generation history were not supplied as files.',decisions:['The supplied title anchors an original lyrical concept.','The proposed arrangement gives the hook a clear place in the song.','Reviewing the linked track is necessary to match its actual musical details.'],critique:'The screenshot establishes the title and song link. It does not establish lyrics, genre, model version, authorship settings, or the original prompt. Those details should be added from the Suno project history before presenting this as a fully documented production record.',evidence:'Title and full URL transcribed from the supplied screenshot.'}));

let works = [], activeCategory='All', currentWork=null, room=null, visited=new Set();
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let motionOn = !reducedMotion, soundOn=false, evening=false, lastFocus=null;
try {visited=new Set(JSON.parse(localStorage.getItem('making-room-visited')||'[]'));} catch {}
const dialog=$('#exhibition'), content=$('#exhibition-content');
const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function updateCount(){const count=works.length ? [...visited].filter(id=>works.some(w=>w.id===id)).length : 0;$('#discovered').textContent=`${count} of ${works.length||27} works explored`;}
function markViewed(id){visited.add(id);try{localStorage.setItem('making-room-visited',JSON.stringify([...visited]));}catch{}updateCount();}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2200);}
let closing=false;
const canAnimate=()=>!reducedMotion&&motionOn;
let lastSelectionSound=-Infinity;
function sound(kind='open',category){if(kind==='select')lastSelectionSound=performance.now();if(kind==='open'&&performance.now()-lastSelectionSound<180)return;studioSound.play(kind,category);}
function syncActivity(){
  const mediaPlaying=[...content.querySelectorAll('audio,video')].some(m=>!m.paused&&!m.ended);
  studioSound.setMediaPlaying(mediaPlaying);
  room?.setActivity?.({overlayOpen:dialog.open,mediaPlaying});
  content.querySelectorAll('.asset-view').forEach(figure=>{
    const media=figure.querySelector('audio,video');
    figure.classList.toggle('is-playing',Boolean(media&&!media.paused&&!media.ended));
  });
}
function animateContent(){
  if(!window.gsap||!canAnimate())return;
  const surface=content.firstElementChild;
  if(!surface)return;
  gsap.fromTo(surface,{opacity:.45,y:8},{opacity:1,y:0,duration:.28,ease:'power3.out',clearProps:'all'});
  const cards=[...content.querySelectorAll('.work-card')].slice(0,9);
  if(cards.length)gsap.fromTo(cards,{opacity:0,y:18},{opacity:1,y:0,duration:.4,stagger:{amount:.12},ease:'power3.out',clearProps:'all'});
  const asset=content.querySelector('.detail>.asset-view');
  if(asset)gsap.fromTo(asset,{opacity:.6,scale:.985},{opacity:1,scale:1,duration:.42,ease:'power3.out',clearProps:'all'});
}
function openDialog(context){
  $('#dialog-context').textContent=context;
  if(!dialog.open){
    lastFocus=document.activeElement;dialog.showModal();sound('open',context);
    if(window.gsap&&canAnimate())gsap.fromTo(dialog,{opacity:0,y:24,scale:.97},{opacity:1,y:0,scale:1,duration:.4,ease:'power3.out',clearProps:'all'});
  }
  syncActivity();$('#tooltip').classList.remove('visible');content.scrollTop=0;
  requestAnimationFrame(()=>{const heading=$('#dialog-title');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
}
function stopMedia(){content.querySelectorAll('audio,video').forEach(e=>e.pause());studioSound.setMediaPlaying(false);syncActivity();}
function closeDialog(){
  if(!dialog.open||closing)return;closing=true;stopMedia();sound('close');
  const category=currentWork?.category||activeCategory;
  const finish=()=>{dialog.close();currentWork=null;closing=false;history.replaceState(null,'',location.pathname+location.search);syncActivity();room?.pulse?.(category);if(window.gsap)gsap.set(dialog,{clearProps:'all'});if(lastFocus?.isConnected)lastFocus.focus();};
  if(window.gsap&&canAnimate())gsap.to(dialog,{opacity:0,y:14,scale:.99,duration:.18,ease:'power2.in',onComplete:finish});else finish();
}
$('#close').onclick=closeDialog;
dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDialog();}});
function setHash(hash){history.replaceState(null,'',hash);}
function categoryCount(category){return works.filter(w=>w.category===category).length;}
function renderMenu(){stopMedia();$('#back').hidden=true;content.innerHTML=`<div class="menu-page"><div><h2 id="dialog-title">A little curiosity.<br>A lot of making.</h2><p class="menu-copy">A collection of images, ideas, voices, and stories made with AI. Pick a shelf, or take the whole tour.</p><p class="menu-note">${works.length} works across six creative formats.<br>Each exhibit pairs the finished asset with a transparent prompt reconstruction.</p><button class="primary" data-filter="All">Browse work <span aria-hidden="true">↗</span></button><div class="menu-preferences"><button data-toggle-motion aria-pressed="${motionOn}" ${reducedMotion?'disabled':''}>${reducedMotion?'Reduced motion enabled':'Room motion '+(motionOn?'on':'off')}</button></div></div><div class="menu-links">${categories.map(c=>`<button data-filter="${esc(c)}">${esc(c)}<small>${categoryCount(c)} works ↗</small></button>`).join('')}<button data-process>Behind the process<small>Read ↗</small></button></div></div>`;openDialog('Explore the studio');animateContent();}
function audioArt(song=false,seed=0){return `<div class="audio-art${song?' song':''}" aria-hidden="true">${Array.from({length:43},(_,i)=>`<i style="--bar:${i};height:${12+Math.abs(Math.sin(i*2.1+seed)*Math.cos(i*.37+seed))*85}px"></i>`).join('')}</div>`;}
function card(w,index){const img=w.thumbnail||w.poster||w.src;const visual=w.category==='Podcasts'?audioArt(false,index):w.category==='AI songs'?audioArt(true):`<img src="${esc(img)}" alt="${esc(w.title)}" loading="lazy" decoding="async" width="500" height="300">`;return `<button class="work-card" data-work="${esc(w.id)}" aria-label="Open ${esc(w.title)}"><div class="card-image ${w.category==='AI images'?'portrait':w.category==='Articles'?'article':w.category==='Explainer films'?'film':''}">${visual}${w.category==='Explainer films'?'<span class="card-play" aria-hidden="true">▷</span>':''}</div><div class="card-meta"><span class="card-category">${esc(w.category)}${w.duration?' / '+esc(w.duration):''}</span><span class="card-view" aria-hidden="true">↗</span></div><h3>${esc(w.title)}</h3></button>`;}
function showCollection(category='All') {
  if(!works.length){toast('The collection is still loading. Please try again in a moment.');return;}
  stopMedia();currentWork=null;activeCategory=category;$('#back').hidden=true;
  const filtered=category==='All'?works:works.filter(w=>w.category===category);
  content.innerHTML=`<section class="collection"><h2 id="dialog-title">${category==='All'?'The collected works.':esc(category)+'.'}</h2><p class="collection-intro">${esc(descriptions[category])}</p><div class="filters" aria-label="Filter collection">${['All',...categories].map(c=>`<button data-filter="${esc(c)}" aria-pressed="${c===category}">${esc(c)} <span>${c==='All'?works.length:categoryCount(c)}</span></button>`).join('')}</div><div class="work-grid">${filtered.map(card).join('')}</div><p class="collection-download"><a href="Portfolio%20process%20catalogue.txt" download>Download the complete process catalogue ↓</a></p></section>`;
  openDialog('The collection');setHash(`#collection/${encodeURIComponent(category)}`);animateContent();
}
function articleExtras(w){
 if(!w.supportingMedia)return '';
 return '<details class="article-extras"><summary>Inside the article: text & supporting visuals</summary><p class="evidence-note">These images were embedded in the supplied document. Their provenance is recorded individually. Numerical disaster claims are unverified coursework content.</p>'+w.supportingMedia.map(m=>`<section class="support-item"><h3>${esc(m.title)}</h3><figure class="asset-view"><a href="${esc(m.src)}" target="_blank" rel="noopener"><img src="${esc(m.src)}" alt="${esc(m.description)}" loading="lazy"></a><figcaption>${esc(m.provenance)}</figcaption></figure><p class="evidence-label">Reconstructed visual prompt</p><p class="prompt-text">${esc(m.prompt)}</p></section>`).join('')+'</details>';
}
function showWork(id){
  const w=works.find(x=>x.id===id);if(!w){showCollection('All');return;}stopMedia();currentWork=w;markViewed(id);$('#back').hidden=false;
  let media='';
  if(w.category==='Podcasts'){media=`${audioArt(false,works.indexOf(w))}<audio controls preload="none" src="${esc(w.src)}" aria-label="${esc(w.title)} podcast"></audio><figcaption>Submitted audio / ${esc(w.duration)} / browser playback copy</figcaption>`;}
  else if(w.category==='Explainer films'){media=`<video controls playsinline preload="none" poster="${esc(w.poster)}" src="${esc(w.src)}" aria-label="${esc(w.title)} explainer"></video><figcaption>Submitted film / ${esc(w.duration)} / optimized playback copy. Any visible dates and claims belong to the coursework.</figcaption>`;}
  else if(w.category==='AI songs'){media=`${audioArt(true)}<div class="asset-actions"><a class="primary" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">Listen on Suno <span aria-hidden="true">↗</span></a></div><figcaption>Original link from the supplied screenshot. Playback opens on Suno; access depends on that platform and the track’s sharing settings.</figcaption>`;}
  else {media=`<a href="${esc(w.src)}" target="_blank" rel="noopener" aria-label="Open full-size ${esc(w.title)}"><img src="${esc(w.src)}" alt="${esc(w.description)}"></a><figcaption>${w.category==='Articles'?'Embedded preview from the original Apple Pages document.':'The supplied artwork, preserved as a high-resolution display copy. Click to inspect at full size.'}${w.original?` <a href="${esc(w.original)}" download>Download ${w.category==='Articles'?'original .pages':'artwork'}</a>`:''}${w.textSource?` / <a href="${esc(w.textSource)}" target="_blank">Read extracted text</a>`:''}</figcaption>`;}
  const same=activeCategory==='All'?works:works.filter(x=>x.category===activeCategory),index=same.findIndex(x=>x.id===id);
  content.innerHTML=`<article class="detail"><header class="detail-heading"><p class="detail-category">${esc(w.category)}${w.duration?' / '+esc(w.duration):''}</p><h2 id="dialog-title">${esc(w.title)}</h2><p class="detail-description">${esc(w.description)}</p></header><figure class="asset-view">${media}</figure>${articleExtras(w)}<div class="prompt-layout"><section><div class="prompt-heading"><h3>The prompt behind it.</h3><button class="copy-button" data-copy="${esc(w.id)}">Copy prompt</button></div><span class="evidence-label">Reconstructed prompt</span><p class="prompt-text">${esc(w.prompt)}</p><p class="evidence-note">A plausible creative instruction inferred from ${w.category==='AI songs'?'the supplied title and link':w.category==='Podcasts'?'the filename and verified runtime':'the supplied asset'}. The original prompt history was not included, so this is not presented as a recovered original.</p></section><aside class="process-notes"><h3>Why these choices?</h3><ul>${w.decisions.map(d=>`<li>${esc(d)}</li>`).join('')}</ul><details><summary>Critical reflection</summary><p>${esc(w.critique)}</p></details><details><summary>Evidence & provenance</summary><p>${esc(w.evidence||'Based on direct visual inspection of the supplied artwork. Original prompts, model settings, research notes, and iteration history were not included in the archive.')}</p></details>${w.body?`<details><summary>Read the extracted article</summary>${w.body.map(p=>`<h4>${esc(p.heading)}</h4><p style="white-space:pre-wrap">${esc(p.text)}</p>`).join('')}</details>`:''}</aside></div><nav class="detail-nav" aria-label="Browse exhibits"><button data-prev="${index>0?esc(same[index-1].id):''}" ${index<=0?'disabled':''}>← Previous work</button><button data-filter="${esc(activeCategory)}">Back to collection</button><button data-next="${index>=0&&index<same.length-1?esc(same[index+1].id):''}" ${index<0||index===same.length-1?'disabled':''}>Next work →</button></nav></article>`;
  openDialog(w.category);setHash(`#work/${encodeURIComponent(id)}`);animateContent();
}
function showProcess(){
  stopMedia();currentWork=null;$('#back').hidden=true;
  content.innerHTML=`<section class="process-page"><h2 id="dialog-title">The making matters.</h2><p class="process-lead">AI can generate an asset. A creative process gives it purpose. This exhibition opens the distance between an idea, an instruction, and a finished piece.</p><div class="process-stages"><article><h3>Start with the finished work.</h3><p>The archive supplies nine infographics, two AI images, six podcasts, four explainer films, and an Apple Pages article. Five song links come from the accompanying screenshot. Every item is included.</p></article><article><h3>Read the creative decisions.</h3><p>For visual work, composition, hierarchy, color, subject, and format reveal useful instructions. Film reconstructions also draw on inspected frames and runtimes. Podcast reconstructions use filenames and runtimes, without inventing transcripts.</p></article><article><h3>Rebuild the instruction.</h3><p>Each exhibit includes a detailed prompt that could plausibly guide similar work. The prompt specifies an objective, audience, structure, style, and constraints. Song directions are explicitly based on the supplied titles.</p></article><article><h3>Reflect, then refine.</h3><p>The reflection notes identify limitations in the asset or its evidence. A stronger production record would retain dated sources, original prompts, model settings, intermediate versions, and the creator’s actual revisions.</p></article></div><aside class="provenance"><h3>A clear record of what is known.</h3><p><strong>Reconstructed prompts:</strong> Original prompt logs were not supplied. All prompts in this portfolio are newly written reconstructions, not proof of the exact instructions originally used.</p><p><strong>Tool attribution:</strong> Gemini Notebook branding is visible in some supplied work, and the song screenshot explicitly identifies Suno. This does not establish model versions or settings. Other software details remain unconfirmed.</p><p><strong>Research claims:</strong> The artwork is presented as coursework. Its statistics, platform policies, and the Nepal flood narrative have not been independently verified. The article’s AI-generated disaster image is not documentary evidence.</p><p><strong>Design reference:</strong> The warm office, sculptural yellow shelving, and serif-led atmosphere draw on <a href="https://juliamoresco.com.br/" target="_blank" rel="noopener">Júlia Moresco’s portfolio</a>. This room is a new Three.js implementation made for this collection.</p></aside><p class="process-footer">Diksha Singh / The Making Room / AI creative portfolio</p></section>`;
  openDialog('The creative process');setHash('#process');animateContent();
}
content.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||closing)return;
  if(b.hasAttribute('data-toggle-motion')){$('#motion').click();b.textContent='Room motion '+(motionOn?'on':'off');b.setAttribute('aria-pressed',motionOn);}
  else if(b.hasAttribute('data-filter')){sound('select',b.dataset.filter);showCollection(b.dataset.filter);}
  else if(b.dataset.work){const w=works.find(w=>w.id===b.dataset.work);sound('select',w?.category);showWork(b.dataset.work);}
  else if(b.hasAttribute('data-process'))showProcess();
  else if(b.dataset.prev||b.dataset.next){sound();showWork(b.dataset.prev||b.dataset.next);}
  else if(b.dataset.copy){const w=works.find(x=>x.id===b.dataset.copy);try{await navigator.clipboard.writeText(w.prompt);b.textContent='Copied';sound('copy');setTimeout(()=>b.textContent='Copy prompt',1800);}catch{toast('Select the prompt text and copy it from your browser.');}}
});
content.addEventListener('play',e=>{content.querySelectorAll('audio,video').forEach(x=>{if(x!==e.target)x.pause();});syncActivity();},true);
content.addEventListener('pause',syncActivity,true);content.addEventListener('ended',syncActivity,true);
$('#back').onclick=()=>showCollection(activeCategory);
$('#browse').onclick=()=>showCollection('All');$('#menu').onclick=renderMenu;$('#process').onclick=showProcess;
$('.identity').onclick=e=>{e.preventDefault();if(dialog.open)closeDialog();};
function updateHints(){if(!room?.getCategoryPositions)return;const positions=room.getCategoryPositions();for(const b of document.querySelectorAll('#hint-layer button')){const p=positions[b.dataset.category];if(p){b.style.setProperty('--x',p.x+'px');b.style.setProperty('--y',p.y+'px');}}}
window.addEventListener('resize',()=>requestAnimationFrame(updateHints));
$('.skip-link').onclick=e=>{e.preventDefault();showCollection('All');};
$('#hints').onclick=()=>{updateHints();const on=$('#hints').getAttribute('aria-pressed')!=='true';$('#hints').setAttribute('aria-pressed',on);$('#hint-layer').hidden=!on;sound('hover');};
$('#hint-layer').addEventListener('click',e=>{const b=e.target.closest('button');if(b)b.dataset.category==='Process'?showProcess():showCollection(b.dataset.category);});
$('#sound').onclick=async()=>{
  const requested=!soundOn;
  soundOn=await studioSound.setEnabled(requested);
  $('#sound').setAttribute('aria-pressed',soundOn);$('#sound').setAttribute('aria-label',soundOn?'Sound on. Turn sound off':'Sound off. Turn sound on');$('.sound-label').textContent=soundOn?'Sound on':'Sound off';document.body.dataset.sound=soundOn?'on':'off';
  if(soundOn){studioSound.setEnvironment(evening?'night':'day');sound('enable');room?.pulse?.();}else if(requested)toast('Sound is unavailable in this browser.');
};
$('#light').onclick=()=>{evening=!evening;room?.setLighting(evening?'night':'day');studioSound.setEnvironment(evening?'night':'day');$('#light').innerHTML=evening?'Evening <span aria-hidden="true">☾</span>':'Afternoon <span aria-hidden="true">☼</span>';$('#light').setAttribute('aria-label',`${evening?'Evening':'Afternoon'} light. Switch to ${evening?'afternoon':'evening'}`);sound('environment');};
$('#motion').onclick=()=>{motionOn=!motionOn;room?.setMotion(motionOn);document.body.dataset.motion=motionOn?'on':'off';$('#motion').textContent=`Motion ${motionOn?'on':'off'}`;$('#motion').setAttribute('aria-pressed',motionOn);};
if(reducedMotion){$('#motion').textContent='Motion reduced';$('#motion').setAttribute('aria-pressed','false');$('#motion').disabled=true;}
document.body.dataset.motion=motionOn?'on':'off';document.body.dataset.sound='off';
function route(){const hash=decodeURIComponent(location.hash);if(hash.startsWith('#work/'))showWork(hash.slice(6));else if(hash.startsWith('#collection/')){const c=hash.slice(12);showCollection(['All',...categories].includes(c)?c:'All');}else if(hash==='#process')showProcess();}
async function initialize(){
  try{const responses=await Promise.all(['visual-data.json','media-data.json'].map(f=>fetch(f)));if(responses.some(r=>!r.ok))throw Error('Missing catalogue');const [v,m]=await Promise.all(responses.map(r=>r.json()));works=[...v,...m,...songs];updateCount();route();}
  catch(e){$('#room-status').hidden=false;$('#room-status').classList.add('error');$('#room-status').innerHTML='The collection could not load. <button onclick="location.reload()">Reload the studio</button>';console.error('Catalogue:',e);}
  try{const {createRoom}=await import('./scene.js?v=life-20261028-2');room=await createRoom({canvas:$('#room'),reducedMotion,onSelect:category=>{sound('select',category);category==='Process'?showProcess():showCollection(category);},onHover:(category,x,y)=>{const t=$('#tooltip');if(category&&!dialog.open){t.textContent=category==='Process'?'Behind the process':`Explore ${category.toLowerCase()} ↗`;t.style.left=`${Math.min(x+15,innerWidth-200)}px`;t.style.top=`${Math.max(20,y-40)}px`;t.classList.add('visible');sound('hover',category);}else t.classList.remove('visible');},onReady:()=>{$('#room-status').hidden=true;}});$('#room-status').hidden=true;if(evening)room.setLighting('night');syncActivity();}
  catch(e){$('#room-status').hidden=false;$('#room-status').classList.add('error');$('#room-status').textContent='The 3D room is unavailable on this device. Browse work to explore the complete collection.';console.error('Room:',e);}
  if(window.gsap&&!reducedMotion){gsap.timeline({defaults:{ease:'power2.out'}}).from('.welcome',{opacity:0,y:20,duration:.9}).from('.topbar',{opacity:0,y:-10,duration:.6},'<.2').from('.discovery,.room-options',{opacity:0,duration:.6},'<.2');}
}
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',event=>{if(event.persisted)return;room?.dispose();studioSound.dispose();window.gsap?.globalTimeline.clear();});
Object.defineProperty(window,'studioDiagnostics',{configurable:true,value:()=>({scene:room?.getDiagnostics?.()||null,sound:studioSound.getDiagnostics(),overlayOpen:dialog.open,motionOn,reducedMotion,works:works.length})});
initialize();
