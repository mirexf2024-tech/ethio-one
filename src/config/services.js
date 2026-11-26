/**
 * Galmee tajaajiloota ETHIO ONE.
 *
 * status:
 * - active: tajaajiloota marsaa jalqabaa keessatti irratti hojjetamu.
 * - draft: tajaajila karoora/qophii keessa jiru.
 * - coming_soon: tajaajila fuulduratti banamu.
 *
 * releaseStatus production registry irraa adda dha.
 * 'active' jechuun tajaajilli oomisha irratti guutummaatti baname jechuu MITI.
 */
export const ETHIO_ONE_SERVICES = [
  { id: 'jobs', name: { om: 'ETHIO JOBS', am: 'ኢትዮ ሥራ', en: 'ETHIO JOBS' }, status: 'active', releaseStatus: 'planned', category: 'career' },
  { id: 'service', name: { om: 'ETHIO SERVICE', am: 'ኢትዮ አገልግሎት', en: 'ETHIO SERVICE' }, status: 'active', releaseStatus: 'planned', category: 'local' },
  { id: 'learning', name: { om: 'ETHIO LEARNING', am: 'ኢትዮ ትምህርት', en: 'ETHIO LEARNING' }, status: 'active', releaseStatus: 'planned', category: 'education' },
  { id: 'social', name: { om: 'ETHIO SOCIAL', am: 'ኢትዮ ማኅበራዊ', en: 'ETHIO SOCIAL' }, status: 'coming_soon', releaseStatus: 'planned', category: 'community' },
  { id: 'tube', name: { om: 'ETHIO TUBE', am: 'ኢትዮ ቲዩብ', en: 'ETHIO TUBE' }, status: 'coming_soon', releaseStatus: 'planned', category: 'video' },
  { id: 'live', name: { om: 'ETHIO LIVE', am: 'ኢትዮ ቀጥታ', en: 'ETHIO LIVE' }, status: 'coming_soon', releaseStatus: 'planned', category: 'streaming' },
  { id: 'chat', name: { om: 'ETHIO CHAT', am: 'ኢትዮ ውይይት', en: 'ETHIO CHAT' }, status: 'coming_soon', releaseStatus: 'planned', category: 'communication' },
  { id: 'market', name: { om: 'ETHIO MARKET', am: 'ኢትዮ ገበያ', en: 'ETHIO MARKET' }, status: 'coming_soon', releaseStatus: 'planned', category: 'commerce' },
  { id: 'news', name: { om: 'ETHIO NEWS', am: 'ኢትዮ ዜና', en: 'ETHIO NEWS' }, status: 'coming_soon', releaseStatus: 'planned', category: 'news' },
  { id: 'technology', name: { om: 'ETHIO TECHNOLOGY', am: 'ኢትዮ ቴክኖሎጂ', en: 'ETHIO TECHNOLOGY' }, status: 'draft', releaseStatus: 'planned', category: 'tech' },
  { id: 'wallet', name: { om: 'ETHIO WALLET', am: 'ኢትዮ ዋሌት', en: 'ETHIO WALLET' }, status: 'draft', releaseStatus: 'planned', category: 'finance' },
  { id: 'travel', name: { om: 'ETHIO TRAVEL', am: 'ኢትዮ ጉዞ', en: 'ETHIO TRAVEL' }, status: 'draft', releaseStatus: 'planned', category: 'travel' },
  { id: 'assistant', name: { om: 'ETHIO ASSISTANT', am: 'ኢትዮ ረዳት', en: 'ETHIO ASSISTANT' }, status: 'draft', releaseStatus: 'planned', category: 'ai' },
  { id: 'access', name: { om: 'ETHIO ACCESS', am: 'ኢትዮ መዳረሻ', en: 'ETHIO ACCESS' }, status: 'draft', releaseStatus: 'planned', category: 'identity' },
  { id: 'studio', name: { om: 'ETHIO STUDIO', am: 'ኢትዮ ስቱዲዮ', en: 'ETHIO STUDIO' }, status: 'draft', releaseStatus: 'planned', category: 'creative' },
  { id: 'religio', name: { om: 'ETHIO RELIGIO', am: 'ኢትዮ እምነት', en: 'ETHIO RELIGIO' }, status: 'draft', releaseStatus: 'planned', category: 'community' },
  { id: 'earn', name: { om: 'ETHIO EARN', am: 'ኢትዮ ገቢ', en: 'ETHIO EARN' }, status: 'draft', releaseStatus: 'planned', category: 'tasks' },
  { id: 'email', name: { om: 'ETHIO EMAIL', am: 'ኢትዮ ኢሜይል', en: 'ETHIO EMAIL' }, status: 'draft', releaseStatus: 'planned', category: 'communication' },
  { id: 'sport', name: { om: 'ETHIO SPORT', am: 'ኢትዮ ስፖርት', en: 'ETHIO SPORT' }, status: 'draft', releaseStatus: 'planned', category: 'sports' },
  { id: 'cafe', name: { om: 'ETHIO CAFE', am: 'ኢትዮ ካፌ', en: 'ETHIO CAFE' }, status: 'draft', releaseStatus: 'planned', category: 'food' },
  { id: 'lottery', name: { om: 'ETHIO LOTTERY', am: 'ኢትዮ ሎተሪ', en: 'ETHIO LOTTERY' }, status: 'draft', releaseStatus: 'planned', category: 'entertainment' }
];

export const getServicesByStatus = (status) =>
  ETHIO_ONE_SERVICES.filter((service) => service.status === status);

export const getServiceById = (id) =>
  ETHIO_ONE_SERVICES.find((service) => service.id === id) ?? null;
