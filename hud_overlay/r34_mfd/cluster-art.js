/* Original front-view cluster drawing, informed by the 1999 brochure and OEM reference photos. */
(function(root) {
'use strict';
const { path,circle,rect,txt,ln,tick,pt,digits,needle,coolant,oil,fuel,dial }=root.R34Artwork;
function cluster(){
 let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 350" role="img" aria-label="1999 BNR34 V-spec stock 180 km/h and two-stage 10000 rpm cluster"><g>';
 let hood='M10 326L12 222Q13 142 80 93Q189 8 374 5Q576 4 677 89Q742 143 746 225L750 326Q694 338 614 337L465 329Q422 327 404 318Q379 307 355 318Q336 328 295 330L125 337Q58 338 10 326Z';
 s+=path(hood,'url(#hood)','stroke="#111417" stroke-width="3"');
 s+=path(hood,'url(#plastic)');
 s+=path('M17 226Q19 146 85 98Q195 15 375 12Q570 12 672 97Q735 149 740 227','none','stroke="#606568" stroke-width="1.3" opacity=".7"');
 s+=path('M23 325L25 230Q28 166 98 129Q229 61 380 57Q540 61 661 126Q727 164 733 230L738 325Q692 332 615 332L464 324Q421 322 403 312Q378 302 354 312Q335 323 294 325L124 332Q59 333 23 325Z','#0c0f13');
 let plate='M29 318L30 221Q32 207 48 206L116 203Q135 202 140 184L153 125Q159 107 173 101L321 91Q330 113 342 113H419Q430 113 440 91L583 99Q603 105 610 126L623 184Q627 203 645 205L714 208Q731 211 733 231L731 318Q675 326 619 325L466 319Q421 317 403 307Q379 297 355 307Q335 318 292 320L123 326Q61 326 29 318Z';
 s+=path(plate,'url(#metal)','stroke="#858b88" stroke-width=".8"');s+=path(plate,'url(#brush)');
 s+=dial(251,207,108)+dial(508,207,108)+dial(83,266,55)+dial(679,266,55);
 s+='<g id="r34TachFace">';
 for(let r=0;r<=10000;r+=200){const a=root.R34Instruments.tachAngle(r),major=r%1000===0;
  s+=tick(251,207,major?94:99,104,a,r>=8000?'#b02a32':'#e1e2df',major?2.2:1.05);
  if(major){let [x,y]=pt(251,207,r<3000?81:77,a);s+=digits(x,y,r/1000,r<3000?14:18.5,'#e1e3e1',1.9,true);}
 }
 s+=txt(251,174,'x1000r/min',12,'#dadeda','font-style="italic"');
 s+='</g><g id="r34SpeedFace">';
 for(let v=0;v<=180;v+=10){const a=root.R34Instruments.speedAngle(v), major=v%20===0;
  s+=tick(508,207,major?94:98,104,a,'#e1e3df',major?2.2:1.2);
  if(major){let [x,y]=pt(508,207,73,a);s+=digits(x,y,v,17,'#e0e3df',1.9,true);}
 }
 s+=txt(508,173,'km/h',12,'#d9ddd7','font-style="italic"');
 s+='</g>';
 // Native inset oil gauge. It remains unavailable: there is deliberately no oil needle.
 s+=path('M205 272Q251 249 297 272L293 289Q251 323 209 291Z','none');
 for(let n=0;n<=8;n++){const a=135-n*90/8;s+=tick(251,257,43,n%4===0?52:48,a,'#aab0ac',n%4===0?1.7:.9);}
 for(const n of [0,4,8]){let [x,y]=pt(251,257,33,135-n*90/8);s+=digits(x,y,n,12,'#c6cbc7',1.4);}
 s+=oil(248,261)+txt(278,268,'kg/cm²',5.8,'#8b938f');
 s+=txt(251,278,'N/A',10.5,'#acb3af');
 // The coolant scale is on the right half, fuel scale on the left half.
 for(const a of [-52,-35,38,52])s+=tick(83,266,42,50,a,'#d8ddda',Math.abs(a)===52?2.3:1.4);
 s+=txt(98,228,'H',14)+txt(98,313,'C',14)+coolant(76,263)+txt(76,287,'N/A',10,'#b3bbb5');
 for(const a of [128,145,215,232])s+=tick(679,266,42,50,a,'#d8ddda',Math.abs(a-180)===52?2.3:1.4);
 s+=txt(666,231,'F',14)+txt(666,314,'E',14)+fuel(684,266);
 s+=rect(460,271,96,28,'#0c1013','rx="7" stroke="#393e3d" stroke-width="1.5"');
 s+=rect(466,276,84,17,'url(#lcd)','rx="2"');
 s+=txt(506,289,'—',16,'var(--r34-lcd-ink)','id="r34Distance" class="r34-lcd-readout"')+txt(542,289,'km',5,'#455241','id="r34DistanceUnit"');
 s+=needle(251,207,96,135,'r34TachNeedle')+needle(508,207,95,140,'r34SpeedNeedle')+needle(679,266,46,128,'r34FuelNeedle');
 s+=circle(459,220,1.6,'#0a0d10')+circle(284,219,1.5,'#0a0d10')+circle(221,219,1.5,'#0a0d10');
 // Odometer reset stalk, fitted inside the original fascia opening.
 s+=path('M629 294l11 -9q3 -2 5 1l1 4-12 9q-5 2-5 -5Z','#15191b','stroke="#51575a" stroke-width=".8"');
 s+=path('M43 321Q139 329 288 322Q332 320 353 311Q379 301 405 311Q425 321 469 322L617 329Q685 330 730 320','none','stroke="#a6ada8" stroke-width=".7" opacity=".45"');
 s+='</g>';
 return s+'</svg>';
}

root.R34ClusterArt={markup:cluster};
})(window);
