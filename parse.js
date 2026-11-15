const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const entities = s => s.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\w]+);/gi,(m,n)=>{try{return String.fromCodePoint(n[0]==='#'?(n[1].toLowerCase()==='x'?parseInt(n.slice(2),16):+n.slice(1)):({amp:38,lt:60,gt:62,quot:34,apos:39,nbsp:160,copy:169,reg:174,trade:8482,mdash:8212,ndash:8211,hellip:8230}[n]||0))||m}catch{return m}});
const inline = (src, refs={}) => {
 let s=src.replace(/\\([!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~])/g,(_,c)=>'\0'+c.charCodeAt(0)+';').replace(/`+([^`]*?)`+/g,(_,x)=>'<code>'+esc(x.replace(/[\n\t ]+/g,' ').replace(/^ | $/g,''))+'</code>');
 s=s.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\w]+);/gi,(m)=>entities(m));
 s=s.replace(/!\[([^\]]*)\]\((<?[^\s)]*>?)(?:\s+["']([^"']*)["'])?\)/g,(_,a,u,t)=>`<img src="${esc(u.replace(/^<|>$/g,''))}" alt="${esc(a)}"${t?` title="${esc(t)}"`:''}>`)
 .replace(/\[([^\]]+)\]\((<?[^\s)]*>?)(?:\s+["']([^"']*)["'])?\)/g,(_,a,u,t)=>`<a href="${esc(u.replace(/^<|>$/g,''))}"${t?` title="${esc(t)}"`:''}>${inline(a,refs)}</a>`)
 .replace(/\[([^\]]+)\]\[([^\]]*)\]/g,(_,a,k)=>{let r=refs[(k||a).toLowerCase()];return r?`<a href="${esc(r.url)}"${r.title?` title="${esc(r.title)}"`:''}>${inline(a,refs)}</a>`:_})
 .replace(/<((?:https?:\/\/|ftp:\/\/)[^ >]+)>/gi,'<a href="$1">$1</a>').replace(/<([\w.+-]+@[\w.-]+\.[a-z]{2,})>/gi,'<a href="mailto:$1">$1</a>')
 .replace(/\b(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/gi,'<a href="$1">$1</a>').replace(/\b([\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi,'<a href="mailto:$1">$1</a>')
 .replace(/\*\*(.+?)\*\*|__(.+?)__/gs,(_,a,b)=>'<strong>'+inline(a||b,refs)+'</strong>').replace(/\*(.+?)\*|_(.+?)_/gs,(_,a,b)=>'<em>'+inline(a||b,refs)+'</em>').replace(/~~(.+?)~~/gs,'<del>$1</del>')
 .replace(/\\\n/g,'<br>\n').replace(/\n/g,'\n').replace(/\0(\d+);/g,(_,n)=>String.fromCharCode(+n));
 return s;
};
export function parse(markdown) {
 let src=String(markdown).replace(/\r\n?/g,'\n').replace(/\0/g,''); const refs={};
 src=src.replace(/^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?(?:\s+["'(]([^"')]+)["')])?\s*$/gm,(_,k,url,title)=>{refs[k.toLowerCase()]={url,title};return ''});
 const lines=src.split('\n'); let i=0;
 const blocks=(stop='')=>{let out=''; while(i<lines.length){let l=lines[i], t=l.trim(); if(!t){i++;continue} if(stop&&new RegExp('^ {0,3}'+stop).test(l))break;
 let m;
 if((m=/^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(l))){out+=`<h${m[1].length}>${inline(m[2].replace(/\s+#+\s*$/,''),refs)}</h${m[1].length}>\n`;i++;continue}
 if(/^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/.test(l)){out+='<hr>\n';i++;continue}
 if(/^ {0,3}```|^ {0,3}~~~/.test(l)){let fence=l.trim().slice(0,3),lang=l.trim().slice(3).trim().split(/\s/)[0];i++;let c=[];while(i<lines.length&&!new RegExp('^ {0,3}'+fence).test(lines[i]))c.push(lines[i++]);if(i<lines.length)i++;out+=`<pre><code${lang?` class="language-${esc(lang)}"`:''}>${esc(c.join('\n'))}${c.length?'\n':''}</code></pre>\n`;continue}
 if(/^ {0,3}>/.test(l)){let q=[];while(i<lines.length&&/^ {0,3}>/.test(lines[i]))q.push(lines[i++].replace(/^ {0,3}> ?/,''));let old=lines;lines.splice(i,0,...[]);out+='<blockquote>\n'+parse(q.join('\n'))+'</blockquote>\n';continue}
 if(/^ {0,3}</.test(l)){let tag=l.match(/^\s*<([a-z!/?]+)/i)?.[1]?.toLowerCase(); if(tag&&/^(address|article|aside|base|blockquote|body|div|dl|fieldset|footer|form|h[1-6]|head|header|hr|html|iframe|li|main|nav|ol|p|pre|script|section|style|table|ul|!--)/.test(tag)){let a=[l];i++;while(i<lines.length&&lines[i].trim())a.push(lines[i++]);out+=a.join('\n')+'\n';continue}}
 if(i+1<lines.length&&/^ {0,3}(=+|-+)\s*$/.test(lines[i+1])){let level=lines[i+1].trim()[0]==='='?1:2;out+=`<h${level}>${inline(t,refs)}</h${level}>\n`;i+=2;continue}
 if(i+1<lines.length&&l.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){let cells=x=>x.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());let h=cells(l),a=cells(lines[i+1]);out+='<table>\n<thead>\n<tr>\n'+h.map((v,n)=>`<th${a[n]?.startsWith(':')?` align="${a[n].endsWith(':')?'center':'left'}"`:a[n]?.endsWith(':')?' align="right"':''}>${inline(v,refs)}</th>\n`).join('')+'</tr>\n</thead>\n<tbody>\n';i+=2;while(i<lines.length&&lines[i].includes('|')){out+='<tr>\n'+cells(lines[i++]).map((v,n)=>`<td>${inline(v,refs)}</td>\n`).join('')+'</tr>\n'}out+='</tbody>\n</table>\n';continue}
 if(/^\s*[-+*]\s+/.test(l)||/^\s*\d+[.)]\s+/.test(l)){let ordered=/^\s*\d/.test(l),start=l.match(/^\s*(\d+)/)?.[1]||'1',tag=ordered?'ol':'ul';out+=`<${tag}${ordered&&start!=='1'?` start="${start}"`:''}>\n`;while(i<lines.length&&(/^\s*[-+*]\s+/.test(lines[i])||/^\s*\d+[.)]\s+/.test(lines[i]))){let v=lines[i++].replace(/^\s*(?:[-+*]|\d+[.)])\s+/,'');let task=/^\[([ xX])\]\s*(.*)$/.exec(v);out+=`<li>${task?`<input${task[1].toLowerCase()==='x'?' checked=""':''} disabled="" type="checkbox"> `:''}${inline(task?task[2]:v,refs)}</li>\n`}out+=`</${tag}>\n`;continue}
 let p=[l.trim()];i++;while(i<lines.length&&lines[i].trim()&&!/^ {0,3}(?:#{1,6}\s|>|```|~~~|[-*+]\s|\d+[.)]\s)/.test(lines[i])){p.push(lines[i++].trim())}out+='<p>'+inline(p.join('\n'),refs)+'</p>\n';
 }return out}; return blocks();
}
