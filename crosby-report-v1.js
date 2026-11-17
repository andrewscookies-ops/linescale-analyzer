
/* TAG Load-cell Analyzer — Crosby Straightpoint report workflow v1
   Distinct from LineScale processing. Local CSV import; no uploads. */
(function(){
"use strict";
var S={tests:[],current:0,chart:null,drag:null,planImage:null,gesture:null,pointers:new Map()};
var $=function(id){return document.getElementById(id);};
var template=function(){return {a:0,b:10,showA:true,showB:true,band:true,bandColor:"#D2B48C",bandAlpha:.25,above:false,aboveColor:"#22c55e",aboveAlpha:.18,aboveScope:"all",below:false,belowColor:"#3b82f6",belowAlpha:.18,belowScope:"all"};};
var project={
 date:"November 12, 2026",client:"Camp Seneca Lake",location:"",manager:"Rich Petteruti",tester:"Benjamin Browand",
 course:"The new Camp Seneca Lake challenge course is installed on 50-foot utility poles and supported by ground anchors. New course anchors were installed by The Adventure Guild. Existing anchors for the Giant Swing and Zip Line were also tested.",
 procedure:"Ground anchors are pulled in line to the specified minimum load and held for the required duration without creep. Stamped engineering requirements take precedence.",
 policy:"Ground anchor installation and testing on most The Adventure Guild projects is the responsibility of TAG. On new installations, the testing requirements are outlined in stamped drawings provided by a licensed engineer. In the absence of stamped engineering, TAG follows applicable ACCT standards and TAG procedures. Stamped engineering requirements supersede TAG procedures.",
 disclaimer:"For TAG internal use only. This report is not an industry standard or a substitute for engineering practice.",
 pass:"The anchor met the stated test criteria and is ready to use.",
 fail:"The anchor did not meet the stated test criteria and must not be used.",
 ni:"The anchor was not tested; its use is subject to TAG policy.",
 model:"Crosby Straightpoint Tensionmeter BLD6T5",serial:"40554",
 minimum:3000,hold:10
};
var fieldMap=[
 ["date","Testing date"],["client","Client"],["location","Location"],["manager","Project manager"],
 ["tester","Testing performed by"],["model","Measuring device / model"],["serial","Device serial"],
 ["course","Challenge course description","long"],["procedure","Description of testing procedure","long"],
 ["policy","Testing policy","long"],["disclaimer","Disclaimer","long"],
 ["pass","Pass definition","long"],["fail","Fail definition","long"],["ni","Not inspected definition","long"]
];
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function safeName(s){return String(s||"TAG-Load-cell-Report").trim().replace(/[^a-z0-9_-]+/gi,"_").slice(0,64)||"TAG-Load-cell-Report";}
function numeric(id,def){var v=Number($(id)?.value);return Number.isFinite(v)?v:def;}
function status(text,bad){var e=$("csStatus");if(e){e.textContent=text;e.style.color=bad?"#ffb4a8":"#9ef4d5";}}
function selected(){return S.tests[S.current]||null;}
function lb(value,unit){
 var x=Number(String(value).replace(/,/g,"")),u=String(unit||"").toLowerCase().replace(/\s+/g,"");
 if(!Number.isFinite(x))return null;
 if(u==="lb"||u==="lbf"||u==="lbs")return x;
 if(u==="kg"||u==="kgf")return x*2.2046226218;
 if(u==="kn")return x*224.8089431;
 if(u==="n")return x*.2248089431;
 return null;
}
function csvRows(text){
 var out=[],row=[],cell="",quoted=false,s=String(text||"").replace(/^\uFEFF/,"");
 for(var i=0;i<s.length;i++){
  var c=s[i];
  if(quoted){if(c==='"'&&s[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
  else if(c==='"')quoted=true;
  else if(c===","){row.push(cell.trim());cell="";}
  else if(c==="\n"||c==="\r"){
   row.push(cell.trim());cell="";
   if(row.some(function(v){return v!=="";}))out.push(row);
   row=[];if(c==="\r"&&s[i+1]==="\n")i++;
  }else cell+=c;
 }
 row.push(cell.trim());if(row.some(function(v){return v!=="";}))out.push(row);
 return out;
}
function parseClock(v){
 var m=String(v||"").trim().match(/^(\d{1,2}):(\d\d):(\d\d)(?::(\d+))?$/);
 if(!m)return NaN;
 return Number(m[1])*3600+Number(m[2])*60+Number(m[3])+(m[4]?Number(m[4])/Math.pow(10,m[4].length):0);
}
// At 1 Hz, gaps >1.5 seconds cannot count as a continuous observed hold.
function firstQualifyingHold(points,limit,seconds){
 limit=Number(limit);seconds=Number(seconds);
 if(!Array.isArray(points)||!points.length||!Number.isFinite(limit)||!Number.isFinite(seconds)||seconds<0)return null;
 var start=-1,prev=null;
 for(var i=0;i<points.length;i++){
  var p=points[i];
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){start=-1;prev=null;continue;}
  if(p.y<limit){start=-1;prev=p;continue;}
  if(start<0||!prev||p.x<=prev.x||p.x-prev.x>1.5)start=i;
  if(p.x-points[start].x>=seconds-1e-7)return {a:points[start].x,b:points[start].x+seconds};
  prev=p;
 }
 return null;
}
function placeAutomaticMarkers(t,force){
 if(!t||t.markerManual&&!force)return false;
 var q=firstQualifyingHold(t.points,project.minimum,project.hold);
 if(q){t.style.a=q.a;t.style.b=q.b;t.style.showA=t.style.showB=true;}
 else{t.style.a=0;t.style.b=Math.min(t.duration,Math.max(0,project.hold));t.style.showA=t.style.showB=false;}
 t.markerManual=false;return !!q;
}
function parseCrosby(name,text){
 var rows=csvRows(text);
 var mi=rows.findIndex(function(r){return String(r[0]||"").toLowerCase()==="start shift"&&String(r[1]||"").toLowerCase()==="datalog type";});
 var hi=rows.findIndex(function(r){return String(r[0]||"").toLowerCase()==="device"&&r.some(function(c){return String(c).toLowerCase()==="value";});});
 if(mi<0||hi<0||!rows[mi+1])throw Error("Not a Crosby report with the expected metadata and Device / Time / Value columns.");
 var m=rows[mi+1],header=rows[hi].map(function(x){return x.toLowerCase().trim();});
 var cols={time:header.indexOf("time"),value:header.indexOf("value"),unit:header.indexOf("unit"),device:header.indexOf("device"),date:header.indexOf("log date")};
 if(cols.time<0||cols.value<0||cols.unit<0)throw Error("Missing time, value, or unit column.");
 var points=[],last=NaN,offset=0,unitSet={},device="";
 for(var i=hi+1;i<rows.length;i++){
  var r=rows[i],t=parseClock(r[cols.time]),unit=r[cols.unit],force=lb(r[cols.value],unit);
  if(!Number.isFinite(t)||force===null)continue;
  unitSet[String(unit).trim()]=1;
  if(Number.isFinite(last)&&t+offset<last-43200)offset+=86400;
  t+=offset;
  if(Number.isFinite(last)&&t<last)continue;
  if(!Number.isFinite(last))last=t;
  points.push({x:+(t-last).toFixed(3),y:+force.toFixed(4),stamp:r[cols.time]});
  if(!device&&cols.device>=0)device=r[cols.device];
 }
 if(points.length<2)throw Error("No usable timestamped force readings found.");
 points.sort(function(a,b){return a.x-b.x;});
 var rawId=String(m[0]||"").trim(),match=rawId.match(/^\d+/),num=match?Number(match[0]):null;
 var duration=points[points.length-1].x;
 var t={name:name,id:rawId,device:device,date:rows[hi+1]?.[cols.date]||"",originalUnit:Object.keys(unitSet).join(", "),
 points:points,duration:duration,peak:Math.max.apply(null,points.map(function(p){return p.y;})),
 anchor:num&&num<=999?num:null,title:num?"Anchor "+num:"Unassigned anchor",
 rating:"Pending review",comments:"",style:template(),enabled:true,view:null,markerManual:false};
 placeAutomaticMarkers(t,true);
 // A new recording must start in precisely the same full view as Reset / Fit.
 // Loading a saved setup may intentionally override this per-recording view.
 t.view=fitCrosbyView(t);
 return t;
}
function holdStats(t,threshold){
 var data=t.points,steps=[];for(var i=1;i<data.length;i++)if(data[i].x>data[i-1].x)steps.push(data[i].x-data[i-1].x);
 steps.sort(function(a,b){return a-b;});var step=steps.length?steps[Math.floor(steps.length/2)]:1;
 var tolerance=Math.max(step*1.55,.15),start=-1,best=0,range=null;
 for(var j=0;j<data.length;j++){
  if(data[j].y>=threshold){
   if(start<0||j>0&&data[j].x-data[j-1].x>tolerance)start=j;
   if(start>=0){var dur=data[j].x-data[start].x;if(dur>best||!range){best=dur;range=[data[start].x,data[j].x];}}
  }else start=-1;
 }
 return {hold:best,range:range,peak:t.peak};
}
function isMapped(t){return t.anchor!==null&&t.anchor!==""&&Number.isFinite(Number(t.anchor));}
function ordered(){return S.tests.filter(function(t){return t.enabled;}).slice().sort(function(a,b){return (Number(a.anchor)||9999)-(Number(b.anchor)||9999)||a.name.localeCompare(b.name);});}
function duration(t){return t?Number(t.duration).toFixed(1):"0.0";}
function color(hex,alpha){var m=String(hex).match(/^#([\da-f]{6})$/i);if(!m)return "rgba(0,0,0,.1)";var q=m[1];return "rgba("+parseInt(q.slice(0,2),16)+","+parseInt(q.slice(2,4),16)+","+parseInt(q.slice(4,6),16)+","+Math.max(0,Math.min(.85,alpha||0))+")";}
function install(){
 if($("csWorkflow"))return;
 var hero=document.querySelector("section.hero");
 if(!hero)return;
 var box=document.createElement("section");box.id="csWorkflow";box.className="card";
 box.innerHTML=[
 '<div class="cs-inline" style="justify-content:space-between"><div><h2>Anchor load testing &amp; report builder</h2></div><span class="cs-flag">Crosby CSV</span></div>',
 '<p class="cs-intro">Import Crosby CSV recordings, review anchor assignments and adjust the graphs, then download an editable Word document with three graphs per page. All processing stays in your browser.</p>',
 '<div class="cs-toolbar cs-import-tools"><button type="button" class="cs-primary" id="csImport">＋ Import up to 50 Crosby CSVs</button><input id="csFiles" type="file" accept=".csv,text/csv" multiple hidden><span class="cs-muted" id="csCount">0 / 50 loaded</span><button type="button" id="csDemo">Load an example</button><button type="button" id="csReset">Clear imports</button><div class="cs-toolbar-criteria"><label>Minimum test load (lb)<input id="csTarget" type="number" min="0" step="10" value="3000"></label><label>Hold (seconds)<input id="csHold" type="number" min="0" step="1" value="10"></label></div></div>',
 '<div class="cs-status" id="csStatus" role="status" aria-live="polite"></div>',
 '<details open><summary>1 · Review recordings and anchor assignments</summary><p class="cs-muted">Confirm each anchor assignment and select which tests to include. Imported files are never modified.</p><div class="cs-scroll"><table><thead><tr><th>Graph</th><th>Crosby log ID / filename</th><th>Anchor #</th><th>Anchor description</th><th>Peak (lb)</th><th>Max observed hold</th><th>Include</th></tr></thead><tbody id="csRows"></tbody></table></div></details>',
 '<div class="cs-panel" id="csGraphPanel"><h3 id="csGraphHeading">2 · Graph editor — import data to begin</h3>',
 '<div class="cs-toolbar cs-main-tools"><button type="button" id="csPrevious">← Previous</button><button type="button" id="csNext">Next →</button><button type="button" data-cs-view="autoscale" title="Show 10 seconds before marker A and after marker B with 0–4,000 lb force scale">Auto Scale</button><button type="button" data-cs-view="reset">Reset / Fit</button></div>',
 '<div class="cs-graph-workspace">',
 '<div class="cs-plot-column">',
 '<div class="cs-chart"><canvas id="csCanvas" aria-label="Crosby load over time"></canvas></div><div class="cs-graph-stats" id="csStats"></div>',
 '<p class="cs-muted cs-gesture-help">A/B markers auto-place on a qualifying hold. Drag a marker to snap live to recorded measurements (typically every second). Hold Alt/Option while dragging for free positioning, or type an exact time. Scroll or pinch to zoom; drag elsewhere to pan.</p>',
 '<div class="cs-edit cs-marker-controls"><label><input type="checkbox" id="csShowA" checked> Show A <input type="number" min="0" step="any" id="csMarkerA" value="0" aria-label="Marker A time seconds"> seconds</label><label><input type="checkbox" id="csShowB" checked> Show B <input type="number" min="0" step="any" id="csMarkerB" value="10" aria-label="Marker B time seconds"> seconds</label></div>',
 '<div class="cs-marker-actions"><button type="button" id="csWindow" title="Restore the automatically detected A/B hold without changing zoom or axes">↺ Reset A/B</button></div>',
 '</div>',
 '<aside class="cs-graph-inspector" aria-label="Graph view and shading settings">',

 '<div class="cs-inspector-options">',
 '<details class="cs-advanced"><summary>Advanced controls</summary>',
 '<section class="cs-axis-controller" aria-labelledby="csAxisHeading">',
 '<div class="cs-axis-title"><strong id="csAxisHeading">Graph view</strong></div>',
 '<div class="cs-axis-row">',
 '<div class="cs-dpad" role="group" aria-label="Move graph view">',
 '<span class="cs-pad-blank" aria-hidden="true"></span><button type="button" data-cs-pan="up" aria-label="Move graph view up" title="Pan upward">↑</button><span class="cs-pad-blank" aria-hidden="true"></span>',
 '<button type="button" data-cs-pan="left" aria-label="Move graph view left" title="Pan left">←</button><span class="cs-pad-center" aria-hidden="true">●</span><button type="button" data-cs-pan="right" aria-label="Move graph view right" title="Pan right">→</button>',
 '<span class="cs-pad-blank" aria-hidden="true"></span><button type="button" data-cs-pan="down" aria-label="Move graph view down" title="Pan downward">↓</button><span class="cs-pad-blank" aria-hidden="true"></span>',
 '</div>',
 '<div class="cs-axis-bounds" role="group" aria-label="Edit graph axis boundaries">',
 '<label>X start <span>s</span><input id="csXStart" type="number" step="any" inputmode="decimal" aria-label="X-axis start seconds"></label>',
 '<label>X end <span>s</span><input id="csXEnd" type="number" step="any" inputmode="decimal" aria-label="X-axis end seconds"></label>',
 '<label>Y min <span>lb</span><input id="csYMin" type="number" step="any" inputmode="decimal" aria-label="Y-axis minimum pounds"></label>',
 '<label>Y max <span>lb</span><input id="csYMax" type="number" step="any" inputmode="decimal" aria-label="Y-axis maximum pounds"></label>',
 '</div></div>',
 '<div class="cs-zoom-row" role="group" aria-label="Graph zoom controls"><span class="cs-zoom-label">Zoom</span><div class="cs-zoom-buttons">',
 '<button type="button" data-cs-view="out" aria-label="Zoom out" title="Zoom out to see more of the graph"><span aria-hidden="true">−</span> Out</button>',
 '<button type="button" data-cs-view="in" aria-label="Zoom in" title="Zoom in to inspect graph details"><span aria-hidden="true">＋</span> In</button>',
 '</div></div>',
 '</section>',
 '<div class="cs-toolbar"><button type="button" id="csPng">Save graph as PNG</button></div>',
 '<label>Anchor comments<textarea id="csComments" rows="2" placeholder="Identification, creep observations, notes"></textarea></label>',
 '</details>',
 '<details class="cs-advanced"><summary>Shading options</summary>',
 '<div class="cs-fill-row"><label class="cs-check"><input type="checkbox" id="csBand" checked> Shade A–B</label><label>Color<input type="color" id="csBandColor" value="#D2B48C"></label><label>Opacity<input type="range" id="csBandAlpha" min="0" max=".75" step=".05" value=".25"></label></div>',
 '<div class="cs-fill-row"><label class="cs-check"><input type="checkbox" id="csAbove"> Fill above line</label><label>Color<input type="color" id="csAboveColor" value="#22c55e"></label><label>Opacity<input type="range" id="csAboveAlpha" min="0" max=".75" step=".05" value=".2"></label></div>',
 '<div class="cs-fill-row"><label class="cs-check"><input type="checkbox" id="csBelow"> Fill below line</label><label>Color<input type="color" id="csBelowColor" value="#3b82f6"></label><label>Opacity<input type="range" id="csBelowAlpha" min="0" max=".75" step=".05" value=".2"></label></div>',
 '<div class="cs-edit"><label>Above-fill range<select id="csAboveScope"><option value="all">Entire recording</option><option value="markers">A–B only</option></select></label><label>Below-fill range<select id="csBelowScope"><option value="all">Entire recording</option><option value="markers">A–B only</option></select></label></div>',
 '<div class="cs-toolbar"><button type="button" id="csStyleAll">Copy shading to all</button><button type="button" id="csClearStyle">Clear shading</button></div>',
 '</details>',
 '</div>',
 '</aside>',
 '</div></div>',
 '<div class="cs-panel cs-download-panel"><h3>3 · Download</h3><p class="cs-muted">The default download includes only the selected graphs, three per page, in an editable Word document.</p>',
 '<div class="cs-export-actions"><button type="button" class="cs-primary cs-download-main" id="csExportGraphs">Download Graphs (Word)</button><button type="button" id="csOpenFullReport">Complete Word Report…</button></div>',
 '</div>',
 '<dialog id="csFullReportDialog" class="cs-full-report-dialog" aria-labelledby="csFullReportHeading"><h3 id="csFullReportHeading">Word Report Content</h3>',
 '<p class="cs-muted">Complete Word Report: review or edit the project information below. These fields are used only in the complete report; graph downloads do not require them.</p>',
 '<div class="cs-fields" id="csProjectFields"></div>',
 '<div class="cs-toolbar"><label>Site plan / diagram (optional)<input id="csPlanFile" type="file" accept="image/png,image/jpeg"></label><span class="cs-muted" id="csPlanName">No diagram selected</span></div>',
 '<p class="cs-status" id="csFullReportStatus" role="status" aria-live="polite"></p>',
 '<div class="cs-export-actions"><button type="button" id="csCancelFullReport">Cancel</button><button type="button" class="cs-primary" id="csExportFullReport">Download Complete Word Report</button></div></dialog>'
 ].join("");
 hero.insertAdjacentElement("afterend",box);
 var fieldRoot=$("csProjectFields");
 fieldMap.forEach(function(item){
  var lab=document.createElement("label");if(item[2]==="long")lab.className="cs-field-full";
  lab.textContent=item[1];
  var input=document.createElement(item[2]==="long"?"textarea":"input");
  input.id="csField_"+item[0];input.value=project[item[0]]||"";
  if(input.tagName==="TEXTAREA")input.rows=3;
  input.addEventListener("input",function(){project[item[0]]=this.value;});
  lab.appendChild(input);fieldRoot.appendChild(lab);
 });
 bind();
 status("Crosby mode ready. Import CSVs to generate graphs.");
}
function currentStyle(){return selected()?.style||template();}
function currentStyleFromUI(e){
 var t=selected();if(!t)return;
 if(e&&["csMarkerA","csMarkerB","csShowA","csShowB"].includes(e.target?.id))t.markerManual=true;
 var s=t.style;
 s.a=Math.max(0,Math.min(t.duration,numeric("csMarkerA",s.a)));
 s.b=Math.max(0,Math.min(t.duration,numeric("csMarkerB",s.b)));
 s.showA=$("csShowA").checked;s.showB=$("csShowB").checked;
 s.band=$("csBand").checked;s.bandColor=$("csBandColor").value;s.bandAlpha=numeric("csBandAlpha",.2);
 s.above=$("csAbove").checked;s.aboveColor=$("csAboveColor").value;s.aboveAlpha=numeric("csAboveAlpha",.2);
 s.below=$("csBelow").checked;s.belowColor=$("csBelowColor").value;s.belowAlpha=numeric("csBelowAlpha",.2);
 s.aboveScope=$("csAboveScope").value;s.belowScope=$("csBelowScope").value;
 draw();
}
function setControl(id,value){var e=$(id);if(!e)return;if(e.type==="checkbox")e.checked=Boolean(value);else e.value=value;}
function loadStyle(){
 var t=selected();if(!t)return;
 var s=t.style;
 [["csMarkerA",s.a],["csMarkerB",s.b],["csShowA",s.showA],["csShowB",s.showB],
 ["csBand",s.band],["csBandColor",s.bandColor],["csBandAlpha",s.bandAlpha],
 ["csAbove",s.above],["csAboveColor",s.aboveColor],["csAboveAlpha",s.aboveAlpha],
 ["csBelow",s.below],["csBelowColor",s.belowColor],["csBelowAlpha",s.belowAlpha],
 ["csAboveScope",s.aboveScope],["csBelowScope",s.belowScope]].forEach(function(x){setControl(x[0],x[1]);});
 $("csComments").value=t.comments||"";
}
function markerPoint(chart,x){
 return chart.scales.x.getPixelForValue(x);
}
function span(style,t){
 var a=Math.max(0,Math.min(t.duration,Number(style.a)||0)),b=Math.max(0,Math.min(t.duration,Number(style.b)||0));
 return [Math.min(a,b),Math.max(a,b)];
}
function interpolated(data,x){
 if(x<=data[0].x)return data[0].y;
 if(x>=data[data.length-1].x)return data[data.length-1].y;
 var lo=0,hi=data.length-1;
 while(hi-lo>1){var mid=(hi+lo)>>1;if(data[mid].x<=x)lo=mid;else hi=mid;}
 var p=data[lo],q=data[hi],d=q.x-p.x;
 return p.y+(q.y-p.y)*(d?(x-p.x)/d:0);
}
function overlay(chart,phase){
 var t=chart.$crosby;
 if(!t)return;
 var s=t.style,ca=chart.chartArea,x=chart.scales.x,y=chart.scales.y,ctx=chart.ctx;
 if(!ca||!x||!y)return;
 var spans=span(s,t),lower=spans[0],upper=spans[1];
 ctx.save();ctx.beginPath();ctx.rect(ca.left,ca.top,ca.right-ca.left,ca.bottom-ca.top);ctx.clip();
 if(phase==="fill"){
  if(s.band&&s.showA&&s.showB&&upper>lower){
   ctx.fillStyle=color(s.bandColor,s.bandAlpha);
   var px1=x.getPixelForValue(lower),px2=x.getPixelForValue(upper);
   ctx.fillRect(px1,ca.top,px2-px1,ca.bottom-ca.top);
  }
  ["below","above"].forEach(function(k){
   if(!s[k])return;
   var clipped=s[k+"Scope"]==="markers"&&s.showA&&s.showB;
   var start=clipped?lower:0,end=clipped?upper:t.duration;
   if(end<=start)return;
   var data=t.points,pts=[{x:start,y:interpolated(data,start)}];
   data.forEach(function(p){if(p.x>start&&p.x<end)pts.push(p);});
   pts.push({x:end,y:interpolated(data,end)});
   ctx.beginPath();ctx.moveTo(x.getPixelForValue(start),k==="above"?ca.top:ca.bottom);
   pts.forEach(function(p){ctx.lineTo(x.getPixelForValue(p.x),y.getPixelForValue(p.y));});
   ctx.lineTo(x.getPixelForValue(end),k==="above"?ca.top:ca.bottom);ctx.closePath();
   ctx.fillStyle=color(s[k+"Color"],s[k+"Alpha"]);ctx.fill();
  });
 }else{
  [["a","A","#c97700"],["b","B","#d83c5d"]].forEach(function(spec){
   if(!s["show"+spec[1]])return;
   var v=s[spec[0]],px=markerPoint(chart,Math.max(0,Math.min(t.duration,v)));
   ctx.strokeStyle=spec[2];ctx.lineWidth=2;ctx.setLineDash([7,4]);ctx.beginPath();ctx.moveTo(px,ca.top);ctx.lineTo(px,ca.bottom);ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle=spec[2];ctx.fillRect(px-10,ca.top,20,20);
   ctx.fillStyle="#fff";ctx.font="bold 12px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(spec[1],px,ca.top+10);
  });
 }
 ctx.restore();
}
var shadingPlugin={
 id:"crosbyShading",
 beforeDatasetsDraw:function(chart){overlay(chart,"fill");},
 afterDatasetsDraw:function(chart){overlay(chart,"markers");}
};
function fitCrosbyView(t){
 // Start each Crosby graph at 0–4,000 lb regardless of measured peak.
 return {xmin:0,xmax:Math.max(1,t.duration),ymin:0,ymax:4000};
}
// Explicit Focus A–B uses the marker span plus context without moving markers.
function focusCrosbyView(t){
 var full=fitCrosbyView(t),a=Number(t.style?.a),b=Number(t.style?.b);
 if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(b-a)<.5)return full;
 var lo=Math.min(a,b),hi=Math.max(a,b),hold=hi-lo;
 var padding=Math.max(3,Math.min(6,hold*.4));
 var width=Math.min(Math.max(1,t.duration),Math.max(16,hold+2*padding));
 if(!Number.isFinite(width)||width>=t.duration)return full;
 var middle=(lo+hi)/2;
 var left=Math.max(0,Math.min(t.duration-width,middle-width/2));
 return {xmin:+left.toFixed(3),xmax:+(left+width).toFixed(3),ymin:full.ymin,ymax:full.ymax};
}
function crosbyView(t){return t.view?Object.assign({},t.view):fitCrosbyView(t);}
// Display A/B with 10 seconds of context on either side. Keep the complete
// requested window where feasible, shifting near recording boundaries.
function autoScaleCrosbyView(t){
 if(!t||!t.style?.showA||!t.style?.showB)return null;
 var a=Number(t.style.a),b=Number(t.style.b);
 if(!Number.isFinite(a)||!Number.isFinite(b))return null;
 var lo=Math.min(a,b),hi=Math.max(a,b),width=Math.max(1,hi-lo+20);
 var start=Math.max(0,lo-10);
 if(Number.isFinite(t.duration)&&t.duration>=width&&start+width>t.duration)
  start=Math.max(0,t.duration-width);
 return {xmin:start,xmax:start+width,ymin:0,ymax:4000};
}
function validateCrosbyAxisRange(start,end){
 var lo=Number(start),hi=Number(end);
 if(String(start).trim()===""||String(end).trim()===""||
    !Number.isFinite(lo)||!Number.isFinite(hi)||hi<=lo)return null;
 return {xmin:lo,xmax:hi};
}
function syncCrosbyAxisInputs(t){
 var fields=[["csXStart","xmin"],["csXEnd","xmax"],["csYMin","ymin"],["csYMax","ymax"]];
 var v=t?crosbyView(t):null;
 fields.forEach(function(item){
  var el=$(item[0]);if(!el)return;
  el.value=v?String(Number(v[item[1]].toFixed(6))):"";
 });
}
function applyCrosbyAxisInputs(){
 var t=selected();if(!t)return;
 var x=validateCrosbyAxisRange($("csXStart").value,$("csXEnd").value);
 var y=validateCrosbyAxisRange($("csYMin").value,$("csYMax").value);
 if(!x||!y){
  status("Enter valid X and Y limits. Each maximum must be greater than its minimum.",true);
  return;
 }
 setCrosbyView({xmin:x.xmin,xmax:x.xmax,ymin:y.xmin,ymax:y.xmax});
}

function crosbyTickStep(viewSpan,chartWidth){
 // Crosby's usual 1 Hz readings should have 1-second tick granularity.
 // When zoomed in below one second, show fractional ticks. Longer windows
 // can use coarser steps; Chart.js hides overlapping labels automatically.
 if(viewSpan>=1&&viewSpan<=120)return 1;
 var desired=viewSpan/Math.max(6,Math.floor((chartWidth||720)/32));
 var steps=[.001,.002,.005,.01,.02,.05,.1,.2,.25,.5,1,2,5,10,20,30,60,120,300,600,1200];
 for(var i=0;i<steps.length;i++)if(steps[i]>=desired-1e-9)return steps[i];
 return Math.ceil(desired/1200)*1200;
}
function crosbySampleSeconds(t){
 var steps=[];
 for(var i=1;i<t.points.length;i++){
  var d=t.points[i].x-t.points[i-1].x;
  if(d>0&&Number.isFinite(d))steps.push(d);
 }
 if(!steps.length)return null;
 steps.sort(function(a,b){return a-b;});
 return steps[Math.floor(steps.length/2)];
}
function graphConfig(t,widthHint){
 var threshold=Math.max(0,project.minimum),max=Math.max(threshold,t.peak)*1.17,v=crosbyView(t);
 var width=widthHint||$("csCanvas")?.getBoundingClientRect()?.width||720;
 var step=crosbyTickStep(v.xmax-v.xmin,width);
 return {
  type:"line",
  data:{datasets:[
   {label:"Load (lb)",data:t.points,parsing:false,borderColor:"#13559f",borderWidth:2.5,
    backgroundColor:"#13559f",pointBackgroundColor:"#13559f",pointBorderColor:"#ffffff",pointBorderWidth:.6,
    pointRadius:function(ctx){var x=ctx.chart.scales.x;var span=x?x.max-x.min:v.xmax-v.xmin;return span<=32?3:span<=55?1.6:0;},
    pointHoverRadius:5,pointHitRadius:9,tension:0,order:1},
   {label:"Minimum "+threshold.toLocaleString()+" lb",data:[{x:0,y:threshold},{x:t.duration,y:threshold}],parsing:false,
    borderColor:"#dd5238",borderWidth:1.6,borderDash:[7,5],pointRadius:0,order:2}
  ]},
  plugins:[shadingPlugin],
  options:{
   responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:1,
   onResize:function(chart,size){
    var x=chart.scales?.x;if(!x)return;
    chart.options.scales.x.ticks.stepSize=crosbyTickStep(x.max-x.min,size.width);
    chart.options.scales.x.ticks.maxTicksLimit=Math.max(6,Math.floor(size.width/52));
   },
   parsing:false,normalized:true,
   plugins:{legend:{display:false},tooltip:{enabled:true,callbacks:{
    title:function(items){return items.length?"Time: "+Number(items[0].parsed.x).toFixed(2).replace(/\.00$/,"")+" s":"";},
    label:function(ctx){return ctx.datasetIndex===0?"Measured force: "+Math.round(ctx.parsed.y).toLocaleString()+" lb":"Minimum load";}
   }}},
   scales:{
    x:{type:"linear",min:v.xmin,max:v.xmax,title:{display:true,text:"Elapsed time (seconds)",color:"#526479"},
      ticks:{color:"#526479",stepSize:step,autoSkip:true,maxTicksLimit:Math.max(6,Math.floor(width/52)),maxRotation:0,
       callback:function(value){return Number(value).toLocaleString(undefined,{maximumFractionDigits:2});}},
      grid:{color:"#e4e8ec"}},
    y:{type:"linear",min:v.ymin,max:v.ymax,title:{display:true,text:"Force (lb)",color:"#526479"},ticks:{color:"#526479",callback:function(v){return Number(v).toLocaleString();}},grid:{color:"#dfe5e9"}}
   }
  }
 };
}
function refreshCrosbyStats(t){
 if(!t)return;
 var measured=holdStats(t,project.minimum),valid=firstQualifyingHold(t.points,project.minimum,project.hold),a=Number(t.style.a),b=Number(t.style.b);
 var span=Math.abs(b-a),lo=Math.min(a,b),hi=Math.max(a,b);
 var count=t.points.filter(function(p){return p.x>=lo-1e-5&&p.x<=hi+1e-5;}).length;
 var step=crosbySampleSeconds(t),sampler=step===null?"":(Math.abs(step-1)<.07?"1 Hz sampling":"Typical sample interval: "+step.toFixed(2)+" s");
 $("csStats").innerHTML="<span>Peak: <strong>"+Math.round(t.peak).toLocaleString()+" lb</strong></span>"+
  "<span>Recorded hold ≥ "+project.minimum.toLocaleString()+" lb: <strong>"+measured.hold.toFixed(1)+" s</strong></span>"+
  (t.style.showA&&t.style.showB?"<span>A–B markers: <strong>"+Number(span.toFixed(3))+" s</strong> ("+count+" measured points)</span>":"<span>A/B: not placed</span>")+
  (!valid?"<span class='cs-warning'>No qualifying "+project.hold+" s hold at "+project.minimum.toLocaleString()+" lb — review required</span>":"")+
  (t.peak>crosbyView(t).ymax?"<span class='cs-warning'>Peak exceeds visible Y-axis ("+Math.round(t.peak).toLocaleString()+" lb). Adjust force view to inspect.</span>":"")+
  "<span>"+sampler+"</span>";
}
function draw(){
 var t=selected(),canvas=$("csCanvas");if(!canvas)return;
 if(S.chart){S.chart.destroy();S.chart=null;}
 if(!t){$("csGraphHeading").textContent="2 · Graph editor — import data to begin";$("csStats").textContent="";syncCrosbyAxisInputs(null);return;}
 if(typeof Chart==="undefined"){status("Chart.js is unavailable. Check network access.",true);return;}
 $("csGraphHeading").textContent="2 · "+(t.title||"Anchor") + " — Crosby log "+t.id;
 refreshCrosbyStats(t);
 S.chart=new Chart(canvas,graphConfig(t));S.chart.$crosby=t;
 // Initial render must follow exactly the same axis/tick update path as
 // Reset / Fit. Each imported graph starts with fitCrosbyView(t), while
 // manually edited/saved views remain intact on later previews.
 setCrosbyView(crosbyView(t));
}
function renderRows(){
 var host=$("csRows");if(!host)return;
 host.innerHTML=S.tests.map(function(t,i){
  var m=holdStats(t,project.minimum);
  return '<tr data-index="'+i+'" class="'+(i===S.current?"cs-selected":"")+'"><td><button type="button" data-open="'+i+'">View</button></td>'
   +'<td><strong class="cs-id">'+esc(t.id)+'</strong><br><span class="cs-mini">'+esc(t.name)+'</span></td>'
   +'<td><input type="number" min="1" max="999" data-prop="anchor" value="'+(isMapped(t)?esc(t.anchor):"")+'" placeholder="Assign" style="max-width:80px"></td>'
   +'<td><input type="text" data-prop="title" value="'+esc(t.title)+'"></td>'
   +'<td>'+Math.round(t.peak).toLocaleString()+'</td><td>'+m.hold.toFixed(1)+' s</td>'
   +'<td><input type="checkbox" data-prop="enabled" '+(t.enabled?"checked":"")+' aria-label="Include '+esc(t.name)+'"></td></tr>';
 }).join("");
 $("csCount").textContent=S.tests.length+" / 50 loaded · "+ordered().length+" included";
}
function preview(i,forceRedraw){
 if(!S.tests.length)return;
 var next=Math.max(0,Math.min(S.tests.length-1,i));
 // Step 1 View is only a selection action. Reopening the currently displayed
 // recording must not recreate its chart or change any live view/annotations.
 if(!forceRedraw&&next===S.current&&S.chart&&S.chart.$crosby===S.tests[next])return;
 S.current=next;
 // Each test owns its X/Y window, marker coordinates and shading. Selecting a
 // different test displays that saved state; it never recalculates/reset it.
 loadStyle();renderRows();draw();
}
function refresh(){
 if(!S.tests.length)S.current=0;
 else S.current=Math.min(S.current,S.tests.length-1);
 renderRows();
 if(selected())preview(S.current,true);else draw();
 $("csPrevious").disabled=S.tests.length<2;$("csNext").disabled=S.tests.length<2;
 ["csExportGraphs","csOpenFullReport","csExportFullReport","csPng","csStyleAll","csWindow"].forEach(function(id){$(id).disabled=!S.tests.length;});
 var autoBtn=document.querySelector('#csWorkflow [data-cs-view="autoscale"]');
 if(autoBtn)autoBtn.disabled=!S.tests.length;
}
async function importFiles(files){
 if(!files||!files.length)return;
 // Keep the full selection before the picker resets its live FileList.
 files=Array.from(files);
 var successes=0,errors=[];
 for(var i=0;i<files.length;i++){
  var file=files[i];
  if(S.tests.length>=50){errors.push("50-file maximum reached; extra files were not imported.");break;}
  if(S.tests.some(function(x){return x.name===file.name;})){errors.push(file.name+": already imported");continue;}
  try{
   var parsed=parseCrosby(file.name,await file.text());
   S.tests.push(parsed);successes++;
  }catch(e){errors.push(file.name+": "+e.message);}
 }
 S.tests.sort(function(a,b){return (Number(a.anchor)||9999)-(Number(b.anchor)||9999)||a.name.localeCompare(b.name);});
 refresh();
 status(successes+" Crosby recording"+(successes===1?"":"s")+" imported ("+S.tests.length+" / 50 loaded)."+ (errors.length?" "+errors.length+" skipped: "+errors.slice(0,2).join("; "):""),!!errors.length);
}
function setWindow(){
 var t=selected();if(!t)return;
 var found=placeAutomaticMarkers(t,true);
 // Marker reset is distinct from Reset / Fit: preserve the current view.
 loadStyle();draw();
 status(found?"A/B restored to the first qualifying "+project.hold+" s hold.":"No continuous "+project.hold+" s hold above "+project.minimum+" lb. Markers hidden for review.",!found);
}
// Nearest real recorded timestamp for live A/B marker dragging. The CSV data
// is time-sorted; a binary search stays responsive even on large recordings.
// On a midpoint tie, favor the earlier sample.
function nearestCrosbySample(t,value){
 var points=t?.points;
 if(!points?.length||!Number.isFinite(value))return value;
 var lo=0,hi=points.length;
 while(lo<hi){
  var mid=Math.floor((lo+hi)/2);
  if(points[mid].x<value)lo=mid+1;else hi=mid;
 }
 if(lo===0)return points[0].x;
 if(lo===points.length)return points[points.length-1].x;
 var before=points[lo-1].x,after=points[lo].x;
 var epsilon=4*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(before),Math.abs(after));
 return Math.abs(value-before)<=Math.abs(after-value)+epsilon?before:after;
}
// Gentle magnetic snapping on touch/pen release. This deliberately leaves
// typed values and non-nearby fractional marker positions unchanged.
function snapNearbySample(t,value,viewWidth,canvasWidth){
 if(!t||!t.points?.length||!Number.isFinite(value))return value;
 var nearest=t.points[0].x,distance=Math.abs(nearest-value);
 t.points.forEach(function(p){
  var d=Math.abs(p.x-value),eps=4*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(nearest),Math.abs(p.x));
  if(d<distance-eps){nearest=p.x;distance=d;}
 });
 var typicalInterval=crosbySampleSeconds(t);
 var pixelTolerance=6*Math.max(.001,viewWidth)/Math.max(1,canvasWidth||720);
 var tolerance=typicalInterval===null?pixelTolerance:Math.min(pixelTolerance,typicalInterval*.2);
 return distance<=tolerance+4*Number.EPSILON*Math.max(1,Math.abs(value))?nearest:value;
}
function snapCrosbyMarkers(){
 var t=selected();if(!t||!t.points.length)return;
 t.markerManual=true;
 ["a","b"].forEach(function(key){
  var value=Number(t.style[key]);if(!Number.isFinite(value))return;
  // Use actual recorded timestamps, including gaps; equal distances choose earlier.
  var nearest=t.points[0].x;
  t.points.forEach(function(p){
   var tolerance=4*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(nearest),Math.abs(p.x));
   if(Math.abs(p.x-value)<Math.abs(nearest-value)-tolerance)nearest=p.x;
  });
  t.style[key]=nearest;
 });
 loadStyle();draw();
}
function copyStyle(){
 var src=selected();if(!src)return;
 // Only styling; never copy marker coordinates, visibility, zoom or ratings.
 var keys=["band","bandColor","bandAlpha","above","aboveColor","aboveAlpha","aboveScope","below","belowColor","belowAlpha","belowScope"];
 var n=0,review=0;
 S.tests.forEach(function(t){
  if(t===src)return;
  if(!t.markerManual&&!placeAutomaticMarkers(t,false))review++;
  keys.forEach(function(k){t.style[k]=src.style[k];});n++;
 });
 status("Copied shading to "+n+" graph"+(n===1?"":"s")+". Each graph keeps its own A/B positions; manual adjustments preserved."+
 (review?" "+review+" test"+(review===1?" needs":"s need")+" hold review.":""));
}
function clearStyle(){
 var t=selected();if(!t)return;
 t.style.band=false;t.style.above=false;t.style.below=false;loadStyle();draw();
}

function csPx(e){
 var c=$("csCanvas"),r=c.getBoundingClientRect(),ch=S.chart;
 return {x:(e.clientX-r.left)*ch.width/Math.max(1,r.width),y:(e.clientY-r.top)*ch.height/Math.max(1,r.height)};
}
function csFrac(p,a){return {x:(p.x-a.left)/Math.max(1,a.right-a.left),y:(p.y-a.top)/Math.max(1,a.bottom-a.top)};}
function csInside(p,a){return p.x>=a.left&&p.x<=a.right&&p.y>=a.top&&p.y<=a.bottom;}
function crosbyZoom(v,f,x,y){
 f=Math.max(.08,Math.min(12,f));x=Math.min(1,Math.max(0,x));y=Math.min(1,Math.max(0,y));
 var n=Object.assign({},v);
 var w=Math.max(.001,(v.xmax-v.xmin)*f),cx=v.xmin+(v.xmax-v.xmin)*x;n.xmin=cx-w*x;n.xmax=n.xmin+w;
 var h=Math.max(.01,(v.ymax-v.ymin)*f),cy=v.ymin+(v.ymax-v.ymin)*y;n.ymin=cy-h*y;n.ymax=n.ymin+h;
 return n;
}
function crosbyPan(v,dx,dy){
 var n=Object.assign({},v);
 var w=v.xmax-v.xmin;n.xmin-=dx*w;n.xmax-=dx*w;
 var h=v.ymax-v.ymin;n.ymin+=dy*h;n.ymax+=dy*h;
 return n;
}
function setCrosbyView(v){
 var t=selected(),ch=S.chart;if(!t||!ch)return;
 t.view=v;
 ch.options.scales.x.min=v.xmin;ch.options.scales.x.max=v.xmax;
 ch.options.scales.x.ticks.stepSize=crosbyTickStep(v.xmax-v.xmin,ch.chartArea?.width||720);
 ch.options.scales.x.ticks.maxTicksLimit=Math.max(6,Math.floor((ch.chartArea?.width||720)/52));
 ch.options.scales.y.min=v.ymin;ch.options.scales.y.max=v.ymax;ch.update("none");
 syncCrosbyAxisInputs(t);
}
function crosbyAction(action){
 var t=selected();if(!t||!S.chart)return;
 if(action==="reset"){setCrosbyView(fitCrosbyView(t));return;}
 if(action==="autoscale"){
  var view=autoScaleCrosbyView(t);
  if(!view){status("Show A and B markers to use Auto Scale.",true);return;}
  setCrosbyView(view);return;
 }
 if(action==="focus"){setCrosbyView(focusCrosbyView(t));return;}
 var v=crosbyView(t);
 if(action==="in"||action==="out"){setCrosbyView(crosbyZoom(v,action==="in"?.8:1.25,.5,.5));return;}
 setCrosbyView(crosbyPan(v,action==="left"?.15:action==="right"?-.15:0,action==="up"?.15:action==="down"?-.15:0));
}
function panCrosbyPad(direction){
 var t=selected();if(!t||!S.chart)return;
 var v=crosbyView(t),next=Object.assign({},v);
 var dx=(v.xmax-v.xmin)*.1,dy=(v.ymax-v.ymin)*.1;
 if(direction==="left"){next.xmin-=dx;next.xmax-=dx;}
 else if(direction==="right"){next.xmin+=dx;next.xmax+=dx;}
 else if(direction==="up"){next.ymin+=dy;next.ymax+=dy;}
 else if(direction==="down"){next.ymin-=dy;next.ymax-=dy;}
 else return;
 setCrosbyView(next);
}
function dragBind(){
 var c=$("csCanvas");
 function rebase(){
  var t=selected();if(!t||!S.gesture)return;
  S.gesture.base=crosbyView(t);
  S.gesture.start=[...S.pointers.values()].map(function(p){return {x:p.x,y:p.y};});
 }
 function panOrPinch(){
  var g=S.gesture,t=selected(),ch=S.chart;
  if(!g||g.type!=="pan"||!t||!ch?.chartArea)return;
  var a=ch.chartArea,now=[...S.pointers.values()],from=g.start;if(!now.length||!from?.length)return;
  var start=csFrac(from[0],a),end=csFrac(now[0],a),v=g.base;
  if(now.length>1&&from.length>1){
   var mid=function(q){return {x:(q[0].x+q[1].x)/2,y:(q[0].y+q[1].y)/2};};
   var dist=function(q){return Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y);};
   start=csFrac(mid(from),a);end=csFrac(mid(now),a);
   v=crosbyZoom(v,Math.max(.001,dist(from))/Math.max(.001,dist(now)),start.x,1-start.y);
  }
  setCrosbyView(crosbyPan(v,end.x-start.x,end.y-start.y));
 }
 c.addEventListener("pointerdown",function(e){
  if(e.pointerType==="mouse"&&e.button!==0)return;
  var t=selected(),ch=S.chart;if(!t||!ch?.chartArea)return;
  var p=csPx(e),area=ch.chartArea;if(!csInside(p,area))return;
  c.setPointerCapture(e.pointerId);S.pointers.set(e.pointerId,p);
  if(S.pointers.size>1){S.gesture={type:"pan"};rebase();e.preventDefault();return;}
  var candidates=[],st=t.style;
  if(st.showA)candidates.push({key:"a",d:Math.abs(ch.scales.x.getPixelForValue(st.a)-p.x)});
  if(st.showB)candidates.push({key:"b",d:Math.abs(ch.scales.x.getPixelForValue(st.b)-p.x)});
  candidates.sort(function(x,y){return x.d-y.d;});
  S.gesture=candidates.length&&candidates[0].d<20?{type:"marker",key:candidates[0].key}:{type:"pan"};
  if(S.gesture.type==="pan")rebase();
  e.preventDefault();
 });
 c.addEventListener("pointermove",function(e){
  var ch=S.chart,t=selected();if(!ch||!t||!ch.chartArea)return;
  var p=csPx(e);
  if(!S.pointers.has(e.pointerId)){
   var st=t.style,a=st.showA&&Math.abs(ch.scales.x.getPixelForValue(st.a)-p.x)<16,b=st.showB&&Math.abs(ch.scales.x.getPixelForValue(st.b)-p.x)<16;
   c.style.cursor=(a||b)?"ew-resize":"grab";return;
  }
  S.pointers.set(e.pointerId,p);
  var g=S.gesture;
  if(g?.type==="marker"&&S.pointers.size===1){
   var x=ch.scales.x.getValueForPixel(p.x);
   if(Number.isFinite(x)){
    g.moved=true;t.markerManual=true;
    var raw=Math.max(0,Math.min(t.duration,x));
    // Mouse dragging snaps continuously to the actual 1 Hz (or other)
    // recorded sample times. Alt/Option permits exact free dragging.
    g.liveSnap=e.pointerType==="mouse"&&!e.altKey;
    g.freeDrag=e.pointerType==="mouse"&&!!e.altKey;
    t.style[g.key]=g.liveSnap?nearestCrosbySample(t,raw):raw;
    setControl(g.key==="a"?"csMarkerA":"csMarkerB",t.style[g.key]);
    ch.update("none");refreshCrosbyStats(t);
   }
  }else panOrPinch();
  e.preventDefault();
 });
 function end(e,type){
  var g=S.gesture,t=selected(),ch=S.chart;
  if(type==="pointerup"&&g?.type==="marker"&&g.moved&&!g.liveSnap&&!g.freeDrag&&S.pointers.size===1&&t&&ch?.scales?.x){
   var x=ch.scales.x;
   var exact=snapNearbySample(t,t.style[g.key],x.max-x.min,ch.chartArea?.width||ch.width||720);
   if(exact!==t.style[g.key]){
    t.style[g.key]=exact;
    setControl(g.key==="a"?"csMarkerA":"csMarkerB",exact);
    ch.update("none");
    refreshCrosbyStats(t);
   }
  }
  S.pointers.delete(e.pointerId);
  if(!S.pointers.size)S.gesture=null;
  else if(S.gesture){S.gesture.type="pan";rebase();}
 }
 ["pointerup","pointercancel","lostpointercapture"].forEach(function(type){c.addEventListener(type,function(e){end(e,type);});});
 c.addEventListener("wheel",function(e){
  var t=selected(),ch=S.chart;if(!t||!ch?.chartArea)return;
  var p=csPx(e),a=ch.chartArea;if(!csInside(p,a))return;
  e.preventDefault();var q=csFrac(p,a);
  var factor=Math.exp(Math.max(-.6,Math.min(.6,e.deltaY*(e.deltaMode===1?.04:.002))));
  setCrosbyView(crosbyZoom(crosbyView(t),factor,q.x,1-q.y));
 },{passive:false});
 c.addEventListener("dblclick",function(e){var t=selected();if(t){setCrosbyView(fitCrosbyView(t));e.preventDefault();}});
}

function reportData(){
 return {project:Object.assign({},project),tests:S.tests.map(function(t){return {id:t.id,name:t.name,anchor:t.anchor,title:t.title,rating:t.rating,comments:t.comments,style:t.style,enabled:t.enabled,markerManual:!!t.markerManual,view:t.view?Object.assign({},t.view):null};})};
}
function download(blob,name){
 // Large Word reports can contain up to 50 detailed graph images. Give the
 // browser sufficient time to finish saving the ZIP before releasing its URL.
 var url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(function(){URL.revokeObjectURL(url);},120000);
}
function fileStem(){return safeName(project.client||"TAG-Anchor-Testing")+"_"+safeName(project.date||"report");}
function imageDataUrl(buffer,mime){
 var bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer),str="";
 for(var i=0;i<bytes.length;i+=8192)str+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
 return "data:"+(mime||"image/png")+";base64,"+btoa(str);
}
async function graphPNG(t){
 if(typeof Chart==="undefined")throw Error("Chart.js is not available.");
 var c=document.createElement("canvas");c.width=1200;c.height=455;
 c.style.width="1200px";c.style.height="455px";
 var cfg=graphConfig(t,1200);cfg.options.responsive=false;var ch=new Chart(c,cfg);ch.$crosby=t;ch.update("none");
 var png=c.toDataURL("image/png");ch.destroy();return png;
}
async function graphImages(tests){
 var images=[];
 for(var i=0;i<tests.length;i++){
  images.push(await graphPNG(tests[i]));
  if(i%3===2)await new Promise(function(r){setTimeout(r,0);});
 }
 return images;
}
async function loadLibrary(url,globalKey){
 if(window[globalKey])return;
 await new Promise(function(resolve,reject){
  var script=document.createElement("script");script.src=url;script.async=true;
  script.onload=function(){window[globalKey]?resolve():reject(Error("Library did not initialize."));};
  script.onerror=function(){reject(Error("Could not load export library. Please connect to the internet and try again."));};
  document.head.appendChild(script);
 });
}

