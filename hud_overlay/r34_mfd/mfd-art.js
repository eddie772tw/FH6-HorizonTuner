/* Original low/wide MFD case, recessed lens and decorative molded controls. */
(function(root) {
'use strict';
const { path,circle,txt,ln,tick }=root.R34Artwork;
function mfd(){
 let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 244" aria-hidden="true"><g transform="translate(1 6)">';
 const outer='M9 226L17 80Q21 30 49 18Q77 5 133 4H379Q439 5 465 24Q483 41 488 90L499 227Q448 243 401 237L23 235Q13 234 9 226Z';
 s+=path(outer,'url(#mfdBrow)','stroke="#191f23" stroke-width="1.5"');s+=path(outer,'url(#plastic)');
 s+=path('M20 221L28 83Q30 47 52 36Q75 23 130 23H378Q428 22 451 38Q468 53 471 90L484 221Q444 232 409 225L36 226Z','#11161a');
 const front='M31 217L39 87Q40 53 61 43Q86 32 134 32H375Q417 31 438 45Q454 57 458 91L472 219Q437 228 403 219L44 222Z';
 s+=path(front,'url(#mfdFace)','stroke="#535b5f" stroke-width=".7"');s+=path(front,'url(#plastic)');
 s+=path('M43 83Q43 43 68 42H339Q360 42 360 61L361 193Q359 212 340 214H66Q46 215 44 200Z','url(#lens)','stroke="#676c6b" stroke-width=".8"');
 s+=path('M47 81Q46 48 68 47H337Q354 47 355 64L356 192Q354 207 337 208H68Q52 209 51 197Z','#080b0f','stroke="#07090b" stroke-width="2"');
 // LCD sits below the deep brow; no fake top title or tutorial footer.
 s+=path('M62 45H332','none','stroke="#53616a" stroke-width=".75"');
 s+=txt(408,69,'REV.',10,'#b5bfc2');s+='<g id="r34RevLamp">';s+=circle(408,81,6.5,'#121619','stroke="#485158" stroke-width="1.2"')+circle(408,81,3.4,'#29282a','class="r34-rev-core"')+path('M405 79Q408 76 411 79','none','stroke="#60666b" stroke-width=".8"');
 s+='</g>';s+=circle(383,123,10.5,'#252a2d','stroke="#525a5d" stroke-width=".8"');
 s+=txt(431,116,'PUSH',7.2,'#adb8b9')+txt(431,125,'ENTER/RESET',7.2,'#adb8b9');
 s+=circle(416,172,43,'#131a1e','stroke="#626c6e" stroke-width="1"');
 s+=circle(416,172,40,'url(#chrome)','stroke="#b6bcb6" stroke-width=".65"');
 s+=circle(416,172,35.2,'#333b3d','stroke="#555e5f" stroke-width="1"');
 s+=circle(416,172,32,'#8c9490');s+=circle(416,172,24.8,'#12191d','stroke="#687277" stroke-width=".8"');s+=circle(416,172,21.5,'url(#thumb)','stroke="#343e44" stroke-width=".6"');s+=circle(416,172,13,'url(#thumb)','stroke="#465259" stroke-width=".6"');
 for(let a=0;a<360;a+=90)s+=tick(416,172,32,38,a,'#141b1e',3.2);
 s+='<g class="r34-bezel-keys">';
 ['DISP','RETURN','MENU','MODE'].forEach((v,i)=>{let x=133+i*51;s+=path(`M${x+4} 204H${x+52}L${x+49} 221H${x}Z`,'url(#button)','stroke="#101619" stroke-width="1.1"');s+=txt(x+25,216,v,7.6,'#c0c8c5','font-style="italic"');});
 s+='</g>';
 s+=path('M16 229Q23 238 53 237H380Q442 240 491 230','none','stroke="#41494b" stroke-width="1"');
 s+='</g></svg>';return s;
}

root.R34MfdArt={markup:mfd};
})(window);
