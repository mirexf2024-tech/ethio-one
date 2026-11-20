import React, { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import {
  ArrowRight, ArrowLeft, Globe2, ShieldCheck, Sparkles, UserRound,
  LockKeyhole, Mail, Phone, Check, ChevronDown, Eye, EyeOff, Users, PlayCircle, Radio,
  MessageCircle, ShoppingBag, Newspaper, GraduationCap, Cpu, WalletCards,
  Plane, BriefcaseBusiness, Clapperboard, BookOpen, Coins, Shield, Headphones
} from "lucide-react-native";

type Language = "OM" | "AM" | "EN";
type Screen = "welcome" | "register" | "signin" | "verify" | "forgot" | "reset" | "account";
const API = "https://ethio-one-api.onrender.com/api/v1/auth";
const C = { navy:"#082B59", navy2:"#061E3D", gold:"#D9A928", ink:"#152238", muted:"#748197", line:"#E7EBF1", bg:"#F5F7FA", white:"#FFFFFF", pale:"#F0F4FA" };

const services = [
  {name:"Ethio Social", icon:Users, color:"#2878D0", bg:"#EAF3FF"},
  {name:"Ethio Tube", icon:PlayCircle, color:"#E34F58", bg:"#FFF0F1"},
  {name:"Ethio Live", icon:Radio, color:"#D94B78", bg:"#FFF0F6"},
  {name:"Ethio Chat", icon:MessageCircle, color:"#16A085", bg:"#E9F9F4"},
  {name:"Ethio Market", icon:ShoppingBag, color:"#D58A16", bg:"#FFF6E8"},
  {name:"Ethio News", icon:Newspaper, color:"#3974A8", bg:"#EDF5FB"},
  {name:"Ethio Learning", icon:GraduationCap, color:"#7654C8", bg:"#F2EEFF"},
  {name:"Ethio Technology", icon:Cpu, color:"#287F91", bg:"#E9F7FA"},
  {name:"Ethio Wallet", icon:WalletCards, color:"#18865B", bg:"#EAF8F0"},
  {name:"Ethio Travel", icon:Plane, color:"#3483C7", bg:"#EDF5FF"},
  {name:"Ethio Assistant", icon:Sparkles, color:"#9A69CE", bg:"#F6F0FF"},
  {name:"Ethio Jobs", icon:BriefcaseBusiness, color:"#A66A2B", bg:"#FBF2E9"},
  {name:"Ethio Access", icon:Shield, color:"#3866A8", bg:"#EEF3FC"},
  {name:"Ethio Studio", icon:Clapperboard, color:"#B24E9B", bg:"#FCEFFA"},
  {name:"Ethio Religio", icon:BookOpen, color:"#9C7920", bg:"#FBF7E8"},
  {name:"Ethio Earn", icon:Coins, color:"#1C966B", bg:"#E9F8F1"}
];

const copy = {
  OM: {
    tagline:"Waan hunda bakka tokkotti.", intro:"Eenummaa dijitaalaa kee tokkoon tajaajiloota hedduu fayyadami.",
    create:"Ethio ID Uumi", signin:"Seeni", already:"Herrega qabdaa?", start:"Jalqabi", full:"Maqaa guutuu", phone:"Lakkoofsa bilbilaa", identity:"Imeelii ykn bilbila", email:"Imeelii", password:"Jecha icciitii", country:"Biyya", countryValue:"Itoophiyaa", region:"Naannoo", city:"Magaalaa", username:"Maqaa fayyadamaa", terms:"Haala itti fayyadamaa fi imaammata iccitii nan fudhadha.", continue:"Itti fufi", back:"Duubatti", secure:"Eenummaa kee nageenyaan eegi", subtitle:"Ethio ID kee uumi; tajaajiloota 16 karoorfamaniif eenyummaa tokko.", loginTitle:"Baga nagaan deebite", loginSub:"Ethio ID kee fayyadamuun seeni.", preview:"", verifyHint:"Koodiin imeelii ykn bilbila keetti ergame galchi.", code:"Koodii OTP", forgot:"Jecha icciitii irraanfatte?", newPassword:"Jecha icciitii haaraa", resend:"Koodii irra deebi’ii ergi", sent:"Koodiin mirkaneessaa ergameera.", logout:"Ba’i", accountReady:"Baga nagaan dhuftan", chooseChannel:"Koodiin eessa haa ergamu?", emailChannel:"Imeelii", smsChannel:"SMS", serviceHeading:"Tajaajiloota 16 karoorfaman", serviceCaption:"Ethio ID tokko · Tajaajiloota gara fuulduraa", language:"Afaan", show:"Mul'isi", hide:"Dhoksii", required:"Maaloo odeeffannoo dirqamaa guuti.", contactRequired:"Imeelii ykn lakkoofsa bilbilaa tokko galchi.", emailInvalid:"Imeeliin sirrii miti.", phoneInvalid:"Lakkoofsi bilbilaa sirrii miti.", passwordShort:"Jecha icciitii yoo xiqqaate qubee 8 qabaachuu qaba.", termsRequired:"Itti fufuuf waliigaltee fudhadhu."
  },
  AM: {
    tagline:"ሁሉም ነገር በአንድ ቦታ።", intro:"በአንድ ዲጂታል መለያ ብዙ አገልግሎቶችን ይጠቀሙ።",
    create:"Ethio ID ፍጠር", signin:"ግባ", already:"መለያ አለዎት?", start:"ጀምር", full:"ሙሉ ስም", phone:"ስልክ ቁጥር", identity:"ኢሜይል ወይም ስልክ", email:"ኢሜይል", password:"የይለፍ ቃል", country:"አገር", countryValue:"ኢትዮጵያ", region:"ክልል", city:"ከተማ", username:"የተጠቃሚ ስም", terms:"የአጠቃቀም ውሎችን እና የግላዊነት ፖሊሲን እቀበላለሁ።", continue:"ቀጥል", back:"ተመለስ", secure:"መለያዎን በደህና ይጠብቁ", subtitle:"Ethio ID ይፍጠሩ፤ ለ16 በዕቅድ ላይ ላሉ አገልግሎቶች አንድ መለያ።", loginTitle:"እንኳን ደህና መጡ", loginSub:"በEthio ID ይግቡ።", preview:"", verifyHint:"ወደ ስልክዎ ወይም ኢሜይልዎ የተላከውን ኮድ ያስገቡ።", code:"የOTP ኮድ", forgot:"የይለፍ ቃል ረሱ?", newPassword:"አዲስ የይለፍ ቃል", resend:"ኮዱን እንደገና ላክ", sent:"የማረጋገጫ ኮድ ተልኳል።", logout:"ውጣ", accountReady:"እንኳን ደህና መጡ", chooseChannel:"ኮዱ የት ይላክ?", emailChannel:"ኢሜይል", smsChannel:"SMS", serviceHeading:"16 በዕቅድ ላይ ያሉ አገልግሎቶች", serviceCaption:"አንድ Ethio ID · ወደፊት የሚመጡ አገልግሎቶች", language:"ቋንቋ", show:"አሳይ", hide:"ደብቅ", required:"እባክዎ አስፈላጊ መረጃዎችን ይሙሉ።", contactRequired:"ኢሜይል ወይም ስልክ ቁጥር ያስገቡ።", emailInvalid:"ትክክለኛ ኢሜይል አይደለም።", phoneInvalid:"ትክክለኛ ስልክ ቁጥር አይደለም።", passwordShort:"የይለፍ ቃሉ ቢያንስ 8 ቁምፊዎች መሆን አለበት።", termsRequired:"ለመቀጠል ውሎቹን ይቀበሉ።"
  },
  EN: {
    tagline:"Everything. In one place.", intro:"One digital identity. A world of Ethiopian services.",
    create:"Create Ethio ID", signin:"Sign in", already:"Already have an account?", start:"Get started", full:"Full name", phone:"Phone number", identity:"Email or phone", email:"Email address", password:"Password", country:"Country", countryValue:"Ethiopia", region:"Region", city:"City", username:"Username", terms:"I agree to the Terms of Service and Privacy Policy.", continue:"Continue", back:"Back", secure:"Your identity, protected", subtitle:"Create your Ethio ID — the foundation for 16 planned services.", loginTitle:"Welcome back", loginSub:"Sign in with your Ethio ID.", preview:"", verifyHint:"Enter the code sent to your email or phone.", code:"OTP code", forgot:"Forgot password?", newPassword:"New password", resend:"Resend code", sent:"A verification code has been sent.", logout:"Sign out", accountReady:"Welcome", chooseChannel:"Where should we send your code?", emailChannel:"Email", smsChannel:"SMS", serviceHeading:"16 services on the roadmap", serviceCaption:"One Ethio ID · Services in development", language:"Language", show:"Show", hide:"Hide", required:"Please complete all required fields.", contactRequired:"Enter an email address or phone number.", emailInvalid:"Enter a valid email address.", phoneInvalid:"Enter a valid phone number.", passwordShort:"Password must be at least 8 characters.", termsRequired:"Accept the terms to continue."
  }
};

function Field({label, icon:Icon, value, onChangeText, placeholder, secureTextEntry=false, keyboardType="default", autoCapitalize="none", trailing}: any) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><View style={s.inputWrap}><Icon size={18} color={C.muted}/><TextInput value={value} onChangeText={onChangeText} accessibilityLabel={label} placeholder={placeholder || label} placeholderTextColor="#A0AABA" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={false} style={s.input}/>{trailing}</View></View>;
}
function PrimaryButton({title,onPress}: {title:string;onPress:()=>void}) {
  return <Pressable onPress={onPress} style={({pressed})=>[s.primary,pressed&&{opacity:.86}]}><Text style={s.primaryText}>{title}</Text><ArrowRight size={19} color={C.navy2}/></Pressable>;
}