function paragraph(docx,text,opts){
 return new docx.Paragraph(Object.assign({text:String(text||""),spacing:{after:90}},opts||{}));
}
// The applied-load column records the minimum load specified for the test,
// never the individual graph's peak (which is retained in the source data).
function appliedLoadLabel(){
 var n=Number(project.minimum);
 return ">"+(Number.isFinite(n)&&n>=0?n:0).toLocaleString("en-US",{maximumFractionDigits:2})+" lbs";
}
function wordAnchorRows(tests){
 return [["Anchor # and Location","Rating","Applied Load","Measuring Device","Sheet#"]].concat(
  tests.map(function(t,i){
   var rating=t.rating&&t.rating!=="Pending review"?String(t.rating):"Pending review";
   var instrument=i===0?project.model+"\nSN: "+project.serial:"Crosby: "+project.serial;
   return [t.title||("Anchor "+t.anchor),rating,appliedLoadLabel(),instrument,String(i+1)];
  })
 );
}
function tagRun(d,value,options){
 return new d.TextRun(Object.assign({text:String(value==null?"":value),font:"Arial",size:20,color:"000000"},options||{}));
}
function tagP(d,children,options){
 return new d.Paragraph(Object.assign({
  children:Array.isArray(children)?children:[tagRun(d,children)],
  spacing:{after:0}
 },options||{}));
}
function tagEdge(d){
 return {style:d.BorderStyle.SINGLE,size:5,color:"000000"};
}
function tagTable(d,rows,widths,options){
 var o=options||{},edge=tagEdge(d),none={style:d.BorderStyle.NONE,size:0,color:"FFFFFF"};
 var borders=o.borderless?
  {top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none}:
  {top:edge,bottom:edge,left:edge,right:edge,insideHorizontal:edge,insideVertical:edge};
 var items=rows.map(function(row,rowIndex){
  return new d.TableRow({children:row.map(function(value,i){
   var isHeading=o.headingRows&&rowIndex<o.headingRows;
   var paragraphText=String(value==null?"":value);
   var parts=paragraphText.split("\n");
   var text=[];
   parts.forEach(function(part,j){
    if(j)text.push(new d.TextRun({break:1}));
    text.push(tagRun(d,part,{size:isHeading?(o.headingFontSize||o.fontSize||20):(o.fontSize||20),bold:isHeading&&o.boldHeading===true}));
   });
   return new d.TableCell({
    width:{size:widths[i],type:d.WidthType.DXA},
    shading:isHeading?{fill:"BFBFBF"}:undefined,
    margins:{top:35,bottom:35,left:85,right:85},
    children:[tagP(d,text,{
     alignment:o.centerAll||isHeading&&o.centerHeading?d.AlignmentType.CENTER:d.AlignmentType.LEFT
    })]
   });
  })});
 });
 return new d.Table({rows:items,width:{size:widths.reduce(function(a,b){return a+b;},0),type:d.WidthType.DXA},
  columnWidths:widths,layout:d.TableLayoutType.FIXED,borders:borders});
}
function tagBar(d,label,center){
 return tagTable(d,[[label]],[9360],{headingRows:1,boldHeading:true,centerHeading:!!center,fontSize:22});
}
function tagSectionBox(d,label,value){
 return tagTable(d,[[label],[String(value||"")]],[9360],{headingRows:1,boldHeading:true,headingFontSize:22,fontSize:20});
}
function tagField(d,label,value){
 return tagP(d,[tagRun(d,label,{bold:true,size:20}),tagRun(d,"  "+String(value==null?"":value),{size:20})],{spacing:{after:0}});
}
function tagBrandedHeader(d,logo){
 var none={style:d.BorderStyle.NONE,size:0,color:"FFFFFF"};
 var logoCell=new d.TableCell({
  width:{size:2600,type:d.WidthType.DXA},
  margins:{top:0,bottom:0,left:0,right:0},
  children:[tagP(d,[new d.ImageRun({type:"png",data:logo,transformation:{width:177,height:127}})],{spacing:{after:0}})]
 });
 var company=[
  tagP(d,[tagRun(d,"The Adventure Guild",{font:"Calibri",size:48,bold:true})],{alignment:d.AlignmentType.CENTER}),
  tagP(d,[tagRun(d,"P.O. Box 2621   Dunlap, TN 37327",{font:"Calibri",size:22})],{alignment:d.AlignmentType.CENTER}),
  tagP(d,[tagRun(d,"(423) 266-5709- Southeast office   (570) 507-0329 – Northeast office",{font:"Calibri",size:22})],{alignment:d.AlignmentType.CENTER}),
  tagP(d,[new d.ExternalHyperlink({children:[tagRun(d,"www.theadventureguild.com",{
    font:"Calibri",size:22,color:"0000FF",underline:{color:"0000FF"}
   })],link:"https://www.theadventureguild.com"})],{alignment:d.AlignmentType.CENTER})
 ];
 var infoCell=new d.TableCell({
  width:{size:6760,type:d.WidthType.DXA},
  margins:{top:0,bottom:0,left:0,right:0},children:company
 });
 return new d.Table({
  rows:[new d.TableRow({children:[logoCell,infoCell]})],
  width:{size:9360,type:d.WidthType.DXA},columnWidths:[2600,6760],
  layout:d.TableLayoutType.FIXED,
  borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none}
 });
}
async function tagLogoBytes(){
 // This is a compressed copy of the TAG logo embedded in the supplied original
 // report; the asset lives alongside the hosted app and is embedded in the DOCX.
 var response=await fetch("assets/tag-logo.base64");
 if(!response.ok)throw Error("The TAG logo could not be loaded ("+response.status+").");
 var b64=(await response.text()).trim();
 if(!/^[A-Za-z0-9+/=]+$/.test(b64)||b64.length<1000)throw Error("TAG logo asset is invalid.");
 return dataBytes("data:image/png;base64,"+b64);
}
function dataBytes(url){
 var b=atob(url.split(",")[1]),out=new Uint8Array(b.length);
 for(var i=0;i<b.length;i++)out[i]=b.charCodeAt(i);return out;
}
async function exportWord(content){
 var complete=content==="complete",tests=ordered();
 if(!tests.length){status("Include at least one Crosby recording.",true);return false;}
 try{
  status("Preparing "+tests.length+" graphs and editable report fields for Word…");
  await loadLibrary("https://unpkg.com/docx@9.5.1/dist/index.iife.js","docx");
  var d=window.docx,images=await graphImages(tests),ch=[],logo=complete?await tagLogoBytes():null;
  if(complete){
   // The branded first page follows the uploaded TAG report: original logo,
   // Calibri company heading, contact details and live blue underlined URL.
   ch.push(tagBrandedHeader(d,logo));
   ch.push(tagBar(d,"Ground Anchor Testing",true));
   ch.push(tagField(d,"Testing Date:",project.date));
   ch.push(tagField(d,"Client:",project.client));
   ch.push(tagField(d,"Location:",project.location));
   ch.push(tagField(d,"Project Manager:",project.manager));
   ch.push(tagField(d,"Testing Performed by:",project.tester));
   ch.push(tagField(d,"Number of Anchors Tested:",String(tests.length)));
   ch.push(tagP(d,"",{spacing:{after:90}}));
   ch.push(tagP(d,[tagRun(d,"Testing Policy",{font:"Calibri",size:22,bold:true,underline:{}})],{spacing:{before:80,after:0}}));
   ch.push(tagP(d,[tagRun(d,project.policy,{font:"Calibri",size:22})],{spacing:{after:40}}));
   ch.push(tagP(d,[tagRun(d,"Disclaimer:",{font:"Calibri",size:22,bold:true})],{spacing:{after:0}}));
   ch.push(tagP(d,[tagRun(d,project.disclaimer,{font:"Calibri",size:22})],{spacing:{after:100}}));
   ch.push(tagSectionBox(d,"Challenge Course Description",project.course));
   ch.push(tagP(d,"",{spacing:{after:90}}));
   ch.push(tagSectionBox(d,"Description of Testing Procedure",project.procedure));
   ch.push(tagP(d,"",{spacing:{after:100}}));
   ch.push(tagBar(d,"Testing Ratings and Comments:",false));
   var ratings=[["Pass:",project.pass],["Fail:",project.fail],["Not Inspected (NI):",project.ni]];
   ratings.forEach(function(pair){
    ch.push(tagP(d,[tagRun(d,pair[0]+" ",{size:20,bold:true}),tagRun(d,pair[1],{size:20})],
     {bullet:{indent:600},spacing:{after:45}}));
   });
   // The source document begins the plan/anchor summary on a new page.
   ch.push(tagP(d,"",{pageBreakBefore:true,spacing:{after:0}}));
   if(S.planImage){
    var planWidth=Math.min(580,Math.round(275/Math.max(.01,S.planImage.ratio)));
    ch.push(tagP(d,[new d.ImageRun({type:S.planImage.type==="image/png"?"png":"jpg",
     data:S.planImage.bytes,transformation:{width:planWidth,height:Math.round(planWidth*S.planImage.ratio)}})],
     {alignment:d.AlignmentType.CENTER,spacing:{after:75}}));
   }
   ch.push(tagBar(d,"Anchors",false));
   ch.push(tagTable(d,wordAnchorRows(tests),[3450,975,1400,2650,885],{
    headingRows:1,centerHeading:true,fontSize:20
   }));
  }
  // Preserve the existing 2/3-graph export layout and all editable notes.
  var per=3;
  tests.forEach(function(t,i){
   var img=images[i];
   ch.push(tagP(d,[tagRun(d,"Test "+(isMapped(t)?t.anchor:t.id)+" — "+(t.title||"Unassigned"),{font:"Arial",size:22,bold:true})],{
    pageBreakBefore:i%per===0&&(i>0||complete),spacing:{before:100,after:45}
   }));
   var w=490,h=159;
   ch.push(new d.Paragraph({children:[new d.ImageRun({type:"png",data:dataBytes(img),transformation:{width:w,height:h}})],spacing:{after:70}}));
   if(t.peak>crosbyView(t).ymax)
    ch.push(paragraph(d,"Peak exceeds displayed Y-axis; inspect original recorded readings.",{spacing:{after:45}}));
   if(t.comments)ch.push(paragraph(d,"Comments: "+t.comments,{spacing:{after:65}}));
  });
  var footer=new d.Footer({children:[tagP(d,[
   tagRun(d,"The Adventure Guild      Inspection Documentation Report",{size:24})
  ],{alignment:d.AlignmentType.CENTER})]});
  var document=new d.Document({
   creator:"The Adventure Guild",title:"Ground Anchor Testing — "+project.client,
   styles:{default:{document:{run:{font:"Arial",size:20,color:"000000"},paragraph:{spacing:{after:0}}}}},
   sections:[{properties:{page:{size:{width:12240,height:15840},
    margin:{top:1000,bottom:1440,left:1440,right:1440,footer:430}}},
    footers:{default:footer},children:ch}]
  });
  var blob=await d.Packer.toBlob(document);
  // Fail explicitly rather than offering an empty/incomplete file to Word.
  if(!blob||blob.size<1024)throw Error("Word document package was empty or incomplete.");
  var magic=new Uint8Array(await blob.slice(0,4).arrayBuffer());
  if(magic[0]!==80||magic[1]!==75)throw Error("The Word document package is not a valid ZIP/DOCX.");
  download(blob,fileStem()+(complete?"_complete":"_graphs")+".docx");
  status((complete?"Complete editable Word report":"Graph-only Word document")+" exported with "+tests.length+" Crosby test graphs.");
  return true;
 }catch(e){console.error(e);status("Word export failed: "+e.message,true);return false;}
}
function example(){
 var lines=["Start Shift, Finish Shift","12-November-2026 08:00:00,12-November-2026 08:01:00","Start Shift, Datalog Type, Project Details, Latitude, Longitude, Underload Count, Overload Count, Total Weight","EXAMPLE, timed, csl, 0,0,0,0,3100","Device, Log Date, Time, Value, Unit, Underloaded, Overloaded"];
 // Demonstrate a realistic pre-pull interval: the first ten 1 Hz readings
 // fluctuate gently between 10 and 50 lb before tension starts increasing.
 // This makes the default full view visibly different from Auto Scale, which
 // focuses around the automatically identified qualifying hold.
 for(var i=0;i<46;i++){
  var force=i<10?30+18*Math.sin(i*1.1):
   i<20?40+(i-10)*310:
   i<=33?3060+45*Math.sin((i-20)/3):
   // Ease smoothly out of the 33-second hold: no sharp peak at 34 s.
   // This cubic has zero slope at both ends of the 33–45 s release.
   Math.max(0,(3060+45*Math.sin(13/3))*
    (1-(function(u){return u*u*(3-2*u);})((i-33)/12)));
  lines.push("40554,12-November-2026,08:00:"+String(i).padStart(2,"0")+":00,"+Math.round(force)+",lb,No,No");
 }
 var t=parseCrosby("example-not-real.csv",lines.join("\n"));t.title="Example — NOT a test";t.anchor=null;
 S.tests.push(t);refresh();
 status("Illustrative example added with 10 seconds of 10–50 lb pre-pull tension. Try Auto Scale to focus on the qualifying hold.");
}

