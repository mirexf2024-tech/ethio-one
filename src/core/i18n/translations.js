/**
 * Afaanota ETHIO ONE.
 * Galmeen kun jechoota waliinii brand, Ethio ID fi haala tajaajilaa qaba.
 * Hiikni fuula guutuu index.html keessatti duraan jiru itti fufa.
 */
export const TRANSLATIONS = Object.freeze({
  om: Object.freeze({
    brand: "ETHIO ONE",
    tagline: "ONE IDENTITY. MANY POSSIBILITIES.",
    subTagline: "Eenyummaa Tokko. Carraawwan Hedduu.",
    heroDesc: "Appii tokko qofa miti — addunyaa tajaajiloota dijitaalaa hedduu bakka tokkotti! Dargaggoonni barachuu, hojii argachuu fi galii uumuu; daldaltoonni guddachuu.",
    loginBtn: "Ethio ID Seenii / Galmaa'i",
    logoutBtn: "Ba'i",
    loggedInAs: "Ethio ID seeneera:",
    activeBadge: "Hojjechaa Jira",
    draftBadge: "Qophii Irra Jira",
    draftNotice: "Tajaajilli kun yeroo ammaa qophii irra jira. Yeroo dhiyootti ni eegala."
  }),
  am: Object.freeze({
    brand: "ETHIO ONE",
    tagline: "ONE IDENTITY. MANY POSSIBILITIES.",
    subTagline: "አንድ መታወቂያ። ብዙ አማራጮች።",
    heroDesc: "አንድ መተግበሪያ ብቻ አይደለም — የብዙ ዲጂታል አገልግሎቶች ዓለም በአንድ ቦታ! ወጣቶች እንዲማሩ፣ ሥራ እንዲያገኙ እና ገቢ እንዲፈጥሩ፤ ነጋዴዎች እንዲያድጉ።",
    loginBtn: "በEthio ID ይግቡ / ይመዝገቡ",
    logoutBtn: "ውጣ",
    loggedInAs: "የገቡት በEthio ID:",
    activeBadge: "ንቁ",
    draftBadge: "በዝግጅት ላይ",
    draftNotice: "ይህ አገልግሎት በአሁኑ ወቅት በዝግጅት ላይ ነው። በቅርቡ ይጀምራል።"
  }),
  en: Object.freeze({
    brand: "ETHIO ONE",
    tagline: "ONE IDENTITY. MANY POSSIBILITIES.",
    subTagline: "One Identity. Many Possibilities.",
    heroDesc: "Not just one app — a world of 20+ digital services in one place! Empowering youth to learn, find work, and earn, while helping businesses grow.",
    loginBtn: "Sign In / Join with Ethio ID",
    logoutBtn: "Sign Out",
    loggedInAs: "Signed in as Ethio ID:",
    activeBadge: "Active",
    draftBadge: "Coming Soon",
    draftNotice: "This service is currently in preparation and will launch in phases."
  })
});

export function getTranslations(language = "om") {
  return TRANSLATIONS[language] || TRANSLATIONS.om;
}
