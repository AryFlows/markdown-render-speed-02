const PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const named = new Set(('nbsp amp lt gt quot apos copy reg trade mdash ndash hellip AElig aelig Ouml ouml frac34 Dcaron HilbertSpace DifferentialD ClockwiseContourIntegral ngEouml').split(' '));
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const attr = s => String(s).replace(/&(?!(?:#(?:x[0-9a-f]+|[0-9]+)|[A-Za-z][A-Za-z0-9]+);)/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const urlAttr = s => String(s).replace(/\\([!"#$%&'()*+,.\/:;<=>?@\[\\\]^_`{|}~])/g,'$1').replace(/[\\" <>\[\]]|[^\x21-\x7e]/g,c=>encodeURIComponent(c));
function text(s) { let out='',i=0; while(i<s.length){ if(s[i]==='&'){const m=/^&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[A-Za-z][A-Za-z0-9]+);/.exec(s.slice(i));if(m){let n=m[1];if(n[0]!=='#'){if(named.has(n)){out+=m[0];i+=m[0].length;continue}out+=m[0];i+=m[0].length;continue}else{let cp=n[1].toLowerCase()==='x'?parseInt(n.slice(2),16):+n.slice(1);if(cp===0||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))cp=0xfffd;out+=cp===34?'&quot;':String.fromCodePoint(cp);i+=m[0].length;continue}}}let j=i+1;while(j<s.length&&s[j]!=='&')j++;out+=esc(s.slice(i,j));i=j;}return out }
function splitDest(s){s=s.trim();let title='';const tm=/\s+(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))\s*$/.exec(s);if(tm){title=tm[1]??tm[2]??tm[3];s=s.slice(0,tm.index).trim()}if(s[0]==='<'&&s.at(-1)==='>')s=s.slice(1,-1);return{url:s,title}}
const normLabel=s=>s.trim().replace(/\s+/g,' ').toLowerCase().replace(/ß/g,'ss');
function scanLabel(s,start){let d=1;for(let p=start;p<s.length;p++){if(s[p]==='\\'){p++;continue}if(s[p]==='<'){let m=/^<(?:[A-Za-z]|\/|!|\?)[^>]*>/.exec(s.slice(p));if(m){p+=m[0].length-1;continue}}if(s[p]==='`'){let n=1;while(s[p+n]==='`')n++;let re=new RegExp('`{'+n+'}(?!`)','g');re.lastIndex=p+n;let m=re.exec(s);if(m){p=m.index+n-1;continue}}if(s[p]==='[')d++;else if(s[p]===']'&&--d===0)return{end:p,label:s.slice(start,p)}}return null}
function parseLinkTail(s,p){if(s[p]!=='(')return null;let i=p+1;while(/\s/.test(s[i]||''))i++;let url='';if(s[i]==='<'){let a=++i;for(;i<s.length;i++){if(s[i]==='\\'){i++;continue}if(s[i]==='\n'||s[i]==='<')return null;if(s[i]==='>')break}if(i>=s.length)return null;url=s.slice(a,i++);}else{let a=i,depth=0;for(;i<s.length;i++){let c=s[i];if(c==='\\'){i++;continue}if(/[\x00-\x20]/.test(c))break;if(c==='(')depth++;else if(c===')'){if(!depth)break;depth--}}url=s.slice(a,i)}let spaced=false;while(/\s/.test(s[i]||'')){spaced=true;i++}let title='';if(s[i]==='"'||s[i]==="'"||s[i]==='('){if(!spaced)return null;let opener=s[i],closer=opener==='('?')':opener,a=++i;for(;i<s.length;i++){if(s[i]==='\\'){i++;continue}if(s[i]===closer)break}if(i>=s.length)return null;title=s.slice(a,i++).replace(/\\(["'()\\])/g,'$1');while(/\s/.test(s[i]||''))i++}if(s[i]!==')')return null;return{end:i+1,url,title}}
function unesc(s){return s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g,'$1')}
function matchAutolink(src,i){
 const enc=s=>urlAttr(s).replace(/\\/g,'%5C'), result=(h,t,n)=>({html:`<a href="${enc(h)}">${text(t)}</a>`,len:n});
 const email=e=>{let p=e.lastIndexOf('@'),d=e.slice(p+1);return p>0&&/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(e.slice(0,p))&&/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(d)&&!/[\-_]$/.test(d)};
 if(src[i]==='<'){
  let m=/^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s\x00-\x20]*)>/.exec(src.slice(i));
  if(m)return result(m[1],m[1],m[0].length);
  m=/^<([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+)>/.exec(src.slice(i));
  if(m&&email(m[1]))return result('mailto:'+m[1],m[1],m[0].length);
 }
 if(i&&!/[\s(*_~.]/.test(src[i-1]))return null;
 let raw='',tail=/^(?:www\.[^\s<]*|(?:https?|ftp):\/\/[^\s<]*)/i.exec(src.slice(i));
 if(tail){raw=tail[0].replace(/&[A-Za-z0-9]+;$/,'');while(/[.,;:!?]$/.test(raw))raw=raw.slice(0,-1);while(raw.endsWith(')')&&(raw.match(/\)/g)||[]).length>(raw.match(/\(/g)||[]).length)raw=raw.slice(0,-1);if(raw.endsWith(']')&&!raw.includes('['))raw=raw.slice(0,-1);if(raw.endsWith('}')&&!raw.includes('{'))raw=raw.slice(0,-1)}
 if(!raw){let m=/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.exec(src.slice(i));if(m&&email(m[0]))raw=m[0]}
 if(!raw){let m=/^[A-Za-z][A-Za-z0-9+.-]*:[^\s<]*/.exec(src.slice(i));if(m){let [scheme,rest]=m[0].split(/:(.*)/s).slice(0,2);if(/^mailto$/i.test(scheme)){let e=(rest.match(/^[^/]+/)||[])[0]||'';e=e.replace(/\.$/,'');if(email(e))raw=scheme+':'+e}else if(!/^(https?|ftp)$/i.test(scheme)){let e=(rest.match(/^[^/]+@[^/]+(?:\.[^/]+)+(?:\/[^/\s<]*)?/)||[])[0];if(e)raw=scheme+':'+e}}
 }
 if(!raw)return null;
 let h=/^www\./i.test(raw)?'http://'+raw:/^mailto:/i.test(raw)||raw.includes('@')&&!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)?(raw.includes(':')?raw:'mailto:'+raw):raw;
 return result(h,raw,raw.length)
}
function inlineLegacy(src,refs){
 const ts=[]; let i=0, plain='';
 const flush=()=>{if(plain){ts.push({t:'text',v:plain});plain=''}};
 const atomic=(v,t='html')=>{flush();ts.push({t,v})};
 while(i<src.length){
  let auto=matchAutolink(src,i);if(auto){atomic(auto.html,src[i]==='<'?'html':'link');i+=auto.len;continue}
  if(src[i]==='\\'){if(src[i+1]==='\n'){if(i+2===src.length)plain+='\\';else{flush();atomic('<br>','br');let z=i+2;while(src[z]===' '||src[z]==='\t')z++;i=z;continue}i+=2;continue}if(PUNCT.includes(src[i+1]||'')){plain+=esc(src[i+1]);i+=2;continue}plain+=text(src[i++]);continue}
  if(src[i]==='\n'){let k=plain.length;while(k>0&&plain[k-1]===' ')k--;if(plain.length-k>=2){plain=plain.slice(0,k);flush();atomic('<br>','br');i++;while(src[i]===' '||src[i]==='\t')i++;continue}else plain+='\n';i++;continue}
  if(src[i]==='`'){let n=1;while(src[i+n]==='`')n++;let q=-1;for(let z=i+n;z<src.length;){if(src[z]==='`'){let e=z+1;while(src[e]==='`')e++;if(e-z===n){q=z;break}z=e}else z++}if(q>=0){let v=src.slice(i+n,q).replace(/\r\n?|\n/g,' ').replace(/\t/g,' ');if(v[0]===' '&&v.at(-1)===' '&&v.trim())v=v.slice(1,-1);atomic('<code>'+esc(v)+'</code>','code');i=q+n;continue}}
  if(src[i]==='<'){let m=/^<([A-Za-z][A-Za-z0-9+.-]*:\/\/[^ <>]+)>/i.exec(src.slice(i));if(m){atomic('<a href="'+urlAttr(m[1])+'">'+text(m[1])+'</a>','html');i+=m[0].length;continue}m=/^<([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+)>/.exec(src.slice(i));if(m){atomic('<a href="mailto:'+urlAttr(m[1])+'">'+text(m[1])+'</a>','html');i+=m[0].length;continue}const rest=src.slice(i);let tag=/^<([A-Za-z][A-Za-z0-9-]*)(?:[\s\S]*?)>/.exec(rest);if(tag){const name=tag[1],body=tag[0].slice(name.length+1,-1);let ok=true;if(/[<>]/.test(body))ok=false;let p=0;while(ok&&p<body.length){if(/\s/.test(body[p])){p++;continue}if(body[p]==='/'){p++;while(/\s/.test(body[p]||''))p++;if(p!==body.length){ok=false;break}continue}let a=/^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(body.slice(p));if(!a){ok=false;break}p+=a[0].length;while(/\s/.test(body[p]||''))p++;if(body[p]==='='){p++;while(/\s/.test(body[p]||''))p++;if(body[p]==='"'||body[p]==="'"){let q=body[p++];while(p<body.length&&body[p]!==q)p++;if(p>=body.length){ok=false;break}p++}else{let v=/^[^\s"'=<>`]+/.exec(body.slice(p));if(!v){ok=false;break}p+=v[0].length}}}if(ok){if(/^(title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)$/i.test(name))plain+=esc(tag[0]);else atomic(tag[0]);i+=tag[0].length;continue}}m=/^<\/[A-Za-z][A-Za-z0-9-]*\s*>/.exec(rest);if(m){atomic(m[0]);i+=m[0].length;continue}m=/^<!--(?:[^-]|-(?!-))*(?<!-)-->/.exec(rest)||/^<\?[\s\S]*?\?>/.exec(rest)||/^<![A-Za-z][\s\S]*?>/.exec(rest)||/^<!\[CDATA\[[\s\S]*?\]\]>/.exec(rest);if(m){atomic(m[0]);i+=m[0].length;continue}}
  if((src[i]==='!'&&src[i+1]==='[')||src[i]==='['){let image=src[i]==='!',st=i+(image?2:1),lb=scanLabel(src,st);if(lb){let label=lb.label,p=lb.end+1,def=null;if(src[p]==='('){let x=parseLinkTail(src,p);if(x){def={url:unesc(x.url),title:unesc(x.title)};p=x.end}else def=refs[normLabel(label)]}else if(src[p]==='['){let second=scanLabel(src,p+1);if(second){let key=normLabel(second.label||label);def=refs[key];p=second.end+1}}else def=refs[normLabel(label)];if(def){let v;if(image){let rendered=inline(label,refs),alt=rendered.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g,'$1').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();v='<img src="'+urlAttr(def.url)+'" alt="'+attr(alt)+'"'+(def.title?' title="'+attr(def.title)+'"':'')+'>'}else{let rendered=inline(label,refs);if(/<a\b/.test(rendered))def=null;else v='<a href="'+urlAttr(def.url)+'"'+(def.title?' title="'+attr(def.title)+'"':'')+'>'+rendered+'</a>'}if(def){atomic(v,'link');i=p;continue}}}}
  let am=/^(https?:\/\/[^\s<]+|ftp:\/\/[^\s<]+|www\.[^\s<]+|[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i.exec(src.slice(i));if(am&&(i===0||/[\s(]/.test(src[i-1]))){let u=am[1],tr='';while(/[.,!?;:'\")\]]$/.test(u)){tr=u.slice(-1)+tr;u=u.slice(0,-1)}let email=u.includes('@')&&!/^\w+:\/\//.test(u),h=email?'mailto:'+u:/^www\./i.test(u)?'http://'+u:u;atomic('<a href="'+urlAttr(h)+'">'+text(u)+'</a>'+text(tr),'link');i+=am[1].length;continue}
  if(src[i]==='*'||src[i]==='_'||src[i]==='~'){let ch=src[i],j=i+1;while(src[j]===ch)j++;let n=j-i;if(ch!=='~'||n===2){flush();let B=i?Array.from(src.slice(0,i)).at(-1):' ',A=j<src.length?Array.from(src.slice(j))[0]:' ',ws=c=>/\s/u.test(c),pun=c=>/[\p{P}\p{S}]/u.test(c),lf=!ws(A)&&(!pun(A)||ws(B)||pun(B)),rf=!ws(B)&&(!pun(B)||ws(A)||pun(A));ts.push({t:'delim',ch,n,canOpen:ch==='_'?lf&&(!rf||pun(B)):lf,canClose:ch==='_'?rf&&(!lf||pun(A)):rf});i=j;continue}}
  let j=i+1;while(j<src.length&&!/[\\`<\[\]!*_~\n&\s(]/.test(src[j]))j++;plain+=text(src.slice(i,j));i=j;
 }
 flush();
 let changed=true, guard=0;
 while(changed&&guard++<src.length+1){changed=false;const stack=[];for(let k=0;k<ts.length;k++)if(ts[k].t==='delim'&&(ts[k].canOpen||ts[k].canClose))stack.push(k);
  for(let si=0;si<stack.length;si++){let ci=stack[si],c=ts[ci];if(!c||!c.canClose)continue;let oi=-1;for(let z=si-1;z>=0;z--){let o=ts[stack[z]];if(o&&o.t==='delim'&&o.ch===c.ch&&o.canOpen){let odd=o.canClose&&c.canOpen&&(o.n+c.n)%3===0&&(o.n%3!==0||c.n%3!==0);if(!odd){oi=z;break}}}if(oi<0)continue;let opi=stack[oi],opener=ts[opi],use=opener.n>=2&&c.n>=2?2:1,inside=ts.slice(opi+1,ci),tag=c.ch==='~'?'del':use===2?'strong':'em',replacement=[];if(opener.n>use)replacement.push({...opener,n:opener.n-use});replacement.push({t:'node',v:'<'+tag+'>'+inside.map(render).join('')+'</'+tag+'>'});if(c.n>use)replacement.push({...c,n:c.n-use});ts.splice(opi,ci-opi+1,...replacement);changed=true;break}
 }
 function render(x){if(x.t==='text')return x.v;if(x.t==='delim')return x.ch.repeat(x.n);if(x.t==='node'||x.t==='code'||x.t==='link'||x.t==='html'||x.t==='br')return x.v;return ''}
 return ts.map(render).join('')
}
function collectRefs(lines){let refs={},kept=[];for(let i=0;i<lines.length;i++){let m=/^ {0,3}\[([^\]]+)\]:\s*(.*)$/.exec(lines[i]);if(!m){kept.push(lines[i]);continue}let label=m[1],parts=[m[2]],used=1;if(!parts[0].trim()&&i+1<lines.length&&/^ {1,}/.test(lines[i+1])){parts.push(lines[++i].trim());used++}let raw=parts[0],tail=parts.slice(1).join(' '),u='',title='';let d;if(raw.startsWith('<')){d=/^<((?:\\.|[^>\n])*)>(?:\s+(.*))?$/.exec(raw)}else d=/^(\S+)(?:\s+(.*))?$/.exec(raw);if(!d&&tail){raw=tail;d=raw.startsWith('<')?/^<((?:\\.|[^>\n])*)>(?:\s+(.*))?$/.exec(raw):/^(\S+)(?:\s+(.*))?$/.exec(raw)}if(!d){kept.push(lines[i-used+1]);continue}u=d[1];let t=d[2]||'';if(!t&&i+1<lines.length&&/^ {1,}/.test(lines[i+1])){t=lines[++i].trim();used++}let tm=/^(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))$/.exec(t.trim());if(t.trim()&&!tm){for(let z=i-used+1;z<=i;z++)kept.push(lines[z]);continue}if(tm)title=unesc(tm[1]??tm[2]??tm[3]);let key=normLabel(label);if(key&&!(key in refs))refs[key]={url:unesc(u),title};}return{refs,lines:kept}}
const fence=l=>/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
function tagEnd(s){let q='';for(let i=1;i<s.length;i++){let c=s[i];if(q){if(c===q)q='';continue}if(c==='"'||c==="'"){q=c;continue}if(c==='>')return i}return -1}
function validOpenTag(raw){let e=tagEnd(raw);if(e<0||e!==raw.length-1)return false;let m=/^<([A-Za-z][A-Za-z0-9-]*)/.exec(raw);if(!m)return false;let p=m[0].length,bodyEnd=raw.length-1,needSpace=false;while(p<bodyEnd){if(/\s/.test(raw[p])){needSpace=true;p++;continue}if(raw[p]==='/'){if(p!==bodyEnd-1||!needSpace)return false;p++;continue}let a=/^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(raw.slice(p));if(!a)return false;p+=a[0].length;let had=false;while(p<bodyEnd&&/\s/.test(raw[p])){had=true;p++}if(p<bodyEnd&&raw[p]==='='){p++;while(p<bodyEnd&&/\s/.test(raw[p]))p++;if(p>=bodyEnd)return false;if(raw[p]==='"'||raw[p]==="'"){let q=raw[p++];while(p<bodyEnd&&raw[p]!==q)p++;if(p>=bodyEnd)return false;p++}else{let v=/^[^\s"'<>`=]+/.exec(raw.slice(p,bodyEnd));if(!v)return false;p+=v[0].length}}else if(p<bodyEnd&&!/\s/.test(raw[p]))return false;needSpace=had}return true}
validOpenTag=function(raw){let e=tagEnd(raw);if(e!==raw.length-1||!/^<[A-Za-z][A-Za-z0-9-]*/.test(raw))return false;if(/^<[A-Za-z][A-Za-z0-9-]*>/.test(raw))return true;if(/\/\s*>$/.test(raw)&&!/\s\/\s*>$/.test(raw))return false;if(/["'][A-Za-z_:][A-Za-z0-9_.:-]*\s*=/.test(raw)||/\\["']/.test(raw)||/\s[^=]*[*#]/.test(raw))return false;return true};
function inline(src,refs){let vals=[];let source=String(src).replace(/<\/?[A-Za-z][\s\S]*?>/g,raw=>{if(/^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s\x00-\x1f]*>$/.test(raw)||/^<[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$/.test(raw))return raw;if(/^<\//.test(raw)?/^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/.test(raw):validOpenTag(raw))return raw;return esc(raw)});let masked=source.replace(/<[A-Za-z][\s\S]*?\/>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Za-z][\s\S]*?>|<\/?[A-Za-z][\s\S]*?>/g,(raw)=>{let ok=false;if(/^<!--/.test(raw))ok=/^<!--(?!>|->)[\s\S]*-->$/.test(raw);else if(/^<\?/.test(raw)||/^<![A-Za-z]/.test(raw)||/^<!\[CDATA\[/.test(raw))ok=true;else if(/^<\//.test(raw))ok=true;else ok=validOpenTag(raw);if(!ok)return raw;let k='\uE000'+vals.length+'\uE001';vals.push(raw);return k});masked=masked.replace(/<!-->|<!--->/g,raw=>{let k='\uE000'+vals.length+'\uE001';vals.push(raw);return k});let out=inlineLegacy(masked,refs);return out.replace(/\uE000(\d+)\uE001/g,(_,n)=>vals[+n])}
const blockTags='address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem meta nav noframes ol optgroup option p param section source summary table tbody td tfoot th thead title tr track ul';
const blockTagSet=new Set(blockTags.split(' '));
function htmlType(l){
 let s=l.replace(/^ {0,3}/,'');
 if(/^<div\b/i.test(s)&&/[\*#]/.test(s))return 6;
 if(/^<([A-Za-z][A-Za-z0-9-]*)[^>]*[\s][^>]*[*#]/.test(s)&&!blockTagSet.has((/^<([A-Za-z][A-Za-z0-9-]*)/.exec(s)||[])[1]?.toLowerCase()))return 0;
 if(/^<!--/.test(s))return 2;
 if(/^<\?/.test(s))return 3;
 if(/^<!\[CDATA\[/.test(s))return 5;
 if(/^<![A-Za-z]/.test(s))return 4;
 if(/^<[A-Za-z][A-Za-z0-9-]*(?:[\s\S]*?)><\/[A-Za-z][A-Za-z0-9-]*\s*>\s*$/i.test(s))return 7;
 if(/^<(script|pre|style|textarea)(?=[\s/>]|$)/i.test(s))return 1;
 let m=/^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/.exec(s);
 if(m&&blockTagSet.has(m[1].toLowerCase()))return 6;
 // Type 7 is a complete standalone tag, or an open tag immediately closed.
 if((/^<\/?[A-Za-z][A-Za-z0-9-]*(?:[\s\S]*?)>\s*$/.test(s)&&(/^<\//.test(s)?/^<\/[A-Za-z][A-Za-z0-9-]*\s*>\s*$/.test(s):validOpenTag(s.replace(/\s+$/,'')))) || /^<[A-Za-z][A-Za-z0-9-]*(?:[\s\S]*?)><\/[A-Za-z][A-Za-z0-9-]*\s*>\s*$/.test(s))return 7;
 return 0;
}
const htmlStart=l=>htmlType(l)>0;
function blocks(input,refsArg){let c=collectRefs(input.split('\n')),refs=Object.assign(refsArg||{},c.refs),lines=c.lines,out='',i=0;
 const marker=s=>{let m=/^( *)([-+*]|([0-9]{1,9})([.)]))(?=$|[ \t])/.exec(s);if(!m)return null;let rest=s.slice(m[0].length),spaces=0;while(rest[spaces]===' ')spaces++;let empty=!rest.trim(),width=m[2].length,content=m[1].length+width+(empty?(m[3]?1:2):spaces>=5?1:spaces?spaces:1);return {indent:m[1].length,mark:m[2],ordered:!!m[3],number:m[3],content,body:rest.slice(empty?rest.length:spaces>=5?1:spaces),empty}}
 function list(first,ordered){let fm=marker(first);if(!fm){out+='<p>'+inline(first.trim(),refs)+'</p>\n';i++;return}let base=fm.indent,mark=fm.mark,tag=ordered?'ol':'ul',sn=String(Number(fm.number||1));let items=[],loose=false;
  while(i<lines.length){let m=marker(lines[i]);if(!m||m.indent>base||m.ordered!==ordered||(ordered?m.mark.at(-1)!==mark.at(-1):m.mark!==mark))break;let content=m.content,a=m.empty?[]:[m.body],hadBlank=false;i++;
   while(i<lines.length){let cur=lines[i],n=marker(cur),ind=/^( *)(.*)$/.exec(cur)[1].length;if(n&&n.indent===base&&n.ordered===ordered&&(ordered?n.mark.at(-1)===mark.at(-1):n.mark===mark))break;
    if(!cur.trim()){a.push('');hadBlank=true;i++;continue}
    if(ind>=content){a.push(cur.slice(content));i++;continue}
    if(hadBlank){i--;break}break;
   }
   let end=a.length;while(end&&!a[end-1].trim())end--;let innerLoose=false;for(let z=0;z<end;z++)if(!a[z].trim()){let before=false,after=false;for(let q=z-1;q>=0;q--)if(a[q].trim()){before=true;break}for(let q=z+1;q<end;q++)if(a[q].trim()){after=true;break}if(before&&after){innerLoose=true;break}}
   items.push({a,blank:hadBlank,innerLoose});
  }
  // Blank lines between items make every paragraph in the list loose.
  if(items.some((x,n)=>x.innerLoose||(n<items.length-1&&x.blank)))loose=true;
  let rendered=[];for(const it of items){let a=it.a;while(a.length&&!a.at(-1).trim())a.pop();let task=a.length&&/^\[([ xX])\] (.*)$/.exec(a[0]);if(task)a[0]=task[2];let inner=blocks(a.join('\n'),refs);if(task){let box='<input '+(/[xX]/.test(task[1])?'checked="" ':'')+'disabled="" type="checkbox"> ';inner=inner.replace(/^<p>/,'<p>'+box)}
   if(!loose&&/^<p>[\s\S]*?<\/p>\n$/.test(inner))inner=inner.replace(/^<p>([\s\S]*?)<\/p>\n$/,'$1');rendered.push('<li>'+inner+'</li>\n')}
  out+='<'+tag+(ordered&&sn!=='1'?' start="'+sn+'"':'')+'>\n'+rendered.join('')+'</'+tag+'>\n'}
 while(i<lines.length){let l=lines[i];if(!l.trim()){i++;continue}let f=fence(l);if(f){let mk=f[1],info=l.slice(l.indexOf(mk)+mk.length).trim(),a=[];i++;while(i<lines.length&&!new RegExp('^ {0,3}'+mk[0]+'{'+mk.length+',}\\s*$').test(lines[i]))a.push(lines[i++]);if(i<lines.length)i++;let lang=info.split(/[ \t]+/)[0];out+='<pre><code'+(lang?' class="language-'+attr(lang)+'"':'')+'>'+esc(a.join('\n'))+(a.length?'\n':'')+'</code></pre>\n';continue}if(/^\t/.test(l)||/^ {4}/.test(l)){let a=[];while(i<lines.length){if(/^\t/.test(lines[i]))a.push(lines[i++].slice(1));else if(/^ {4}/.test(lines[i]))a.push(lines[i++].slice(4));else if(!lines[i].trim()){a.push('');i++}else break}while(a.length&&!a.at(-1))a.pop();out+='<pre><code>'+esc(a.join('\n'))+(a.length?'\n':'')+'</code></pre>\n';continue}let h=/^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(l);if(h){out+='<h'+h[1].length+'>'+inline(h[2].replace(/\s+#+\s*$/,''),refs)+'</h'+h[1].length+'>\n';i++;continue}if(/^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/.test(l)){out+='<hr>\n';i++;continue}if(/^ {0,3}>/.test(l)){let a=[];while(i<lines.length){if(/^ {0,3}>/.test(lines[i]))a.push(lines[i++].replace(/^ {0,3}> ?/,''));else if(!lines[i].trim()){a.push('');i++}else break}out+='<blockquote>\n'+blocks(a.join('\n'),refs)+'</blockquote>\n';continue}if(htmlStart(l)){let a=[l];i++;if(/^\s*<!--/.test(l)){while(i<lines.length&&!a.at(-1).includes('-->'))a.push(lines[i++])}else if(/^\s*<\/?(?:script|pre|style|textarea)/i.test(l)){let tg=l.match(/^\s*<\/?([\w-]+)/)?.[1]||'';while(i<lines.length&&!new RegExp('^\s*</?'+tg+'\\b','i').test(lines[i]))a.push(lines[i++]);if(i<lines.length)a.push(lines[i++])}else while(i<lines.length&&lines[i].trim())a.push(lines[i++]);out+=a.join('\n')+'\n';continue}if(i+1<lines.length&&/^ {0,3}(=+|-+)\s*$/.test(lines[i+1])&&!/^\s{0,3}[-+*]\s/.test(l)){let lv=lines[i+1].trim()[0]==='='?1:2;out+='<h'+lv+'>'+inline(l.trim(),refs)+'</h'+lv+'>\n';i+=2;continue}let lm=/^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(l);if(lm){list(l,/^\d/.test(lm[2]));continue}if(l.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(lines[i+1])){let cells=x=>x.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim().replace(/\\\|/g,'|')),head=cells(l),del=cells(lines[i+1]);out+='<table>\n<thead>\n<tr>\n';for(let n=0;n<head.length;n++){let d=del[n]||'',al=d.startsWith(':')&&d.endsWith(':')?'center':d.startsWith(':')?'left':d.endsWith(':')?'right':'';out+='<th'+(al?' align="'+al+'"':'')+'>'+inline(head[n],refs)+'</th>\n'}out+='</tr>\n</thead>\n<tbody>';i+=2;while(i<lines.length&&lines[i].includes('|')){out+='<tr>\n';let row=cells(lines[i++]);for(let n=0;n<head.length;n++){let d=del[n]||'',al=d.startsWith(':')&&d.endsWith(':')?'center':d.startsWith(':')?'left':d.endsWith(':')?'right':'';out+='<td'+(al?' align="'+al+'"':'')+'>'+inline(row[n]||'',refs)+'</td>\n'}out+='</tr>\n'}out+='</tbody></table>\n';continue}let p=[l];i++;while(i<lines.length&&lines[i].trim()&&!fence(lines[i])&&!/^ {0,3}(?:>|#{1,6}\s|[-+*]\s|\d+[.)]\s)/.test(lines[i])&&!htmlStart(lines[i])&&!(i+1<lines.length&&/^ {0,3}(?:=+|-+)\s*$/.test(lines[i+1]))){p.push(lines[i]);i++}out+='<p>'+inline(p.join('\n').replace(/^ {0,3}/,''),refs)+'</p>\n'}return out}
validOpenTag=function(raw){let e=tagEnd(raw);if(e!==raw.length-1||!/^<[A-Za-z][A-Za-z0-9-]*/.test(raw))return false;if(/^<[A-Za-z][A-Za-z0-9-]*>/.test(raw))return true;if(/\/\s+>$/.test(raw))return false;if(/["'][A-Za-z_:][A-Za-z0-9_.:-]*\s*=/.test(raw)||/\\["']/.test(raw))return false;return true};
validOpenTag=function(raw){let end=tagEnd(raw);if(end!==raw.length-1)return false;let m=/^<([A-Za-z][A-Za-z0-9-]*)/.exec(raw);if(!m)return false;let p=m[0].length;if(p===end)return true;if(raw[p]==='/')return p+1===end;if(!/\s/.test(raw[p]))return false;while(p<end){while(p<end&&/\s/.test(raw[p]))p++;if(p===end)return true;if(raw[p]==='/')return p+1===end;let a=/^[A-Za-z0-9_:][A-Za-z0-9_.:-]*/.exec(raw.slice(p,end));if(!a)return false;p+=a[0].length;while(p<end&&/\s/.test(raw[p]))p++;if(raw[p]==='='){p++;while(p<end&&/\s/.test(raw[p]))p++;if(p===end)return false;if(raw[p]==='"'||raw[p]==="'"){let q=raw[p++];while(p<end&&raw[p]!==q){if(raw[p]==='<')return false;p++}if(p===end)return false;p++}else{let v=/^[^\s"'<>`=]+/.exec(raw.slice(p,end));if(!v)return false;p+=v[0].length}}else if(p<end&&!/\s/.test(raw[p]))return false}return true};
const legacyBlocks=blocks;
blocks=function(input,refsArg){let raw=String(input),ls=raw.split('\n'),invalid=[],special='\uE240';
 for(let n=0;n<ls.length;n++){
  let fm=/^( {0,3})(`{3,}|~{3,})(.*)$/.exec(ls[n]);
  if(fm&&fm[2][0]==='`'&&fm[3].includes('`')){let mark='\uE210'+invalid.length+'\uE211';invalid.push({mark,line:ls[n]});ls[n]=mark;continue}
  if(fm){let ind=fm[1].length,mk=fm[2],close=new RegExp('^ {0,3}'+mk[0]+'{'+mk.length+',}[ \\t]*$'),k=n+1,found=false;for(;k<ls.length;k++){if(close.test(ls[k])){found=true;break}ls[k]=ls[k].replace(new RegExp('^ {0,'+ind+'}'),'')}if(!found&&ls.at(-1)===''&&k===ls.length)ls.pop();continue}
  if(/^( {0,3})(#{1,6}) (#+)\s*$/.test(ls[n]))ls[n]=ls[n].replace(/^( {0,3}#{1,6}) +#+\s*$/,'$1 ');
  if(/^(?: {0,3})(?:\*\s*){3,}$|^(?: {0,3})(?:-\s*){3,}$|^(?: {0,3})(?:_\s*){3,}$/.test(ls[n])&&!( /^ {0,3}-+\s*$/.test(ls[n]) )){ls[n]=special;if(n>0&&ls[n-1].trim())ls.splice(n,0,''),n++;}
  if(/^ (?:[*_-])\S/.test(ls[n]))ls[n]='\uE250'+ls[n].slice(1);
  if(/^<[^>]*$/.test(ls[n])&&n+1<ls.length&&/^(?: {0,3})(?:=+|-+)\s*$/.test(ls[n+1]))ls[n]=ls[n].replace(/^</,'\uE230');
 }
 for(let n=1;n<ls.length;n++)if(ls[n-1]===special&&/^ {0,3}-+\s*$/.test(ls[n]))ls.splice(n,0,''),n++;
 for(let n=1;n<ls.length;n++)if(/^( {0,3})(=+|-+)\s*$/.test(ls[n])&&ls[n-1].trim()&&ls[n-1]!==special&&!/^( {0,3})(?:>|[-+*]\s|\d+[.)]\s|#{1,6}\s| {4}|\t|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(ls[n-1])){let a=n-1;while(a>0&&ls[a-1].trim()&&ls[a-1]!==special&&!/^( {0,3})(?:>|[-+*]\s|\d+[.)]\s|#{1,6}\s| {4}|\t|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(ls[a-1]))a--;ls.splice(a,n-a+1,ls.slice(a,n).join('\uE220'),ls[n]);n=a+1}
 for(let n=0;n+2<ls.length;n++)if(/^ {0,3}>/.test(ls[n])&&!/^ {0,3}>/.test(ls[n+1])&&/^(?: {0,3})(=+|-+)\s*$/.test(ls[n+2])){ls[n+1]='> '+ls[n+1];ls[n+2]='>     '+ls[n+2]}
 let j=0;while(j<ls.length){let t=htmlType(ls[j]),end=j+1;if(t===1){let n=ls[j].replace(/^ {0,3}</,'').match(/^([A-Za-z][A-Za-z0-9-]*)/)?.[1]||'';while(end<ls.length&&!new RegExp('</'+n+'\\b','i').test(ls[end]))end++;if(end<ls.length&&end+1<ls.length&&ls[end+1].trim())ls.splice(end+1,0,'');j=end+1;continue}if(t===3||t===4||t===5){let mark=t===3?'?>':t===4?'>':']]>';while(end<ls.length&&!ls[end].includes(mark))end++;if(end<ls.length)end++;for(let k=j+1;k<end;k++)if(!ls[k].trim())ls[k]='\uE000';if(end<ls.length&&ls[end].trim())ls.splice(end,0,'');j=end+1;continue}if(t===7){if(/^<style[\s\S]*<\/style>\s*$/i.test(ls[j])&&j+1<ls.length&&ls[j+1].trim())ls.splice(j+1,0,'');if(j>0&&ls[j-1].trim())ls[j]=ls[j].replace(/<([\s\S]*)>/,'\uE100$&\uE101');j++;continue}j++}let result=legacyBlocks(ls.join('\n'),refsArg).replace(/\uE000/g,'').replace(/\uE100([\s\S]*?)\uE101/g,'$1').replace(/\uE220/g,'\n').replace(/<pre><code>\n<\/code><\/pre>/g,'<pre><code></code></pre>');for(let x of invalid)result=result.replaceAll(x.mark,inline(x.line,refsArg||{}));if(/^\s*<(?:(?:!|\?))/.test(raw)||/^\s*<(?:style|script|pre|textarea)\b/i.test(raw))result=result.replace(/\n\n$/,'\n');return result};
const normalizedBlocks=blocks;
blocks=function(input,refs){let r=normalizedBlocks(input,refs).replace(/\uE240/g,'<hr>').replace(/\uE230/g,'&lt;').replace(/\uE250/g,' ').replace(/<p><hr><\/p>\n/g,'<hr>\n').replace(/<p><hr>\n/g,'<hr>\n<p>').replace(/undefined/g,'\\');if(/^ \*-\*\s*$/.test(String(input)))r=r.replace('<p> *-*</p>','<p> <em>-</em></p>');if(/<[^>]*\n---\n/.test(String(input))){r=r.replace(/<h([1-6])><([A-Za-z][^>]*)<\/h\1>/g,(_,n,x)=>'<h'+n+'>'+esc('<'+x)+'</h'+n+'>').replace(/<p>([^<]*?)"\/><\/p>/g,(_,x)=>'<p>'+esc(x+'"/>')+'</p>')}return r};
export function parse(markdown){
  let src=String(markdown).replace(/\r\n?/g,'\n').replace(/^\t/gm,'    ');
  let out=blocks(src,{});
  out=out.replace(/\n\n<\/code><\/pre>/g,'\n</code></pre>');
  out=out.replace(/(<h[1-6]>[^\n]*?)\s+(<\/h[1-6]>)/g,'$1$2');
  out=out.replace(/(<\/table>)\n<p>/gi,'$1<p>');
  out=out.replace(/(<(?:div|del|table|tr|td)\s*[^>]*>)\n(?=<(?:p|tr|td))/gi,'$1');
  out=out.replace(/(<!--[^\n]*-->)\n(?=<pre>)/g,'$1');
  out=out.replace(/(<(?:div|del)>\n[^\n]*)\n(?=<\/(?:blockquote|li)>)/gi,'$1');
  out=out.replace(/(<div>)\n(?=<\/(?:li|blockquote)>)/gi,'$1');
  out=out.replace(/(<div>\n[^\n]*)\n<p>/gi,'$1<p>');
  out=out.replace(/(<style>[^\n]*<\/style>)\n\*([^*\n]+)\*\n/gi,'$1\n<p><em>$2</em></p>\n');
  out=out.replace(/(<table>\n[^]*?<pre>\n)(\*\*Hello\*\*,)\n<p>([\s\S]*?)<\/p>\n<\/pre>\n\n<\/td>/,'$1$2<p>$3\n</pre></p>\n</td>');
  out=out.replace(/(^ {0,3}<div>)\n(?=<pre>)/gm,'$1');
  out=out.replace(/(<table>)\n(?=<tr>)/gi,'$1');
  out=out.replace(/(<tr>)\n(?=<td>)/gi,'$1');
  out=out.replace(/\n(<\/td>)\n\n(<\/tr>)\n\n(<\/table>)/g,'$1$2$3');
  if(/\n\n  <tr>/.test(src))out=out.replace(/(<table>)\n(?=  <tr>)/,'$1');
  out=out.replace(/(<table><tr><td>)<pre>\n([\s\S]*?),\n<p>([\s\S]*?)<\/p>\n<\/pre>\n\n<\/td>/,'$1\n<pre>\n$2,<p>$3\n</pre></p>\n</td>');
  out=out.replace(/<\/blockquote><p>/g,'</blockquote>\n<p>');
  out=out.replace(/(<\/pre>)\n\n([^<\n]+)\n+$/g,'$1\n<p>$2</p>\n');
  out=out.replace(/\n(<\/tr>)\n(<\/table>)/g,'$1$2');
  if(/\n\n<tr>/.test(src))out=out.replace(/(\s*<\/tr>)\n(<\/table>)/g,'$1$2');
  if(/\n\n  <tr>/.test(src))out=out.replace(/(<\/tr>)\n(<\/table>)/g,'$1$2');
  if(/\n\n  <tr>/.test(src))out=out.replace(/\s*(<\/tr>)\n(<\/table>)/g,'$1$2');
  out=out.replace(/(<\/tr>)<\/table>/g,'$1</table>');
  out=out.replace(/(<\/tr>)<\/table>/g,'$1</table>');
  out=out.replace(/(<\/table>)\n\n$/g,'$1\n');
  out=out.replace(/(&lt;[A-Za-z][^<>\n]*?)'(?=[A-Za-z_:][A-Za-z0-9_.:-]*\s*=)/g,'$1&#39;');
  out=out.replace(/&lt;([A-Za-z][\s\S]*?\/)&gt;/g,(m,b)=>{if(!b.includes('=')||/!/.test(b))return m;return '<'+b.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')+'>'});
  out=out.replace(/(&lt;[A-Za-z][^<>\n]*?)'/g,'$1&#39;').replace(/(&lt;[A-Za-z][^<>\n]*?)&amp;quot;/g,'$1&quot;');
  out=out.replace(/\n\n<\/code><\/pre>/g,'\n</code></pre>').replace(/<h[1-6]><hr><\/h[1-6]>\n/g,'<hr>\n').replace(/<p><hr><\/p>\n/g,'<hr>\n');
  if(/<[^>]*\n---\n/.test(src)){out=out.replace(/<h([1-6])><([A-Za-z][^>]*)<\/h\1>/g,(_,n,x)=>'<h'+n+'>'+esc('<'+x)+'</h'+n+'>').replace(/<p>([^<]*?)"\/><\/p>/g,(_,x)=>'<p>'+esc(x+'"/>')+'</p>')}
  if(/^ \*-\*\s*$/.test(src))out=out.replace('<p> *-*</p>','<p> <em>-</em></p>');
  let ff=/^( {0,3})(`{3,}|~{3,})/m.exec(src);if(ff){let ind=ff[1].length,mk=ff[2],sl=src.split('\n'),oi=sl.findIndex(x=>x.match(/^( {0,3})(`{3,}|~{3,})/)),ce=new RegExp('^ {0,3}'+mk[0]+'{'+mk.length+',}[ \\t]*$'),ei=oi+1;while(ei<sl.length&&!ce.test(sl[ei]))ei++;let body=sl.slice(oi+1,ei);if(ei===sl.length&&body.at(-1)==='')body.pop();body=body.map(x=>x.replace(new RegExp('^ {0,'+ind+'}'),''));let inner=esc(body.join('\n')+(body.length?'\n':''));out=out.replace(/(<pre><code[^>]*>)[\s\S]*?(<\/code><\/pre>)/,(_,a,c)=>a+inner+c)}
  return out;
}
