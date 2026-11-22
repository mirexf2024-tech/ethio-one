(()=> {
 "use strict";
 const installed=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 const mobile=()=>window.matchMedia("(max-width: 760px)").matches;
 const applyInstalledMobile=()=>{
  if(!installed()||!mobile())return;
  document.documentElement.classList.add("ethio-pwa-mobile");
  const css=`
   html.ethio-pwa-mobile{min-height:100%;scroll-padding-top:calc(64px + env(safe-area-inset-top));}
   html.ethio-pwa-mobile body{min-height:100dvh;padding-bottom:calc(18px + env(safe-area-inset-bottom));overscroll-behavior-y:contain;-webkit-tap-highlight-color:transparent}
   html.ethio-pwa-mobile header,html.ethio-pwa-mobile .top{position:sticky;top:0;padding-top:env(safe-area-inset-top);z-index:30}
   html.ethio-pwa-mobile .wrap{padding-left:12px!important;padding-right:12px!important;margin-top:12px!important}
   html.ethio-pwa-mobile .post,html.ethio-pwa-mobile .composer,html.ethio-pwa-mobile .panel,html.ethio-pwa-mobile .sidebox,html.ethio-pwa-mobile .tile{border-radius:17px}
   html.ethio-pwa-mobile button,html.ethio-pwa-mobile .btn,html.ethio-pwa-mobile a{touch-action:manipulation}
   html.ethio-pwa-mobile input,html.ethio-pwa-mobile textarea,html.ethio-pwa-mobile select{font-size:16px!important}
   html.ethio-pwa-mobile .bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:9px 12px calc(9px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);backdrop-filter:blur(18px);box-shadow:0 -8px 28px rgba(8,43,89,.12)}
   html.ethio-pwa-mobile body.dark .bottom-nav{background:rgba(10,17,34,.96);border-color:#273653}
   html.ethio-pwa-mobile .modal{padding:calc(12px + env(safe-area-inset-top)) 10px calc(12px + env(safe-area-inset-bottom));align-items:flex-end}
   html.ethio-pwa-mobile .dialog{width:100%;max-height:88dvh;overflow:auto;border-radius:22px 22px 14px 14px;padding:18px 16px}
   html.ethio-pwa-mobile .story-view{height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));max-height:none;border-radius:0}
   html.ethio-pwa-mobile .toast{bottom:calc(76px + env(safe-area-inset-bottom))}
   html.ethio-pwa-mobile .welcome-card{min-height:230px}
   html.ethio-pwa-mobile .search-box{min-height:48px}
   html.ethio-pwa-mobile .tile{min-height:120px}
   html.ethio-pwa-mobile .post-actions button{min-height:42px}
   html.ethio-pwa-mobile .chat-attach{min-height:38px}
   @media(max-width:390px){html.ethio-pwa-mobile .welcome-copy h1{font-size:28px}html.ethio-pwa-mobile .wrap{padding-left:9px!important;padding-right:9px!important}}
   @media(prefers-reduced-motion:reduce){html.ethio-pwa-mobile *,html.ethio-pwa-mobile *:before,html.ethio-pwa-mobile *:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
  `;
  let style=document.getElementById("ethio-pwa-mobile-style");
  if(!style){style=document.createElement("style");style.id="ethio-pwa-mobile-style";document.head.appendChild(style)}
  style.textContent=css;
 };
 if(installed()){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",applyInstalledMobile,{once:true});else applyInstalledMobile();window.addEventListener("resize",applyInstalledMobile);if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("/sw.js").catch(()=>{});return;}
 let deferred=null;
 const ua=navigator.userAgent;
 const isIOS=/iphone|ipad|ipod/i.test(ua)&&!window.MSStream;
 const isAndroid=/android/i.test(ua);
 const key="ethio-one-install-dismissed";
 try{if(Number(localStorage.getItem(key)||0)>Date.now())return}catch{}
 const style=document.createElement("style");
 style.textContent=".ethio-install{position:fixed;z-index:9999;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));max-width:520px;margin:auto;background:#082b59;color:#fff;border:1px solid #d9a928;border-radius:16px;padding:13px 14px;box-shadow:0 12px 38px #001a3a55;display:flex;align-items:center;gap:12px;font:13px/1.35 system-ui,sans-serif}.ethio-install[hidden]{display:none}.ethio-install .ei-icon{width:42px;height:42px;flex:0 0 42px;border-radius:11px;object-fit:contain;background:#fff;padding:3px}.ethio-install .ei-copy{flex:1;min-width:0}.ethio-install b{display:block;font-size:14px}.ethio-install small{display:block;color:#dbe6f5;margin-top:3px}.ethio-install button{border:0;border-radius:9px;padding:9px 12px;font-weight:800;background:#d9a928;color:#082b59;white-space:nowrap}.ethio-install .ei-close{padding:5px 8px;background:transparent;color:#fff;font-size:20px}";
 document.head.appendChild(style);
 const box=document.createElement("aside");box.className="ethio-install";box.hidden=true;box.setAttribute("aria-label","Install Ethio One");
 box.innerHTML='<img class="ei-icon" src="https://raw.githubusercontent.com/mirexf2024-tech/ethio-one/main/ETHIO%20ONE%20logo%20identity.png" alt="Ethio One logo"><div class="ei-copy"><b>Install Ethio One</b><small id="ethioInstallHelp">Add the app to your home screen for quick access.</small></div><button type="button" id="ethioInstallAction">Install</button><button type="button" class="ei-close" aria-label="Close">×</button>';
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