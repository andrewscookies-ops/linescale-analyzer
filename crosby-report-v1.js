
/* TAG Load-cell Analyzer — Crosby Straightpoint report workflow v1
   Distinct from LineScale processing. Local CSV import; no uploads. */
(function(){
"use strict";
var S={tests:[],current:0,chart:null,drag:null,planImage:null};
var $=function(id){return document.getElementById(id);};
var template=function(){return {a:0,b:10,showA:true,showB:true,band:false,bandColor:"#f59e0b",bandAlpha:.18,above:false,aboveColor:"#22c55e",aboveAlpha:.18,aboveScope:"all",below:false,belowColor:"#3b82f6",belowAlpha:.18,belowScope:"all"};};
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
 minimum:3000,hold:10,graphsPerPage:2
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
 var firstHigh=points.findIndex(function(p){return p.y>=project.minimum;});
 var lastHigh=-1;for(var z=points.length-1;z>=0;z--){if(points[z].y>=project.minimum){lastHigh=z;break;}}
 var a=firstHigh>=0?points[firstHigh].x:Math.max(0,duration*.25),b=lastHigh>=0?points[lastHigh].x:Math.max(a+1,duration*.75);
 var sty=template();sty.a=a;sty.b=b;
 return {name:name,id:rawId,device:device,date:rows[hi+1]?.[cols.date]||"",originalUnit:Object.keys(unitSet).join(", "),
   points:points,duration:duration,peak:Math.max.apply(null,points.map(function(p){return p.y;})),
   anchor:num&&num<=999?num:null,title:num?"Anchor "+num:"Unassigned anchor",
   rating:"Pending review",comments:"",style:sty,enabled:true};
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
 '<div class="cs-inline" style="justify-content:space-between"><div><p class="eyebrow">Crosby Straightpoint · distinct workflow</p><h2>Anchor load testing & report builder</h2></div><span class="cs-flag">Crosby CSV</span></div>',
 '<p class="cs-intro">Import the original Crosby reports, review the test-to-anchor mapping, annotate force-time graphs, and export a fully editable Word report or graph-only PDF pages for an existing report. All processing stays in this browser.</p>',
 '<div class="cs-toolbar"><button type="button" class="cs-primary" id="csImport">＋ Import Crosby CSVs</button><input id="csFiles" type="file" accept=".csv,text/csv" multiple hidden><span class="cs-muted" id="csCount">No Crosby tests loaded</span><button type="button" id="csDemo">Load a small example</button><button type="button" id="csReset">Clear imports</button></div>',
 '<div class="cs-status" id="csStatus" role="status" aria-live="polite"></div>',
 '<details open><summary>1 · Review recordings and anchor assignments</summary><p class="cs-muted">The instrument labels (such as 2.2 or 14 L) are not the final anchor mapping. Confirm each assignment and choose the rating manually. Imported files are never modified.</p><div class="cs-scroll"><table><thead><tr><th>Graph</th><th>Crosby log ID / filename</th><th>Anchor #</th><th>Anchor description</th><th>Rating</th><th>Peak (lb)</th><th>Max observed hold</th><th>Include</th></tr></thead><tbody id="csRows"></tbody></table></div></details>',
 '<div class="cs-panel" id="csGraphPanel"><h3 id="csGraphHeading">2 · Graph editor — import data to begin</h3>',
 '<div class="cs-toolbar"><button type="button" id="csPrevious">← Previous</button><button type="button" id="csNext">Next →</button><button type="button" id="csWindow">Set markers around load hold</button><button type="button" id="csStyleAll">Copy this graph style to all</button></div>',
 '<div class="cs-chart"><canvas id="csCanvas" aria-label="Crosby load over time"></canvas></div><div class="cs-graph-stats" id="csStats"></div>',
 '<p class="cs-muted">Drag the A and B vertical lines on the graph, or enter their times below. Each graph keeps its own independent shading settings.</p>',
 '<div class="cs-edit"><label><input type="checkbox" id="csShowA" checked> Show marker A<input type="number" min="0" step=".1" id="csMarkerA" value="0" aria-label="Marker A time seconds">Seconds</label>',
 '<label><input type="checkbox" id="csShowB" checked> Show marker B<input type="number" min="0" step=".1" id="csMarkerB" value="10" aria-label="Marker B time seconds">Seconds</label>',
 '<label>Above-line fill range<select id="csAboveScope"><option value="all">Entire recording</option><option value="markers">Between A and B only</option></select></label>',
 '<label>Below-line fill range<select id="csBelowScope"><option value="all">Entire recording</option><option value="markers">Between A and B only</option></select></label>',
 '</div>',
 '<div class="cs-fill-row"><label class="cs-check"><input type="checkbox" id="csBand"> Fill between markers</label><label>Color<input type="color" id="csBandColor" value="#f59e0b"></label><label>Opacity<input type="range" id="csBandAlpha" min="0" max=".75" step=".05" value=".2"></label></div>',
 '<div class="cs-fill-row"><label class="cs-check"><input type="checkbox" id="csAbove"> Fill above graph line</label><label>Color<input type="color" id="csAboveColor" value="#22c55e"></label><label>Opacity<input type="range" id="csAboveAlpha" min="0" max=".75" step=".05" value=".2"></label></div>',
 '<div class="cs-fill-row"><label class="cs-check"><input type="checkbox" id="csBelow"> Fill below graph line</label><label>Color<input type="color" id="csBelowColor" value="#3b82f6"></label><label>Opacity<input type="range" id="csBelowAlpha" min="0" max=".75" step=".05" value=".2"></label></div>',
 '<div class="cs-toolbar"><button type="button" id="csPng">Download this graph (PNG)</button><button type="button" id="csClearStyle">Clear graph shading</button></div>',
 '<label>Graph / anchor comments (editable)<textarea id="csComments" rows="2" placeholder="Anchor identification, creep observations, notes"></textarea></label></div>',
 '<details id="csProjectDetails"><summary>3 · Editable Word report content (everything except company heading)</summary>',
 '<div class="cs-fields" id="csProjectFields"></div>',
 '<div class="cs-toolbar"><label>Site plan / diagram (optional)<input id="csPlanFile" type="file" accept="image/png,image/jpeg"></label><span class="cs-muted" id="csPlanName">No diagram selected</span></div>',
 '</details>',
 '<div class="cs-panel"><h3>4 · Export reports</h3>',
 '<div class="cs-report-controls"><label>Minimum test load (lb)<input id="csTarget" type="number" min="0" step="10" value="3000"></label><label>Specified hold duration (seconds)<input id="csHold" type="number" min="0" step="1" value="10"></label>',
 '<label>Graphs per page<select id="csPerPage"><option value="2" selected>2 · larger graphs</option><option value="3">3 · compact graphs</option></select></label></div>',
 '<p class="cs-muted">The minimum line is a reference, not an automatic compliance rating. Ratings remain manual. The graph-only PDF contains no cover pages, so you can insert it after page 2 of an existing Word report.</p>',
 '<div class="cs-export"><button type="button" class="cs-primary" id="csWord">Download complete editable Word report (.docx)</button><button type="button" class="cs-primary" id="csPdf">Download graph-only PDF</button><button type="button" id="csSavePreset">Save report setup (.json)</button><button type="button" id="csLoadPreset">Load report setup</button><input id="csPresetFile" type="file" accept=".json,application/json" hidden></div>',
 '<p class="cs-mini">The original LineScale importer, calculations, and reports continue below this separate section.</p></div>'
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
function currentStyleFromUI(){
 var t=selected();if(!t)return;
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
function graphConfig(t){
 var threshold=Math.max(0,project.minimum),max=Math.max(threshold,t.peak)*1.17;
 return {
  type:"line",
  data:{datasets:[
   {label:"Load (lb)",data:t.points,parsing:false,borderColor:"#13559f",borderWidth:2.5,backgroundColor:"#13559f",pointRadius:0,pointHitRadius:7,tension:0,order:1},
   {label:"Minimum "+threshold.toLocaleString()+" lb",data:[{x:0,y:threshold},{x:t.duration,y:threshold}],parsing:false,
    borderColor:"#dd5238",borderWidth:1.6,borderDash:[7,5],pointRadius:0,order:2}
  ]},
  plugins:[shadingPlugin],
  options:{
   responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:1,
   parsing:false,normalized:true,
   plugins:{legend:{display:false},tooltip:{enabled:true,callbacks:{label:function(ctx){return ctx.datasetIndex===0?"Load: "+Math.round(ctx.parsed.y).toLocaleString()+" lb":"Minimum load";}}}},
   scales:{
    x:{type:"linear",min:0,max:Math.max(1,t.duration),title:{display:true,text:"Elapsed time (seconds)",color:"#526479"},ticks:{color:"#526479",maxTicksLimit:10},grid:{color:"#e4e8ec"}},
    y:{type:"linear",min:0,suggestedMax:Math.ceil(max/500)*500,title:{display:true,text:"Force (lb)",color:"#526479"},ticks:{color:"#526479",callback:function(v){return Number(v).toLocaleString();}},grid:{color:"#dfe5e9"}}
   }
  }
 };
}
function draw(){
 var t=selected(),canvas=$("csCanvas");if(!canvas)return;
 if(S.chart){S.chart.destroy();S.chart=null;}
 if(!t){$("csGraphHeading").textContent="2 · Graph editor — import data to begin";$("csStats").textContent="";return;}
 if(typeof Chart==="undefined"){status("Chart.js is unavailable. Check network access.",true);return;}
 $("csGraphHeading").textContent="2 · "+(t.title||"Anchor") + " — Crosby log "+t.id;
 var m=holdStats(t,project.minimum);
 $("csStats").innerHTML="<span>Peak: <strong>"+Math.round(t.peak).toLocaleString()+" lb</strong></span><span>Recording: "+duration(t)+" s</span><span>Longest observed ≥ "+project.minimum.toLocaleString()+" lb: <strong>"+m.hold.toFixed(1)+" s</strong></span><span>Rating: "+esc(t.rating)+" (manual)</span>";
 S.chart=new Chart(canvas,graphConfig(t));S.chart.$crosby=t;S.chart.update("none");
}
function renderRows(){
 var host=$("csRows");if(!host)return;
 host.innerHTML=S.tests.map(function(t,i){
  var m=holdStats(t,project.minimum);
  var options=["Pending review","Pass","Fail","Not Inspected"].map(function(s){return '<option value="'+esc(s)+'"'+(t.rating===s?' selected':'')+'>'+esc(s)+'</option>';}).join("");
  return '<tr data-index="'+i+'" class="'+(i===S.current?"cs-selected":"")+'"><td><button type="button" data-open="'+i+'">View</button></td>'
   +'<td><strong class="cs-id">'+esc(t.id)+'</strong><br><span class="cs-mini">'+esc(t.name)+'</span></td>'
   +'<td><input type="number" min="1" max="999" data-prop="anchor" value="'+(isMapped(t)?esc(t.anchor):"")+'" placeholder="Assign" style="max-width:80px"></td>'
   +'<td><input type="text" data-prop="title" value="'+esc(t.title)+'"></td>'
   +'<td><select data-prop="rating">'+options+'</select></td><td>'+Math.round(t.peak).toLocaleString()+'</td><td>'+m.hold.toFixed(1)+' s</td>'
   +'<td><input type="checkbox" data-prop="enabled" '+(t.enabled?"checked":"")+' aria-label="Include '+esc(t.name)+'"></td></tr>';
 }).join("");
 $("csCount").textContent=S.tests.length+" imported · "+ordered().length+" included";
}
function preview(i){
 if(!S.tests.length)return;
 S.current=Math.max(0,Math.min(S.tests.length-1,i));
 loadStyle();renderRows();draw();
}
function refresh(){
 if(!S.tests.length)S.current=0;
 else S.current=Math.min(S.current,S.tests.length-1);
 renderRows();
 if(selected())preview(S.current);else draw();
 $("csPrevious").disabled=S.tests.length<2;$("csNext").disabled=S.tests.length<2;
 ["csWord","csPdf","csPng","csStyleAll","csWindow"].forEach(function(id){$(id).disabled=!S.tests.length;});
}
async function importFiles(files){
 if(!files||!files.length)return;
 var successes=0,errors=[];
 for(var i=0;i<files.length;i++){
  var file=files[i];
  if(S.tests.some(function(x){return x.name===file.name;})){errors.push(file.name+": already imported");continue;}
  try{
   var parsed=parseCrosby(file.name,await file.text());
   S.tests.push(parsed);successes++;
  }catch(e){errors.push(file.name+": "+e.message);}
 }
 S.tests.sort(function(a,b){return (Number(a.anchor)||9999)-(Number(b.anchor)||9999)||a.name.localeCompare(b.name);});
 refresh();
 status(successes+" Crosby recording"+(successes===1?"":"s")+" imported."+ (errors.length?" "+errors.length+" skipped: "+errors.slice(0,2).join("; "):""),!!errors.length);
}
function setWindow(){
 var t=selected();if(!t)return;
 var threshold=project.minimum,pts=t.points,first=pts.find(function(p){return p.y>=threshold;}),last=null;
 for(var i=pts.length-1;i>=0;i--)if(pts[i].y>=threshold){last=pts[i];break;}
 if(!first||!last){status("No samples cross the threshold in this recording.",true);return;}
 t.style.a=first.x;t.style.b=last.x;t.style.showA=true;t.style.showB=true;loadStyle();draw();
}
function copyStyle(){
 var t=selected();if(!t)return;
 S.tests.forEach(function(x){
  if(x===t)return;
  var spanRatioA=t.duration?t.style.a/t.duration:0,spanRatioB=t.duration?t.style.b/t.duration:1;
  x.style=Object.assign({},t.style,{a:+(spanRatioA*x.duration).toFixed(1),b:+(spanRatioB*x.duration).toFixed(1)});
 });
 status("Copied colors, fill modes, opacity, and relative marker positions to every Crosby graph.");
}
function clearStyle(){
 var t=selected();if(!t)return;
 t.style.band=false;t.style.above=false;t.style.below=false;loadStyle();draw();
}
function dragBind(){
 var c=$("csCanvas");
 function position(e){return e.clientX-c.getBoundingClientRect().left;}
 c.addEventListener("pointerdown",function(e){
  var t=selected(),chart=S.chart;if(!t||!chart?.chartArea)return;
  var y=e.clientY-c.getBoundingClientRect().top;
  if(y<chart.chartArea.top-10||y>chart.chartArea.bottom+10)return;
  var s=t.style,x=position(e);
  var candidates=[];
  if(s.showA)candidates.push(["a",Math.abs(markerPoint(chart,s.a)-x)]);
  if(s.showB)candidates.push(["b",Math.abs(markerPoint(chart,s.b)-x)]);
  candidates.sort(function(a,b){return a[1]-b[1];});
  if(candidates.length&&candidates[0][1]<=16){
   S.drag=candidates[0][0];c.setPointerCapture(e.pointerId);e.preventDefault();
  }
 });
 c.addEventListener("pointermove",function(e){
  var t=selected(),chart=S.chart;if(!t||!chart?.chartArea)return;
  var x=position(e),key=S.drag;
  if(!key){
   var near=(t.style.showA&&Math.abs(markerPoint(chart,t.style.a)-x)<13)||(t.style.showB&&Math.abs(markerPoint(chart,t.style.b)-x)<13);
   c.style.cursor=near?"ew-resize":"default";return;
  }
  var raw=chart.scales.x.getValueForPixel(x);
  t.style[key]=Math.max(0,Math.min(t.duration,Math.round(raw*10)/10));
  setControl(key==="a"?"csMarkerA":"csMarkerB",t.style[key]);
  chart.update("none");e.preventDefault();
 });
 ["pointerup","pointercancel","lostpointercapture"].forEach(function(type){c.addEventListener(type,function(){S.drag=null;});});
}
function reportData(){
 return {project:Object.assign({},project),tests:S.tests.map(function(t){return {id:t.id,name:t.name,anchor:t.anchor,title:t.title,rating:t.rating,comments:t.comments,style:t.style,enabled:t.enabled};})};
}
function download(blob,name){
 var url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},10000);
}
function fileStem(){return safeName(project.client||"TAG-Anchor-Testing")+"_"+safeName(project.date||"report");}
function savePreset(){
 download(new Blob([JSON.stringify({schema:"tag-crosby-report-v1",...reportData()},null,2)],{type:"application/json"}),fileStem()+"_setup.json");
}
async function loadPreset(file){
 if(!file)return;
 try{
  var obj=JSON.parse(await file.text());
  if(obj.schema!=="tag-crosby-report-v1"||!obj.project)throw Error("Not a TAG Crosby setup file");
  Object.keys(project).forEach(function(k){if(Object.prototype.hasOwnProperty.call(obj.project,k))project[k]=obj.project[k];});
  fieldMap.forEach(function(f){setControl("csField_"+f[0],project[f[0]]||"");});
  setControl("csTarget",project.minimum);setControl("csHold",project.hold);setControl("csPerPage",project.graphsPerPage);
  (obj.tests||[]).forEach(function(saved){
   var current=S.tests.find(function(t){return t.id===saved.id&&t.name===saved.name;})||S.tests.find(function(t){return t.id===saved.id;});
   if(!current)return;
   ["anchor","title","rating","comments","enabled"].forEach(function(k){if(k in saved)current[k]=saved[k];});
   if(saved.style)current.style=Object.assign(template(),saved.style);
  });
  refresh();status("Saved setup loaded. Import matching CSVs first to restore their individual mappings and styles.");
 }catch(e){status("Could not load setup: "+e.message,true);}
}
function imageDataUrl(buffer){
 var bytes=new Uint8Array(buffer),str="";
 for(var i=0;i<bytes.length;i+=8192)str+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
 return "data:image/png;base64,"+btoa(str);
}
async function graphPNG(t){
 if(typeof Chart==="undefined")throw Error("Chart.js is not available.");
 var c=document.createElement("canvas");c.width=1200;c.height=455;
 c.style.width="1200px";c.style.height="455px";
 var cfg=graphConfig(t);cfg.options.responsive=false;var ch=new Chart(c,cfg);ch.$crosby=t;ch.update("none");
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
async function exportPDF(){
 var tests=ordered();if(!tests.length){status("Include at least one Crosby recording.",true);return;}
 try{
  status("Preparing "+tests.length+" graphs for PDF…");
  await loadLibrary("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js","jspdf");
  var images=await graphImages(tests),PDF=window.jspdf.jsPDF,pdf=new PDF({unit:"pt",format:"letter",orientation:"portrait",compress:true});
  var per=project.graphsPerPage===3?3:2;
  var margin=34,width=612-margin*2;
  images.forEach(function(img,i){
   var slot=i%per;
   if(i&&slot===0)pdf.addPage();
   var pageNum=Math.floor(i/per)+1;
   if(slot===0){
    pdf.setFont("helvetica","bold");pdf.setFontSize(11);pdf.setTextColor(15,32,49);
    pdf.text("Ground Anchor Testing · Graph Evidence",margin,35);
    pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(82,96,111);
    pdf.text((project.client||"Project")+" · "+(project.date||""),margin,50);
    pdf.setDrawColor(170,181,190);pdf.line(margin,57,612-margin,57);
   }
   var slotHeight=per===3?227:325,top=69+slot*slotHeight;
   var t=tests[i],stat=holdStats(t,project.minimum),anchor=t.title||("Anchor "+t.anchor);
   pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.setTextColor(20,37,53);
   pdf.text("Test "+(isMapped(t)?String(t.anchor):t.id)+" — "+anchor.slice(0,65),margin,top+12);
   var available=per===3?176:246;
   pdf.addImage(img,"PNG",margin,top+20,width,available,"chart"+i,"FAST");
   pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.setTextColor(76,87,98);
   pdf.text("Crosby "+t.id+" · Peak "+Math.round(t.peak).toLocaleString()+" lb · Observed hold "+stat.hold.toFixed(1)+" s · Rating "+t.rating,margin,top+available+31);
   if(t.comments)pdf.text(pdf.splitTextToSize(t.comments, width).slice(0,2),margin,top+available+43);
   pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.setTextColor(100,106,115);
   pdf.text("The Adventure Guild · Inspection Documentation Report  |  Graph page "+pageNum,margin,765);
  });
  pdf.save(fileStem()+"_graphs.pdf");
  status("Graph-only PDF exported: "+tests.length+" graphs, "+Math.ceil(tests.length/per)+" pages.");
 }catch(e){console.error(e);status("PDF export failed: "+e.message,true);}
}
function paragraph(docx,text,opts){
 return new docx.Paragraph(Object.assign({text:String(text||""),spacing:{after:90}},opts||{}));
}
function docxTable(docx,rows,widths){
 var cells=rows.map(function(row,i){
  return new docx.TableRow({children:row.map(function(val){
   return new docx.TableCell({children:[new docx.Paragraph({text:String(val==null?"":val),spacing:{after:0},run:{size:18}})]});
  })});
 });
 return new docx.Table({rows:cells,width:{size:100,type:docx.WidthType.PERCENTAGE}});
}
function dataBytes(url){
 var b=atob(url.split(",")[1]),out=new Uint8Array(b.length);
 for(var i=0;i<b.length;i++)out[i]=b.charCodeAt(i);return out;
}
async function exportWord(){
 var tests=ordered();if(!tests.length){status("Include at least one Crosby recording.",true);return;}
 try{
  status("Preparing "+tests.length+" graphs and editable report fields for Word…");
  await loadLibrary("https://unpkg.com/docx@9.5.1/dist/index.iife.js","docx");
  var d=window.docx,images=await graphImages(tests),ch=[];
  var head=function(title){return paragraph(d,title,{heading:d.HeadingLevel.HEADING_2,spacing:{before:170,after:80}});};
  var body=function(text){return paragraph(d,text,{spacing:{after:130}});};
  ch.push(paragraph(d,"The Adventure Guild",{heading:d.HeadingLevel.HEADING_1,alignment:d.AlignmentType.CENTER,spacing:{after:20}}));
  ch.push(paragraph(d,"P.O. Box 2621  ·  Dunlap, TN 37327  |  (423) 266-5709  |  www.theadventureguild.com",{alignment:d.AlignmentType.CENTER,spacing:{after:110}}));
  ch.push(paragraph(d,"Ground Anchor Testing",{heading:d.HeadingLevel.HEADING_1,alignment:d.AlignmentType.CENTER,spacing:{after:120}}));
  ch.push(docxTable(d,[
   ["Testing Date",project.date],["Client",project.client],["Location",project.location],
   ["Project Manager",project.manager],["Testing Performed By",project.tester],["Number of Anchors Tested",String(tests.length)]
  ]));
  ch.push(head("Testing Policy"));ch.push(body(project.policy));
  ch.push(head("Disclaimer"));ch.push(body(project.disclaimer));
  ch.push(head("Challenge Course Description"));ch.push(body(project.course));
  ch.push(head("Description of Testing Procedure"));ch.push(body(project.procedure));
  ch.push(head("Testing Ratings and Comments"));
  ch.push(body("Pass: "+project.pass));ch.push(body("Fail: "+project.fail));ch.push(body("Not Inspected (NI): "+project.ni));
  ch.push(paragraph(d,"Anchors",{heading:d.HeadingLevel.HEADING_1,pageBreakBefore:true}));
  ch.push(body("Minimum "+project.minimum.toLocaleString()+" lb | Hold duration "+project.hold+" s | Measuring device "+project.model+" | Serial "+project.serial));
  if(S.planImage){
   var planWidth=Math.min(470,Math.round(235/Math.max(.01,S.planImage.ratio)));ch.push(new d.Paragraph({children:[new d.ImageRun({type:S.planImage.type==="image/png"?"png":"jpg",data:S.planImage.bytes,transformation:{width:planWidth,height:Math.round(planWidth*S.planImage.ratio)}})],spacing:{after:100}}));
  }
  ch.push(docxTable(d,[["Anchor # and Location","Rating","Applied Load","Measuring Device","Test ID"]].concat(tests.map(function(t){
   return [t.title||("Anchor "+t.anchor),t.rating,Math.round(t.peak).toLocaleString()+" lb peak",project.model+" / "+project.serial,t.id];
  }))));
  var per=project.graphsPerPage===3?3:2;
  tests.forEach(function(t,i){
   var stat=holdStats(t,project.minimum),img=images[i];
   ch.push(paragraph(d,"Test "+(isMapped(t)?t.anchor:t.id)+" — "+(t.title||"Unassigned"),{
    heading:d.HeadingLevel.HEADING_2,pageBreakBefore:i%per===0,spacing:{before:100,after:45}
   }));
   ch.push(paragraph(d,"Log "+t.id+" | Peak "+Math.round(t.peak).toLocaleString()+" lb | Observed hold >= "+project.minimum+" lb: "+stat.hold.toFixed(1)+" s | Rating: "+t.rating,{
    spacing:{after:35}
   }));
   var w=490,h=per===3?159:184;
   ch.push(new d.Paragraph({children:[new d.ImageRun({type:"png",data:dataBytes(img),transformation:{width:w,height:h}})],spacing:{after:70}}));
   if(t.comments)ch.push(paragraph(d,"Comments: "+t.comments,{spacing:{after:65}}));
  });
  var footer=new d.Footer({children:[paragraph(d,"The Adventure Guild  |  Inspection Documentation Report",{alignment:d.AlignmentType.CENTER})]});
  var document=new d.Document({creator:"The Adventure Guild",title:"Ground Anchor Testing — "+project.client,
   styles:{default:{document:{run:{font:"Arial",size:19},paragraph:{spacing:{after:65}}}}},
   sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:670,bottom:650,left:760,right:760}}},footers:{default:footer},children:ch}]
  });
  var blob=await d.Packer.toBlob(document);
  download(blob,fileStem()+"_complete.docx");
  status("Complete editable Word report exported with "+tests.length+" Crosby test graphs.");
 }catch(e){console.error(e);status("Word export failed: "+e.message,true);}
}
function example(){
 var lines=["Start Shift, Finish Shift","12-November-2026 08:00:00,12-November-2026 08:01:00","Start Shift, Datalog Type, Project Details, Latitude, Longitude, Underload Count, Overload Count, Total Weight","EXAMPLE, timed, csl, 0,0,0,0,3100","Device, Log Date, Time, Value, Unit, Underloaded, Overloaded"];
 for(var i=0;i<36;i++){
  var force=i<10?i*310:i<24?3050+45*Math.sin(i/3):Math.max(0,3100-(i-24)*340);
  lines.push("40554,12-November-2026,08:00:"+String(i).padStart(2,"0")+":00,"+Math.round(force)+",lb,No,No");
 }
 var t=parseCrosby("example-not-real.csv",lines.join("\n"));t.title="Example — NOT a test";t.anchor=null;
 S.tests.push(t);refresh();status("Illustrative example added. Remove it before producing an actual report.");
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
  $("csCount").textContent=S.tests.length+" imported · "+ordered().length+" included";
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
 $("csClearStyle").addEventListener("click",clearStyle);
 ["csMarkerA","csMarkerB","csShowA","csShowB","csBand","csBandColor","csBandAlpha","csAbove","csAboveColor","csAboveAlpha","csBelow","csBelowColor","csBelowAlpha","csAboveScope","csBelowScope"].forEach(function(id){
  $(id).addEventListener("input",currentStyleFromUI);$(id).addEventListener("change",currentStyleFromUI);
 });
 $("csComments").addEventListener("input",function(){var t=selected();if(t)t.comments=this.value;});
 $("csTarget").addEventListener("input",function(){project.minimum=Math.max(0,numeric("csTarget",3000));renderRows();draw();});
 $("csHold").addEventListener("input",function(){project.hold=Math.max(0,numeric("csHold",10));});
 $("csPerPage").addEventListener("change",function(){project.graphsPerPage=Number(this.value)||2;});
 $("csPng").addEventListener("click",async function(){if(!selected())return;try{download(new Blob([dataBytes(await graphPNG(selected()))],{type:"image/png"}),safeName(selected().title)+"_graph.png");}catch(e){status("Graph PNG export failed: "+e.message,true);}});
 $("csWord").addEventListener("click",exportWord);
 $("csPdf").addEventListener("click",exportPDF);
 $("csSavePreset").addEventListener("click",savePreset);
 $("csLoadPreset").addEventListener("click",function(){$("csPresetFile").click();});
 $("csPresetFile").addEventListener("change",function(){loadPreset(this.files?.[0]);this.value="";});
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