export default function App() {
  const [language,setLanguage] = useState<Language>("OM");
  const [screen,setScreen] = useState<Screen>("welcome");
  const [showPassword,setShowPassword] = useState(false);
  const [accepted,setAccepted] = useState(false);
  const [channel,setChannel] = useState<"email"|"sms">("email");
  const [userId,setUserId] = useState(""); const [otp,setOtp] = useState("");
  const [resetPassword,setResetPassword] = useState(""); const [resetDestination,setResetDestination] = useState("");
  const [busy,setBusy] = useState(false); const [accountName,setAccountName] = useState(""); const [notice,setNotice] = useState("");
  const [form,setForm] = useState({full:"",phone:"",email:"",password:"",username:"",country:"",region:"",city:""});
  const t = copy[language];
  const set = (key:keyof typeof form, value:string) => setForm(old=>({...old,[key]:value}));
  const langLabel = useMemo(()=>({OM:"Oromoo",AM:"አማርኛ",EN:"English"}[language]),[language]);

  const request=async(path:string,body:any)=>{const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({error:"Could not read server response."}));if(!r.ok)throw new Error(d.error||"Request failed.");return d;};
  const saveSession=async(d:any)=>{await SecureStore.setItemAsync("ethio_one_access",d.accessToken);await SecureStore.setItemAsync("ethio_one_refresh",d.refreshToken);setAccountName(d.user?.fullName||d.user?.username||"Ethio One");setScreen("account");};
  const submitAction=async()=>{if(busy)return;try{setBusy(true);setNotice("");
    if(screen==="register"){
      if(!form.full.trim()||!form.username.trim()||!form.password||!form.country.trim()||!form.region.trim()||!form.city.trim())throw new Error(t.required);
      if(!form.email.trim()&&!form.phone.trim())throw new Error(t.contactRequired);
      if(form.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))throw new Error(t.emailInvalid);
      if(form.phone.trim()&&!/^\+?[0-9\s()-]{7,20}$/.test(form.phone.trim()))throw new Error(t.phoneInvalid);
      if(form.password.length<8)throw new Error(t.passwordShort);if(!accepted)throw new Error(t.termsRequired);
      const selected=channel==="email"&&form.email.trim()?"email":"sms";
      const d=await request("/register",{fullName:form.full.trim(),username:form.username.trim(),email:form.email.trim()||undefined,phone:form.phone.trim()||undefined,password:form.password,termsAccepted:true,channel:selected});
      setUserId(d.userId);setChannel(selected);setOtp("");setNotice(t.sent);setScreen("verify");
    }else if(screen==="signin"){
      if(!form.phone.trim()||!form.password)throw new Error(t.required);
      await saveSession(await request("/login",{identity:form.phone.trim(),password:form.password}));
    }else if(screen==="verify"){
      if(!/^\d{6}$/.test(otp))throw new Error(t.code+" — 6 digits");
      await saveSession(await request("/verify",{userId,channel,code:otp}));
    }else if(screen==="forgot"){
      const dest=form.phone.trim();if(!dest)throw new Error(t.contactRequired);const ch=dest.includes("@")?"email":"sms";
      await request("/password/forgot",{destination:dest,channel:ch});setResetDestination(dest);setChannel(ch);setOtp("");setNotice(t.sent);setScreen("reset");
    }else if(screen==="reset"){
      if(!/^\d{6}$/.test(otp))throw new Error(t.code+" — 6 digits");if(resetPassword.length<8)throw new Error(t.passwordShort);
      await request("/password/reset",{destination:resetDestination,channel,code:otp,newPassword:resetPassword});
      Alert.alert("Ethio One",language==="OM"?"Jecha icciitii haaromfameera. Amma seeni.":"Password updated. Please sign in.");setScreen("signin");setOtp("");setResetPassword("");
    }
  }catch(e:any){Alert.alert("Ethio One",e?.message||"Something went wrong.");}finally{setBusy(false);}};
  const resendCode=async()=>{if(busy)return;try{setBusy(true);await request("/verification/resend",{userId,channel});setNotice(t.sent);}catch(e:any){Alert.alert("Ethio One",e?.message||"Could not resend code.");}finally{setBusy(false);}};
  const signOut=async()=>{try{const token=await SecureStore.getItemAsync("ethio_one_refresh");if(token)await request("/logout",{refreshToken:token}).catch(()=>{});await SecureStore.deleteItemAsync("ethio_one_access");await SecureStore.deleteItemAsync("ethio_one_refresh");}finally{setAccountName("");setScreen("welcome");}};
  useEffect(()=>{let active=true;(async()=>{try{const token=await SecureStore.getItemAsync("ethio_one_access");if(!token||!active)return;const r=await fetch(API+"/me",{headers:{Authorization:"Bearer "+token}});if(r.ok){const d=await r.json();if(active){setAccountName(d.user?.fullName||d.user?.username||"Ethio One");setScreen("account");}return;}const refresh=await SecureStore.getItemAsync("ethio_one_refresh");if(refresh){const rr=await fetch(API+"/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken:refresh})});const d=await rr.json();if(rr.ok&&active){await SecureStore.setItemAsync("ethio_one_access",d.accessToken);await SecureStore.setItemAsync("ethio_one_refresh",d.refreshToken);setAccountName("Ethio One");setScreen("account");}else{await SecureStore.deleteItemAsync("ethio_one_access");await SecureStore.deleteItemAsync("ethio_one_refresh");}}}catch{}})();return()=>{active=false;};},[]);
  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content"/>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.topbar}>
          <View style={s.brand}><View style={s.brandMark}><Text style={s.brandMarkE}>E</Text><Text style={s.brandMarkOne}>1</Text></View><Text style={s.brandName}>ETHIO <Text style={{color:C.gold}}>ONE</Text></Text></View>
          <Pressable style={s.language} onPress={()=>setLanguage(v=>v==="OM"?"AM":v==="AM"?"EN":"OM")} accessibilityRole="button" accessibilityLabel={t.language}><Globe2 size={15} color={C.navy}/><Text style={s.languageText}>{language}</Text><ChevronDown size={13} color={C.navy}/></Pressable>
        </View>

        {screen==="welcome" ? <>
          <View style={s.hero}>
            <View style={s.orbitOne}/><View style={s.orbitTwo}/>
            <View style={s.heroLogoOuter}><View style={s.heroLogoRing}><Text style={s.heroLogoE}>E</Text><Text style={s.heroLogoOne}>1</Text></View></View>
            <Text style={s.eyebrow}>ONE ID · MANY SERVICES</Text>
            <Text style={s.heroTitle}>ETHIO{"\n"}<Text style={{color:C.gold}}>ONE</Text></Text>
            <Text style={s.tagline}>{t.tagline}</Text>
            <Text style={s.intro}>{t.intro}</Text>
            <View style={s.serviceHeading}><Text style={s.serviceTitle}>{t.serviceHeading}</Text><Text style={s.serviceCaption}>{t.serviceCaption}</Text></View>
            <View style={s.serviceGrid}>{services.map(item=>{const Icon=item.icon;return <View key={item.name} style={s.serviceCard}><View style={[s.serviceIcon,{backgroundColor:item.bg}]}><Icon size={19} color={item.color} strokeWidth={2.25}/></View><Text style={s.serviceName}>{item.name}</Text></View>;})}</View>
          </View>
          <View style={s.welcomeActions}>
            <PrimaryButton title={t.create} onPress={()=>setScreen("register")}/>
            <Pressable style={s.secondary} onPress={()=>setScreen("signin")}><Text style={s.secondaryText}>{t.signin}</Text></Pressable>
            <Text style={s.bottomPrompt}>{t.already} <Text style={s.inlineLink} onPress={()=>setScreen("signin")}>{t.signin}</Text></Text>
          </View>
          <View style={s.trust}><ShieldCheck size={17} color={C.gold}/><Text style={s.trustText}>{t.secure}</Text></View>
        </> : <>
          <Pressable style={s.back} onPress={()=>setScreen("welcome")}><ArrowLeft size={18} color={C.navy}/><Text style={s.backText}>{t.back}</Text></Pressable>
          <View style={s.formHeading}><View style={s.formBadge}><UserRound size={22} color={C.gold}/></View><Text style={s.formTitle}>{screen==="register"?t.create:t.loginTitle}</Text><Text style={s.formSub}>{screen==="register"?t.subtitle:t.loginSub}</Text></View>
          {screen==="register" ? <>
            <Field label={t.full} icon={UserRound} value={form.full} onChangeText={(v:string)=>set("full",v)} autoCapitalize="words"/>
            <Field label={t.phone} icon={Phone} value={form.phone} onChangeText={(v:string)=>set("phone",v)} keyboardType="phone-pad"/>
            <Field label={t.email} icon={Mail} value={form.email} onChangeText={(v:string)=>set("email",v)} keyboardType="email-address" autoCapitalize="none"/>
            <Field label={t.username} icon={UserRound} value={form.username} onChangeText={(v:string)=>set("username",v)}/>
            <View style={s.channelRow}><Text style={s.label}>{t.chooseChannel}</Text><View style={s.channelOptions}><Pressable onPress={()=>setChannel("email")} style={[s.channelOption,channel==="email"&&s.channelActive]}><Text style={[s.channelText,channel==="email"&&s.channelTextActive]}>{t.emailChannel}</Text></Pressable><Pressable onPress={()=>setChannel("sms")} style={[s.channelOption,channel==="sms"&&s.channelActive]}><Text style={[s.channelText,channel==="sms"&&s.channelTextActive]}>{t.smsChannel}</Text></Pressable></View></View>
            <Field label={t.password} icon={LockKeyhole} value={form.password} onChangeText={(v:string)=>set("password",v)} secureTextEntry={!showPassword} trailing={<Pressable onPress={()=>setShowPassword(v=>!v)} accessibilityRole="button" accessibilityLabel={showPassword?t.hide:t.show} hitSlop={10}><View style={s.passwordToggle}>{showPassword?<EyeOff size={17} color={C.muted}/>:<Eye size={17} color={C.muted}/>}<Text style={s.passwordToggleText}>{showPassword?t.hide:t.show}</Text></View></Pressable>}/>
            <Field label={t.country} icon={Globe2} value={form.country} onChangeText={(v:string)=>set("country",v)} placeholder={t.countryValue} autoCapitalize="words"/>
            <Field label={t.region} icon={Globe2} value={form.region} onChangeText={(v:string)=>set("region",v)} autoCapitalize="words"/>
            <Field label={t.city} icon={Globe2} value={form.city} onChangeText={(v:string)=>set("city",v)} autoCapitalize="words"/>
            <Pressable style={s.termsRow} onPress={()=>setAccepted(v=>!v)} accessibilityRole="checkbox" accessibilityState={{checked:accepted}}><View style={[s.checkbox,accepted&&s.checkboxOn]}>{accepted&&<Check size={13} color={C.white}/>}</View><Text style={s.termsText}>{t.terms}</Text></Pressable>
          </> : screen==="signin" ? <>
            <Field label={t.identity} icon={UserRound} value={form.phone} onChangeText={(v:string)=>set("phone",v)} keyboardType="email-address"/>
            <Field label={t.password} icon={LockKeyhole} value={form.password} onChangeText={(v:string)=>set("password",v)} secureTextEntry={!showPassword} trailing={<Pressable onPress={()=>setShowPassword(v=>!v)} accessibilityRole="button" accessibilityLabel={showPassword?t.hide:t.show} hitSlop={10}><View style={s.passwordToggle}>{showPassword?<EyeOff size={17} color={C.muted}/>:<Eye size={17} color={C.muted}/>}<Text style={s.passwordToggleText}>{showPassword?t.hide:t.show}</Text></View></Pressable>}/>
          </> : screen==="verify" ? <>
            <Text style={s.formSub}>{t.verifyHint}</Text><Field label={t.code} icon={ShieldCheck} value={otp} onChangeText={setOtp} keyboardType="number-pad"/>
            {!!notice&&<Text style={s.notice}>{notice}</Text>}<Pressable onPress={resendCode} style={s.textAction}><Text style={s.inlineLink}>{t.resend}</Text></Pressable>
          </> : screen==="forgot" ? <><Field label={t.identity} icon={UserRound} value={form.phone} onChangeText={(v:string)=>set("phone",v)} keyboardType="email-address"/></>
          : screen==="reset" ? <><Field label={t.code} icon={ShieldCheck} value={otp} onChangeText={setOtp} keyboardType="number-pad"/><Field label={t.newPassword} icon={LockKeyhole} value={resetPassword} onChangeText={setResetPassword} secureTextEntry={!showPassword}/>{!!notice&&<Text style={s.notice}>{notice}</Text>}</>
          : <><Text style={s.accountWelcome}>{t.accountReady}, {accountName}</Text><Text style={s.formSub}>Ethio ID</Text></>}
          {screen!=="account"&&<PrimaryButton title={busy?"...":t.continue} onPress={submitAction}/>}
          {screen==="signin"&&<Pressable onPress={()=>setScreen("forgot")} style={s.textAction}><Text style={s.inlineLink}>{t.forgot}</Text></Pressable>}
          {screen==="account"&&<Pressable style={s.secondary} onPress={signOut}><Text style={s.secondaryText}>{t.logout}</Text></Pressable>}
        </>}
        <Text style={s.footer}>ETHIO ONE  ·  {langLabel}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg}, page:{flexGrow:1,paddingHorizontal:24,paddingTop:12,paddingBottom:24},
  topbar:{height:52,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  brand:{flexDirection:"row",alignItems:"center",gap:9},brandMark:{width:38,height:38,borderRadius:12,backgroundColor:C.navy,alignItems:"center",justifyContent:"center",flexDirection:"row",shadowColor:C.navy,shadowOpacity:.2,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:4},brandMarkE:{fontSize:19,fontWeight:"900",color:C.white,letterSpacing:-2},brandMarkOne:{fontSize:19,fontWeight:"900",color:C.gold,letterSpacing:-1},brandName:{fontSize:15,fontWeight:"900",letterSpacing:1.5,color:C.navy},
  language:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:11,paddingVertical:8,borderRadius:20,backgroundColor:C.white,borderWidth:1,borderColor:C.line},languageText:{fontSize:12,fontWeight:"800",color:C.navy},
  hero:{backgroundColor:C.navy,borderRadius:30,marginTop:20,minHeight:405,alignItems:"center",justifyContent:"center",paddingHorizontal:22,paddingVertical:32,overflow:"hidden"},
  orbitOne:{position:"absolute",width:280,height:280,borderRadius:140,borderWidth:1,borderColor:"rgba(255,255,255,.08)",top:-115,right:-105},orbitTwo:{position:"absolute",width:220,height:220,borderRadius:110,borderWidth:1,borderColor:"rgba(217,169,40,.18)",bottom:-115,left:-80},
  heroLogoOuter:{width:88,height:88,borderRadius:44,backgroundColor:"rgba(255,255,255,.06)",alignItems:"center",justifyContent:"center",marginBottom:18,borderWidth:1,borderColor:"rgba(217,169,40,.45)"},heroLogoRing:{width:68,height:68,borderRadius:34,borderWidth:1,borderColor:"rgba(255,255,255,.34)",alignItems:"center",justifyContent:"center",flexDirection:"row"},heroLogoE:{fontSize:39,fontWeight:"900",color:C.white,letterSpacing:-5},heroLogoOne:{fontSize:39,fontWeight:"900",color:C.gold,letterSpacing:-3},
  eyebrow:{fontSize:10,fontWeight:"800",letterSpacing:2.7,color:"#D7E0ED",marginBottom:12},heroTitle:{fontSize:54,lineHeight:55,fontWeight:"900",letterSpacing:3,color:C.white,textAlign:"center"},tagline:{fontSize:18,fontWeight:"800",color:C.white,marginTop:14,textAlign:"center"},intro:{fontSize:13,lineHeight:20,color:"#D5DFEC",textAlign:"center",marginTop:9,maxWidth:280},
  serviceHeading:{width:"100%",alignItems:"center",marginTop:27,marginBottom:13},serviceTitle:{fontSize:14,fontWeight:"900",color:C.white},serviceCaption:{fontSize:10,color:"#C9D5E4",marginTop:4},serviceGrid:{width:"100%",flexDirection:"row",flexWrap:"wrap",justifyContent:"center",gap:8},serviceCard:{width:"22.5%",maxWidth:84,minHeight:78,borderRadius:13,backgroundColor:"rgba(255,255,255,.97)",alignItems:"center",justifyContent:"center",paddingHorizontal:4,paddingVertical:9},serviceIcon:{width:35,height:35,borderRadius:11,alignItems:"center",justifyContent:"center",marginBottom:6},serviceName:{fontSize:8.5,fontWeight:"800",color:C.ink,textAlign:"center"},
  welcomeActions:{marginTop:22,gap:11},primary:{minHeight:56,borderRadius:17,backgroundColor:C.gold,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:12},primaryText:{fontSize:15,fontWeight:"900",color:C.navy2},secondary:{height:52,borderRadius:16,borderWidth:1.5,borderColor:C.navy,alignItems:"center",justifyContent:"center",backgroundColor:C.white},secondaryText:{fontSize:15,fontWeight:"800",color:C.navy},bottomPrompt:{textAlign:"center",fontSize:12,color:C.muted,marginTop:4},inlineLink:{fontWeight:"900",color:C.navy},
  trust:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,marginTop:22},trustText:{fontSize:11,fontWeight:"700",color:C.muted},footer:{textAlign:"center",fontSize:9,fontWeight:"800",letterSpacing:2,color:"#A0AABA",marginTop:26},
  back:{flexDirection:"row",alignItems:"center",gap:8,marginTop:18},backText:{fontSize:13,fontWeight:"700",color:C.navy},formHeading:{marginTop:24,marginBottom:22},formBadge:{width:48,height:48,borderRadius:16,backgroundColor:C.navy,alignItems:"center",justifyContent:"center",marginBottom:14},formTitle:{fontSize:27,fontWeight:"900",color:C.ink},formSub:{fontSize:13,lineHeight:20,color:C.muted,marginTop:6},
  field:{marginBottom:14},label:{fontSize:12,fontWeight:"800",color:C.ink,marginBottom:7},inputWrap:{height:52,borderRadius:14,borderWidth:1,borderColor:C.line,backgroundColor:C.white,flexDirection:"row",alignItems:"center",paddingHorizontal:14,gap:10},input:{flex:1,fontSize:14,color:C.ink,paddingVertical:0},passwordToggle:{flexDirection:"row",alignItems:"center",gap:4},passwordToggleText:{fontSize:10,fontWeight:"800",color:C.navy},
  channelRow:{marginBottom:14},channelOptions:{flexDirection:"row",gap:8,marginTop:8},channelOption:{flex:1,padding:12,borderRadius:12,borderWidth:1,borderColor:C.line,alignItems:"center",backgroundColor:C.white},channelActive:{borderColor:C.navy,backgroundColor:C.pale},channelText:{fontSize:12,fontWeight:"700",color:C.muted},channelTextActive:{color:C.navy},notice:{fontSize:12,color:"#16845B",marginBottom:10},textAction:{paddingVertical:14,alignItems:"center"},accountWelcome:{fontSize:22,fontWeight:"900",color:C.navy,marginVertical:20},
  termsRow:{flexDirection:"row",alignItems:"center",gap:10,marginVertical:12},checkbox:{width:21,height:21,borderRadius:6,borderWidth:1.5,borderColor:"#B8C2D0",alignItems:"center",justifyContent:"center"},checkboxOn:{backgroundColor:C.navy,borderColor:C.navy},termsText:{flex:1,fontSize:11,lineHeight:17,color:C.muted},previewNote:{fontSize:11,lineHeight:17,color:C.muted,textAlign:"center",marginTop:14}
});
