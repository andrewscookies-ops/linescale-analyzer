
/* TAG Load-cell Analyzer — independent LineScale and Crosby workflow switcher. */
(function(){
  "use strict";
  var key="tag-load-cell-workflow-v1";
  function $(id){return document.getElementById(id);}
  function activate(mode,save){
    mode=mode==="crosby"?"crosby":"linescale";
    document.body.dataset.tagMode=mode;
    var line=$("tagWorkflowLineScale"),cross=$("tagWorkflowCrosby"),hint=$("tagWorkflowHint");
    if(line){line.setAttribute("aria-pressed",String(mode==="linescale"));}
    if(cross){cross.setAttribute("aria-pressed",String(mode==="crosby"));}
    if(hint)hint.textContent=mode==="crosby"?
       "Crosby import, graph annotations and reports are shown. LineScale work is temporarily hidden, not cleared.":
       "LineScale logs, graphs and analysis are shown. Crosby work is temporarily hidden, not cleared.";
    if(save){try{localStorage.setItem(key,mode);}catch(e){}}
    // Let chart canvases resize after their workflow becomes visible.
    requestAnimationFrame(function(){window.dispatchEvent(new Event("resize"));});
    setTimeout(function(){window.dispatchEvent(new Event("resize"));},120);
  }
  function init(){
    if($("tagWorkflowSwitcher"))return;
    var header=document.querySelector("main.container > header.brandbar");
    if(!header)return;
    var nav=document.createElement("nav");
    nav.id="tagWorkflowSwitcher";
    nav.className="tag-switcher";
    nav.setAttribute("aria-label","Choose analyzer workflow");
    nav.innerHTML=[
      '<p class="tag-switch-label">TAG Load-cell Analyzer · choose a workflow</p>',
      '<div class="tag-switch-options">',
        '<button type="button" class="tag-switch-option" id="tagWorkflowLineScale" aria-pressed="false">',
          '<span><strong>LineScale</strong><small>Dynamic & static recordings</small></span><span class="tag-switch-status">Open</span>',
        '</button>',
        '<button type="button" class="tag-switch-option" id="tagWorkflowCrosby" aria-pressed="false">',
          '<span><strong>Crosby</strong><small>Anchor tests & report builder</small></span><span class="tag-switch-status">Open</span>',
        '</button>',
      '</div>',
      '<p class="tag-switch-caption" id="tagWorkflowHint" role="status"></p>'
    ].join("");
    header.insertAdjacentElement("afterend",nav);
    function showStatus(){
      var active=document.body.dataset.tagMode;
      [["tagWorkflowLineScale","linescale"],["tagWorkflowCrosby","crosby"]].forEach(function(x){
        var btn=$(x[0]);if(!btn)return;
        var status=btn.querySelector(".tag-switch-status");
        if(status)status.textContent=active===x[1]?"Active":"Open";
      });
    }
    $("tagWorkflowLineScale").addEventListener("click",function(){activate("linescale",true);showStatus();});
    $("tagWorkflowCrosby").addEventListener("click",function(){activate("crosby",true);showStatus();});
    var saved="linescale";try{saved=localStorage.getItem(key)||saved;}catch(e){}
    if(window.location.hash==="#setup")saved="linescale";
    activate(saved,false);showStatus();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
})();