function openCompleteReport(){
 var dlg=$("csFullReportDialog");if(!dlg)return;
 $("csFullReportStatus").textContent="";
 if(typeof dlg.showModal==="function")dlg.showModal();
 else dlg.setAttribute("open","");
}
function closeCompleteReport(){
 var dlg=$("csFullReportDialog");if(!dlg)return;
 if(typeof dlg.close==="function")dlg.close();
 else dlg.removeAttribute("open");
}
async function downloadWord(mode,id){
 var button=$(id);if(!button||button.disabled||!ordered().length)return;
 button.disabled=true;
 try{
  var success=await exportWord(mode);
  if(mode==="complete"){
   if(success)closeCompleteReport();
   else $("csFullReportStatus").textContent=$("csStatus")?.textContent||"Unable to export the report.";
  }
 }finally{button.disabled=!S.tests.length;}
}

function bind(){
 $("csImport").addEventListener("click",function(){$("csFiles").click();});
 $("csFiles").addEventListener("change",function(){importFiles(this.files);this.value="";});
 $("csDemo").addEventListener("click",example);
 $("csReset").addEventListener("click",function(){if(S.tests.length&&!confirm("Clear the currently imported Crosby recordings and graph annotations?"))return;S.tests=[];S.current=0;refresh();status("Crosby imports cleared. Original files remain untouched.");});
 $("csRows").addEventListener("click",function(e){var b=e.target.closest("[data-open]");if(b)preview(Number(b.dataset.open));});
 $("csRows").addEventListener("change",function(e){
  var input=e.target,idx=Number(input.closest("tr")?.dataset.index),t=S.tests[idx],prop=input.dataset.prop;
  if(!t||!prop)return;
  if(prop==="anchor")t.anchor=input.value===""?null:Number(input.value);
  else if(prop==="enabled")t.enabled=input.checked;
  else t[prop]=input.value;
  if(idx===S.current)draw();
  $("csCount").textContent=S.tests.length+" / 50 loaded · "+ordered().length+" included";
 });
 $("csRows").addEventListener("input",function(e){
  var input=e.target,idx=Number(input.closest("tr")?.dataset.index),t=S.tests[idx],prop=input.dataset.prop;
  if(!t||!prop||input.type==="checkbox")return;
  if(prop==="anchor")t.anchor=input.value===""?null:Number(input.value);
  else t[prop]=input.value;
  if(idx===S.current&&prop==="title")$("csGraphHeading").textContent="2 · "+t.title+" — Crosby log "+t.id;
 });
 $("csPrevious").addEventListener("click",function(){preview((S.current-1+S.tests.length)%S.tests.length);});
 $("csNext").addEventListener("click",function(){preview((S.current+1)%S.tests.length);});
 $("csWindow").addEventListener("click",setWindow);
 $("csStyleAll").addEventListener("click",copyStyle);
 ["csXStart","csXEnd","csYMin","csYMax"].forEach(function(id){
  var el=$(id);
  el.addEventListener("change",applyCrosbyAxisInputs);
  el.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();el.blur();}});
 });
 document.querySelectorAll("#csWorkflow [data-cs-pan]").forEach(function(btn){
  btn.addEventListener("click",function(){panCrosbyPad(btn.dataset.csPan);});
 });
 document.querySelectorAll("#csWorkflow [data-cs-view]").forEach(function(btn){
  btn.addEventListener("click",function(){crosbyAction(btn.dataset.csView);});
 });
 $("csClearStyle").addEventListener("click",clearStyle);
 ["csMarkerA","csMarkerB","csShowA","csShowB","csBand","csBandColor","csBandAlpha","csAbove","csAboveColor","csAboveAlpha","csBelow","csBelowColor","csBelowAlpha","csAboveScope","csBelowScope"].forEach(function(id){
  $(id).addEventListener("input",currentStyleFromUI);$(id).addEventListener("change",currentStyleFromUI);
 });
 $("csComments").addEventListener("input",function(){var t=selected();if(t)t.comments=this.value;});
 function criteriaChanged(){
  S.tests.forEach(function(t){placeAutomaticMarkers(t,false);});
  if(selected())loadStyle();renderRows();draw();
 }
 $("csTarget").addEventListener("input",function(){project.minimum=Math.max(0,numeric("csTarget",3000));criteriaChanged();});
 $("csHold").addEventListener("input",function(){project.hold=Math.max(0,numeric("csHold",10));criteriaChanged();});
 $("csPng").addEventListener("click",async function(){if(!selected())return;try{download(new Blob([dataBytes(await graphPNG(selected()))],{type:"image/png"}),safeName(selected().title)+"_graph.png");}catch(e){status("Graph PNG export failed: "+e.message,true);}});
 $("csExportGraphs").addEventListener("click",function(){return downloadWord("graphs","csExportGraphs");});
 $("csOpenFullReport").addEventListener("click",openCompleteReport);
 $("csCancelFullReport").addEventListener("click",closeCompleteReport);
 $("csExportFullReport").addEventListener("click",function(){return downloadWord("complete","csExportFullReport");});
 $("csPlanFile").addEventListener("change",async function(){
  var f=this.files?.[0];if(!f)return;
  try{
   var ab=await f.arrayBuffer(),bitmap=await createImageBitmap(f);
   S.planImage={type:f.type,bytes:new Uint8Array(ab),ratio:bitmap.height/bitmap.width};
   if(bitmap.close)bitmap.close();
   $("csPlanName").textContent=f.name+" (included in Word report)";
  }catch(e){status("Could not load the site diagram: "+e.message,true);}
 });
 dragBind();refresh();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
})();
