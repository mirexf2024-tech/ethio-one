(()=> {
 "use strict";
 const installed=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 if(installed())return;
 let deferred=null;
 const ua=navigator.userAgent;
 const isIOS=/iphone|ipad|ipod/i.test(ua)&&!window.MSStream;
 const isAndroid=/android/i.test(ua);
 const key="ethio-one-install-dismissed";
 try{if(Number(localStorage.getItem(key)||0)>Date.now())return}catch{}
 const style=document.createElement("style");
 style.textContent=".ethio-install{position:fixed;z-index:9999;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));max-width:520px;margin:auto;background:#082b59;color:#fff;border:1px solid #d9a928;border-radius:16px;padding:13px 14px;box-shadow:0 12px 38px #001a3a55;display:flex;align-items:center;gap:12px;font:13px/1.35 system-ui,sans-serif}.ethio-install[hidden]{display:none}.ethio-install .ei-icon{width:42px;height:42px;flex:0 0 42px;border-radius:11px}.ethio-install .ei-copy{flex:1;min-width:0}.ethio-install b{display:block;font-size:14px}.ethio-install small{display:block;color:#dbe6f5;margin-top:3px}.ethio-install button{border:0;border-radius:9px;padding:9px 12px;font-weight:800;background:#d9a928;color:#082b59;white-space:nowrap}.ethio-install .ei-close{padding:5px 8px;background:transparent;color:#fff;font-size:20px}";
 document.head.appendChild(style);
 const box=document.createElement("aside");box.className="ethio-install";box.hidden=true;box.setAttribute("aria-label","Install Ethio One");
 box.innerHTML='<img class="ei-icon" src="/icons/ethio-one-app.svg" alt=""><div class="ei-copy"><b>Install Ethio One</b><small id="ethioInstallHelp">Add the app to your home screen for quick access.</small></div><button type="button" id="ethioInstallAction">Install</button><button type="button" class="ei-close" aria-label="Close">×</button>';
 document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(box));
 const show=()=>{if(document.body&&!installed())box.hidden=false;else if(!document.body)setTimeout(show,100)};
 const helpText=()=>isIOS?"Safari: tap Share, then Add to Home Screen.":isAndroid?"Open browser menu ⋮ and choose Install app or Add to Home screen.":"Open your browser menu and choose Install Ethio One or Add to Home Screen.";
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;document.getElementById("ethioInstallHelp").textContent="Install Ethio One on your device for quick access.";document.getElementById("ethioInstallAction").textContent="Install";document.getElementById("ethioInstallAction").dataset.instructions="";show()});
 window.addEventListener("appinstalled",()=>{box.hidden=true;deferred=null});
 box.addEventListener("click",async e=>{
  if(e.target.closest(".ei-close")){box.hidden=true;try{localStorage.setItem(key,String(Date.now()+7*864e5))}catch{}return}
  if(e.target.id!=="ethioInstallAction")return;
  if(e.target.dataset.instructions==="shown"){box.hidden=true;return}
  if(deferred){const promptEvent=deferred;deferred=null;await promptEvent.prompt();const choice=await promptEvent.userChoice;if(choice?.outcome==="accepted")box.hidden=true;return}
  document.getElementById("ethioInstallHelp").textContent=helpText();
  e.target.textContent="Got it";e.target.dataset.instructions="shown";
 });
 setTimeout(()=>{if(!deferred&&!installed()){document.getElementById("ethioInstallHelp").textContent=helpText();document.getElementById("ethioInstallAction").textContent="How to install";document.getElementById("ethioInstallAction").dataset.instructions="";show()}},4500);
 if("serviceWorker" in navigator&&location.protocol==="https:"){window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}))}
})();