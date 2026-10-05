/* Original SVG primitives, numeral strokes and material definitions. No OEM image/font assets. */
(function(root) {
'use strict';
const f = n => Number(n.toFixed(3));
const pt = (x,y,r,a) => [f(x+r*Math.cos(a*Math.PI/180)),f(y+r*Math.sin(a*Math.PI/180))];
const path = (d, fill, rest='') => `<path d="${d}" fill="${fill}" ${rest}/>`;
const circle = (x,y,r,fill,rest='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${rest}/>`;
const rect = (x,y,w,h,fill,rest='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${rest}/>`;
const txt = (x,y,s,size=12,fill='#d4d5d5',rest='') => `<text x="${x}" y="${y}" font-family="Liberation Sans, sans-serif" font-size="${size}" fill="${fill}" ${rest.includes("text-anchor=") ? "" : "text-anchor=\"middle\""} ${rest}>${s}</text>`;
const ln = (x1,y1,x2,y2,col,width=1,rest='')=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${width}" ${rest}/>`;
const tick = (x,y,r1,r2,a,col='#e4e5e3',w=1)=>{let p=pt(x,y,r1,a),q=pt(x,y,r2,a);return ln(...p,...q,col,w)};
const arc = (x,y,r,a,b)=>{let p=pt(x,y,r,a),q=pt(x,y,r,b);return `M${p.join(' ')}A${r} ${r} 0 ${b-a>180?1:0} 1 ${q.join(' ')}`};
const digitPaths = {
 '0':'M3 0Q0 0 0 3V15Q0 18 3 18H6Q9 18 9 15V3Q9 0 6 0Z',
 '1':'M2 3L5 0V18',
 '2':'M0 3Q0 0 3 0H6Q9 0 9 3V5Q9 7 7 9L1 15Q0 16 0 18H9',
 '3':'M0 1Q2 0 4 0H6Q9 0 9 3V5Q9 9 5 9H3M5 9Q9 9 9 13V15Q9 18 6 18H3Q1 18 0 17',
 '4':'M7 18V0H6L0 12H10',
 '5':'M9 0H0V8H6Q9 8 9 11V15Q9 18 6 18H3Q0 18 0 16',
 '6':'M8 1Q7 0 5 0H4Q0 0 0 5V15Q0 18 3 18H6Q9 18 9 15V11Q9 8 6 8H3Q0 8 0 11',
 '7':'M0 0H9L3 18',
 '8':'M3 0Q0 0 0 3V5Q0 9 4.5 9Q9 9 9 5V3Q9 0 6 0ZM4.5 9Q0 9 0 13V15Q0 18 3 18H6Q9 18 9 15V13Q9 9 4.5 9Z',
 '9':'M1 17Q2 18 4 18H5Q9 18 9 13V3Q9 0 6 0H3Q0 0 0 3V7Q0 10 3 10H6Q9 10 9 7',
 '.':'M3 17L3 18', '-':'M1 9H7'
};
function digits(x,y,value,h=20,col='#e1e3e3',weight=1.45,italic=false,widthScale=1.12) {
 const chars=String(value).split(''), scale=h/18, width=widthScale*chars.reduce((n,c)=>n+(c==='.'?5:c==='1'?9:12),-3)*scale;
 let dx=0,s=`<g transform="translate(${f(x-width/2)} ${f(y-h/2)}) scale(${scale*widthScale} ${scale})" fill="none" stroke="${col}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">`;
 for(const c of chars){s+=`<g transform="translate(${dx} 0)${italic?' skewX(-5)':''}">${path(digitPaths[c]||'', 'none')}</g>`;dx+=c==='.'?5:c==='1'?9:12;}
 return s+'</g>';
}
const defs = `<defs>





 <linearGradient id="chrome" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#e0e0d7"/><stop offset=".16" stop-color="#b0b2ab"/><stop offset=".31" stop-color="#656b6c"/><stop offset=".5" stop-color="#b1b5ae"/><stop offset=".68" stop-color="#dddcd1"/><stop offset=".85" stop-color="#7b8381"/><stop offset="1" stop-color="#444b4c"/></linearGradient>


 <radialGradient id="face"><stop stop-color="var(--r34-face)"/><stop offset=".78" stop-color="#1e1f21"/><stop offset="1" stop-color="#141618"/></radialGradient>
 <linearGradient id="lcd" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#76806b"/><stop offset=".45" stop-color="var(--r34-lcd)"/><stop offset="1" stop-color="#919e82"/></linearGradient>

 <radialGradient id="sector"><stop stop-color="#898f83"/><stop offset="1" stop-color="#626c61"/></radialGradient>
 <linearGradient id="peak" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#3f747b"/><stop offset=".12" stop-color="#346169"/><stop offset="1" stop-color="#1c3947"/></linearGradient>



</defs>`;
function needle(x,y,len,angle,id){return `<g id="${id}" transform="translate(${x} ${y}) rotate(${angle})">${path(`M-17 -1.7L${len-8} -1.3L${len} 0L${len-8} 1.3L-17 1.7Z`,'#cb252c')}${ln(0,-.7,len-7,-.6,'#fa4a42',.65)}${circle(0,0,11,'#141619')}${circle(-.5,-.5,8.4,'#25272a')}${path('M-6 -6Q0 -11 7 -5','none','stroke="#414245" stroke-width=".8"')}</g>`;}
function coolant(x,y){return `<g transform="translate(${x} ${y})" fill="none" stroke="#bcc0bf" stroke-width="1.3" stroke-linecap="round"><path d="M-2 -8v12a3 3 0 1 0 4 0V-8M0 -7v11M2 -5h4M2 -1h4M2 3h4M-8 10q2 -2 4 0t4 0t4 0t4 0"/></g>`;}
function oil(x,y){return `<g transform="translate(${x} ${y}) scale(.72)" fill="none" stroke="#b9bdbb" stroke-width="1.1"><path d="M-8 -2h10l4 -4 5 1-1 2-5 3-1 5h-11l-3 -7-4 -1v-3l6 1M-1 -2v-4h4M12 3q3 4 0 4q-3 0 0 -4"/></g>`;}
function fuel(x,y){return `<g transform="translate(${x} ${y})" fill="none" stroke="#c6c9c7" stroke-width="1.4"><path d="M-6 7V-8h9V7M-8 7h13M-4 -6h5v5h-5zM4 -5l4 3v7q0 3 3 3V-3l-4 -5M8 -6v3h3"/></g>`;}
function dial(x,y,r){return circle(x,y,r+2.5,'#0d1114')+circle(x,y,r+1,'#464b4a')+circle(x,y,r,'url(#face)')+path(arc(x,y,r-.9,205,330),'none','stroke="#727576" stroke-width=".6" opacity=".55"');}

root.R34Artwork = { f, pt, path, circle, rect, txt, ln, tick, arc, digits, defs, needle, coolant, oil, fuel, dial };
})(window);
