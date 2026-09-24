/**
 * FROM A COUNCIL'S ONS CODE TO HM LAND REGISTRY'S FILE NAME. Phase 151a, 24 September 2026.
 *
 * The ONS postcode table gives a property's local authority as a code ('E07000223'); HM Land Registry publishes the
 * INSPIRE Index Polygons as one file per council under its own spelling of the council's name
 * ('Adur_District_Council'). This table joins the two, and it is DERIVED FROM THE TWO PUBLISHED LISTS, NEVER GUESSED:
 *
 *   · HM Land Registry's 318 file names — src/connectors/inspire-authorities.ts, read 24 September 2026 from
 *     https://use-land-property-data.service.gov.uk/datasets/inspire/download (published 6 September 2026);
 *   · ONS's "Local Authority Districts (April 2025) Names and Codes in the UK" — the feature service
 *     LAD_APR_2025_UK_NC_v2 on the ONS Open Geography Portal, read 24 September 2026. Its England and Wales rows
 *     (codes beginning E and W) number 318, the same as HM Land Registry's files. No newer names-and-codes list was
 *     published on the portal that day.
 *
 * HOW A ROW IS DERIVED. `fileForOnsName` below is the rule: both names are lower-cased, punctuation dropped, and the
 * file name may add a prefix ("London Borough of", "Royal Borough of", "City of" …) and a suffix ("District Council",
 * "Borough Council", "Council" …) around the ONS name — never change a word of it. 310 of the 318 pair that way, each
 * to exactly one file. THE OTHER EIGHT are the eight files and the eight councils the rule leaves over, and they are
 * written out by hand in NAMED_PAIRS, each with the reason, because HM Land Registry names those councils differently
 * from ONS ("Hull_City_Council" for "Kingston upon Hull, City of"). They pair one to one: after the rule, eight files
 * and eight codes are left, and each file carries the council's own distinctive word. test/phase151a.test.ts re-runs
 * the rule over this table with no network and fails if any row is not what the rule and the named pairs say.
 *
 * A COUNCIL WITH NO ROW IS REFUSED (`inspireFileForLad`), never matched to the nearest name. ONS codes change when
 * councils are reorganised: a code this table does not hold means the lists have moved, and the fix is to read both
 * again with tools/inspire-council-table.ts, not to guess.
 *
 * A PROPERTY ON A COUNCIL BOUNDARY CAN BE IN TWO FILES. HM Land Registry: "If a polygon is on the boundary between
 * local authorities, it will appear in both local authority data files" (SUPPLIER_DOCS, HMLR_INSPIRE). The postcode
 * table gives one council per postcode, so src/connectors/site-area.ts reads that council's file and any council a
 * person adds, and says which it read.
 */
import { INSPIRE_AUTHORITY_FILES } from './inspire-authorities.ts';

export const ONS_LAD_LIST = {
  publisher: 'Office for National Statistics',
  dataset: 'Local Authority Districts (April 2025) Names and Codes in the UK',
  service: 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD_APR_2025_UK_NC_v2/FeatureServer/0',
  licence: 'Open Government Licence v3.0',
  read_on: '2026-09-24',
} as const;

const norm = (s: string): string =>
  s.toLowerCase().replace(/[’'.,]/g, '').replace(/&/g, 'and').replace(/[\s_-]+/g, ' ').trim();

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What HM Land Registry's file names may put before and after the ONS name. Words, not sentences. */
const BEFORE = ['london borough of', 'royal borough of', 'city of', 'city and county of', 'borough of', 'council of the', 'county borough of'];
const AFTER = ['district', 'borough', 'city', 'county', 'metropolitan', 'county borough', 'metropolitan borough', 'metropolitan district', 'royal borough', 'unitary'];
const PREFIX = `(?:(?:the )?(?:${BEFORE.join('|')}) )?`;
const SUFFIX = `(?: (?:${AFTER.join('|')}))*(?: council)?`;

/** The ONS name, and the two ways ONS writes a trailing ", City of" / ", County of". */
function variants(onsName: string): string[] {
  const n = norm(onsName);
  return [...new Set([n, n.replace(/^(.*) city of$/, 'city of $1'), n.replace(/^(.*) county of$/, '$1'), n.replace(/^(.*) city of$/, '$1')])];
}

/**
 * THE RULE. The files whose name is the ONS name with only a recognised prefix and suffix around it. Exactly one is a
 * match; none or several is no match, and the council is then one of NAMED_PAIRS or has no row.
 */
export function fileForOnsName(onsName: string, files: readonly string[] = INSPIRE_AUTHORITY_FILES): string[] {
  const res = variants(onsName).map((v) => new RegExp(`^${PREFIX}${escape(v)}${SUFFIX}$`));
  return files.filter((f) => res.some((re) => re.test(norm(f))));
}

/**
 * THE EIGHT THE RULE LEAVES OVER, each named by both publishers and paired by hand. `word` is the council's own
 * distinctive word, which both names carry; the test checks it is in both.
 */
export const NAMED_PAIRS: readonly { readonly lad_code: string; readonly file: string; readonly word: string; readonly why: string }[] = Object.freeze([
  { lad_code: 'E06000010', file: 'Hull_City_Council', word: 'Hull', why: 'ONS writes "Kingston upon Hull, City of"; HM Land Registry uses the council\'s own short name.' },
  { lad_code: 'E06000017', file: 'Rutland_County_Council_District_Council', word: 'Rutland', why: 'HM Land Registry\'s file name carries both "County Council" and "District Council".' },
  { lad_code: 'E06000047', file: 'Durham_County_Council', word: 'Durham', why: 'ONS writes "County Durham"; the council is Durham County Council.' },
  { lad_code: 'E09000001', file: 'City_of_London_Corporation', word: 'London', why: 'Its council is the City of London Corporation.' },
  { lad_code: 'E07000240', file: 'St_Albans_City_and_District_Council', word: 'Albans', why: 'The council is St Albans City and District Council.' },
  { lad_code: 'E08000021', file: 'Newcastle_City_Council', word: 'Newcastle', why: 'ONS writes "Newcastle upon Tyne"; HM Land Registry uses the council\'s own short name.' },
  { lad_code: 'E06000065', file: 'The_North_Yorkshire_Council', word: 'Yorkshire', why: 'HM Land Registry\'s file name begins "The".' },
  { lad_code: 'E07000146', file: 'Borough_Council_of_Kings_Lynn_and_West_Norfolk', word: 'Lynn', why: 'The council is the Borough Council of King\'s Lynn and West Norfolk, written without the apostrophe.' },
]);

export type InspireCouncil = { readonly lad_code: string; readonly ons_name: string; readonly file: string };

/* BEGIN GENERATED ROWS — written by tools/inspire-council-table.ts --write from the ONS list above. Do not hand-edit. */
export const INSPIRE_COUNCILS: readonly InspireCouncil[] = Object.freeze([
  { lad_code: "E06000001", ons_name: "Hartlepool", file: "Hartlepool_Borough_Council" },
  { lad_code: "E06000002", ons_name: "Middlesbrough", file: "Middlesbrough_Borough_Council" },
  { lad_code: "E06000003", ons_name: "Redcar and Cleveland", file: "Redcar_and_Cleveland_Borough_Council" },
  { lad_code: "E06000004", ons_name: "Stockton-on-Tees", file: "Stockton-on-Tees_Borough_Council" },
  { lad_code: "E06000005", ons_name: "Darlington", file: "Darlington_Borough_Council" },
  { lad_code: "E06000006", ons_name: "Halton", file: "Halton_Borough_Council" },
  { lad_code: "E06000007", ons_name: "Warrington", file: "Warrington_Borough_Council" },
  { lad_code: "E06000008", ons_name: "Blackburn with Darwen", file: "Blackburn_with_Darwen_Borough_Council" },
  { lad_code: "E06000009", ons_name: "Blackpool", file: "Blackpool_Borough_Council" },
  { lad_code: "E06000010", ons_name: "Kingston upon Hull, City of", file: "Hull_City_Council" },
  { lad_code: "E06000011", ons_name: "East Riding of Yorkshire", file: "East_Riding_of_Yorkshire_Council" },
  { lad_code: "E06000012", ons_name: "North East Lincolnshire", file: "North_East_Lincolnshire_Council" },
  { lad_code: "E06000013", ons_name: "North Lincolnshire", file: "North_Lincolnshire_Council" },
  { lad_code: "E06000014", ons_name: "York", file: "City_of_York_Council" },
  { lad_code: "E06000015", ons_name: "Derby", file: "Derby_City_Council" },
  { lad_code: "E06000016", ons_name: "Leicester", file: "Leicester_City_Council" },
  { lad_code: "E06000017", ons_name: "Rutland", file: "Rutland_County_Council_District_Council" },
  { lad_code: "E06000018", ons_name: "Nottingham", file: "Nottingham_City_Council" },
  { lad_code: "E06000019", ons_name: "Herefordshire, County of", file: "Herefordshire_Council" },
  { lad_code: "E06000020", ons_name: "Telford and Wrekin", file: "Telford_and_Wrekin_Council" },
  { lad_code: "E06000021", ons_name: "Stoke-on-Trent", file: "Stoke-on-Trent_City_Council" },
  { lad_code: "E06000022", ons_name: "Bath and North East Somerset", file: "Bath_and_North_East_Somerset_Council" },
  { lad_code: "E06000023", ons_name: "Bristol, City of", file: "Bristol_City_Council" },
  { lad_code: "E06000024", ons_name: "North Somerset", file: "North_Somerset_Council" },
  { lad_code: "E06000025", ons_name: "South Gloucestershire", file: "South_Gloucestershire_Council" },
  { lad_code: "E06000026", ons_name: "Plymouth", file: "Plymouth_City_Council" },
  { lad_code: "E06000027", ons_name: "Torbay", file: "Torbay_Council" },
  { lad_code: "E06000030", ons_name: "Swindon", file: "Swindon_Borough_Council" },
  { lad_code: "E06000031", ons_name: "Peterborough", file: "Peterborough_City_Council" },
  { lad_code: "E06000032", ons_name: "Luton", file: "Luton_Borough_Council" },
  { lad_code: "E06000033", ons_name: "Southend-on-Sea", file: "Southend-on-Sea_Borough_Council" },
  { lad_code: "E06000034", ons_name: "Thurrock", file: "Thurrock_Council" },
  { lad_code: "E06000035", ons_name: "Medway", file: "Medway_Council" },
  { lad_code: "E06000036", ons_name: "Bracknell Forest", file: "Bracknell_Forest_Council" },
  { lad_code: "E06000037", ons_name: "West Berkshire", file: "West_Berkshire_Council" },
  { lad_code: "E06000038", ons_name: "Reading", file: "Reading_Borough_Council" },
  { lad_code: "E06000039", ons_name: "Slough", file: "Slough_Borough_Council" },
  { lad_code: "E06000040", ons_name: "Windsor and Maidenhead", file: "Royal_Borough_of_Windsor_and_Maidenhead" },
  { lad_code: "E06000041", ons_name: "Wokingham", file: "Wokingham_Borough_Council" },
  { lad_code: "E06000042", ons_name: "Milton Keynes", file: "Milton_Keynes_Council" },
  { lad_code: "E06000043", ons_name: "Brighton and Hove", file: "Brighton_and_Hove_City_Council" },
  { lad_code: "E06000044", ons_name: "Portsmouth", file: "Portsmouth_City_Council" },
  { lad_code: "E06000045", ons_name: "Southampton", file: "Southampton_City_Council" },
  { lad_code: "E06000046", ons_name: "Isle of Wight", file: "Isle_of_Wight_Council" },
  { lad_code: "E06000047", ons_name: "County Durham", file: "Durham_County_Council" },
  { lad_code: "E06000049", ons_name: "Cheshire East", file: "Cheshire_East_Council" },
  { lad_code: "E06000050", ons_name: "Cheshire West and Chester", file: "Cheshire_West_and_Chester_Council" },
  { lad_code: "E06000051", ons_name: "Shropshire", file: "Shropshire_Council" },
  { lad_code: "E06000052", ons_name: "Cornwall", file: "Cornwall_Council" },
  { lad_code: "E06000053", ons_name: "Isles of Scilly", file: "Council_of_the_Isles_of_Scilly" },
  { lad_code: "E06000054", ons_name: "Wiltshire", file: "Wiltshire_Council" },
  { lad_code: "E06000055", ons_name: "Bedford", file: "Bedford_Borough_Council" },
  { lad_code: "E06000056", ons_name: "Central Bedfordshire", file: "Central_Bedfordshire_Council" },
  { lad_code: "E06000057", ons_name: "Northumberland", file: "Northumberland_County_Council" },
  { lad_code: "E06000058", ons_name: "Bournemouth, Christchurch and Poole", file: "Bournemouth_Christchurch_and_Poole_Council" },
  { lad_code: "E06000059", ons_name: "Dorset", file: "Dorset_Council" },
  { lad_code: "E06000060", ons_name: "Buckinghamshire", file: "Buckinghamshire_Council" },
  { lad_code: "E06000061", ons_name: "North Northamptonshire", file: "North_Northamptonshire_Council" },
  { lad_code: "E06000062", ons_name: "West Northamptonshire", file: "West_Northamptonshire_Council" },
  { lad_code: "E06000063", ons_name: "Cumberland", file: "Cumberland_Council" },
  { lad_code: "E06000064", ons_name: "Westmorland and Furness", file: "Westmorland_and_Furness_Council" },
  { lad_code: "E06000065", ons_name: "North Yorkshire", file: "The_North_Yorkshire_Council" },
  { lad_code: "E06000066", ons_name: "Somerset", file: "Somerset_Council" },
  { lad_code: "E07000008", ons_name: "Cambridge", file: "Cambridge_City_Council" },
  { lad_code: "E07000009", ons_name: "East Cambridgeshire", file: "East_Cambridgeshire_District_Council" },
  { lad_code: "E07000010", ons_name: "Fenland", file: "Fenland_District_Council" },
  { lad_code: "E07000011", ons_name: "Huntingdonshire", file: "Huntingdonshire_District_Council" },
  { lad_code: "E07000012", ons_name: "South Cambridgeshire", file: "South_Cambridgeshire_District_Council" },
  { lad_code: "E07000032", ons_name: "Amber Valley", file: "Amber_Valley_Borough_Council" },
  { lad_code: "E07000033", ons_name: "Bolsover", file: "Bolsover_District_Council" },
  { lad_code: "E07000034", ons_name: "Chesterfield", file: "Chesterfield_Borough_Council" },
  { lad_code: "E07000035", ons_name: "Derbyshire Dales", file: "Derbyshire_Dales_District_Council" },
  { lad_code: "E07000036", ons_name: "Erewash", file: "Erewash_Borough_Council" },
  { lad_code: "E07000037", ons_name: "High Peak", file: "High_Peak_Borough_Council" },
  { lad_code: "E07000038", ons_name: "North East Derbyshire", file: "North_East_Derbyshire_District_Council" },
  { lad_code: "E07000039", ons_name: "South Derbyshire", file: "South_Derbyshire_District_Council" },
  { lad_code: "E07000040", ons_name: "East Devon", file: "East_Devon_District_Council" },
  { lad_code: "E07000041", ons_name: "Exeter", file: "Exeter_City_Council" },
  { lad_code: "E07000042", ons_name: "Mid Devon", file: "Mid_Devon_District_Council" },
  { lad_code: "E07000043", ons_name: "North Devon", file: "North_Devon_District_Council" },
  { lad_code: "E07000044", ons_name: "South Hams", file: "South_Hams_District_Council" },
  { lad_code: "E07000045", ons_name: "Teignbridge", file: "Teignbridge_District_Council" },
  { lad_code: "E07000046", ons_name: "Torridge", file: "Torridge_District_Council" },
  { lad_code: "E07000047", ons_name: "West Devon", file: "West_Devon_Borough_Council" },
  { lad_code: "E07000061", ons_name: "Eastbourne", file: "Eastbourne_Borough_Council" },
  { lad_code: "E07000062", ons_name: "Hastings", file: "Hastings_Borough_Council" },
  { lad_code: "E07000063", ons_name: "Lewes", file: "Lewes_District_Council" },
  { lad_code: "E07000064", ons_name: "Rother", file: "Rother_District_Council" },
  { lad_code: "E07000065", ons_name: "Wealden", file: "Wealden_District_Council" },
  { lad_code: "E07000066", ons_name: "Basildon", file: "Basildon_Borough_Council" },
  { lad_code: "E07000067", ons_name: "Braintree", file: "Braintree_District_Council" },
  { lad_code: "E07000068", ons_name: "Brentwood", file: "Brentwood_Borough_Council" },
  { lad_code: "E07000069", ons_name: "Castle Point", file: "Castle_Point_Borough_Council" },
  { lad_code: "E07000070", ons_name: "Chelmsford", file: "Chelmsford_City_Council" },
  { lad_code: "E07000071", ons_name: "Colchester", file: "Colchester_Borough_Council" },
  { lad_code: "E07000072", ons_name: "Epping Forest", file: "Epping_Forest_District_Council" },
  { lad_code: "E07000073", ons_name: "Harlow", file: "Harlow_District_Council" },
  { lad_code: "E07000074", ons_name: "Maldon", file: "Maldon_District_Council" },
  { lad_code: "E07000075", ons_name: "Rochford", file: "Rochford_District_Council" },
  { lad_code: "E07000076", ons_name: "Tendring", file: "Tendring_District_Council" },
  { lad_code: "E07000077", ons_name: "Uttlesford", file: "Uttlesford_District_Council" },
  { lad_code: "E07000078", ons_name: "Cheltenham", file: "Cheltenham_Borough_Council" },
  { lad_code: "E07000079", ons_name: "Cotswold", file: "Cotswold_District_Council" },
  { lad_code: "E07000080", ons_name: "Forest of Dean", file: "Forest_of_Dean_District_Council" },
  { lad_code: "E07000081", ons_name: "Gloucester", file: "Gloucester_City_Council" },
  { lad_code: "E07000082", ons_name: "Stroud", file: "Stroud_District_Council" },
  { lad_code: "E07000083", ons_name: "Tewkesbury", file: "Tewkesbury_Borough_Council" },
  { lad_code: "E07000084", ons_name: "Basingstoke and Deane", file: "Basingstoke_and_Deane_Borough_Council" },
  { lad_code: "E07000085", ons_name: "East Hampshire", file: "East_Hampshire_District_Council" },
  { lad_code: "E07000086", ons_name: "Eastleigh", file: "Eastleigh_Borough_Council" },
  { lad_code: "E07000087", ons_name: "Fareham", file: "Fareham_Borough_Council" },
  { lad_code: "E07000088", ons_name: "Gosport", file: "Gosport_Borough_Council" },
  { lad_code: "E07000089", ons_name: "Hart", file: "Hart_District_Council" },
  { lad_code: "E07000090", ons_name: "Havant", file: "Havant_Borough_Council" },
  { lad_code: "E07000091", ons_name: "New Forest", file: "New_Forest_District_Council" },
  { lad_code: "E07000092", ons_name: "Rushmoor", file: "Rushmoor_Borough_Council" },
  { lad_code: "E07000093", ons_name: "Test Valley", file: "Test_Valley_Borough_Council" },
  { lad_code: "E07000094", ons_name: "Winchester", file: "Winchester_City_Council" },
  { lad_code: "E07000095", ons_name: "Broxbourne", file: "Broxbourne_Borough_Council" },
  { lad_code: "E07000096", ons_name: "Dacorum", file: "Dacorum_Borough_Council" },
  { lad_code: "E07000098", ons_name: "Hertsmere", file: "Hertsmere_Borough_Council" },
  { lad_code: "E07000099", ons_name: "North Hertfordshire", file: "North_Hertfordshire_District_Council" },
  { lad_code: "E07000102", ons_name: "Three Rivers", file: "Three_Rivers_District_Council" },
  { lad_code: "E07000103", ons_name: "Watford", file: "Watford_Borough_Council" },
  { lad_code: "E07000105", ons_name: "Ashford", file: "Ashford_Borough_Council" },
  { lad_code: "E07000106", ons_name: "Canterbury", file: "Canterbury_City_Council" },
  { lad_code: "E07000107", ons_name: "Dartford", file: "Dartford_Borough_Council" },
  { lad_code: "E07000108", ons_name: "Dover", file: "Dover_District_Council" },
  { lad_code: "E07000109", ons_name: "Gravesham", file: "Gravesham_Borough_Council" },
  { lad_code: "E07000110", ons_name: "Maidstone", file: "Maidstone_Borough_Council" },
  { lad_code: "E07000111", ons_name: "Sevenoaks", file: "Sevenoaks_District_Council" },
  { lad_code: "E07000112", ons_name: "Folkestone and Hythe", file: "Folkestone_and_Hythe_District_Council" },
  { lad_code: "E07000113", ons_name: "Swale", file: "Swale_Borough_Council" },
  { lad_code: "E07000114", ons_name: "Thanet", file: "Thanet_District_Council" },
  { lad_code: "E07000115", ons_name: "Tonbridge and Malling", file: "Tonbridge_and_Malling_Borough_Council" },
  { lad_code: "E07000116", ons_name: "Tunbridge Wells", file: "Tunbridge_Wells_Borough_Council" },
  { lad_code: "E07000117", ons_name: "Burnley", file: "Burnley_Borough_Council" },
  { lad_code: "E07000118", ons_name: "Chorley", file: "Chorley_Borough_Council" },
  { lad_code: "E07000119", ons_name: "Fylde", file: "Fylde_Borough_Council" },
  { lad_code: "E07000120", ons_name: "Hyndburn", file: "Hyndburn_Borough_Council" },
  { lad_code: "E07000121", ons_name: "Lancaster", file: "Lancaster_City_Council" },
  { lad_code: "E07000122", ons_name: "Pendle", file: "Pendle_Borough_Council" },
  { lad_code: "E07000123", ons_name: "Preston", file: "Preston_City_Council" },
  { lad_code: "E07000124", ons_name: "Ribble Valley", file: "Ribble_Valley_Borough_Council" },
  { lad_code: "E07000125", ons_name: "Rossendale", file: "Rossendale_Borough_Council" },
  { lad_code: "E07000126", ons_name: "South Ribble", file: "South_Ribble_Borough_Council" },
  { lad_code: "E07000127", ons_name: "West Lancashire", file: "West_Lancashire_Borough_Council" },
  { lad_code: "E07000128", ons_name: "Wyre", file: "Wyre_Borough_Council" },
  { lad_code: "E07000129", ons_name: "Blaby", file: "Blaby_District_Council" },
  { lad_code: "E07000130", ons_name: "Charnwood", file: "Charnwood_Borough_Council" },
  { lad_code: "E07000131", ons_name: "Harborough", file: "Harborough_District_Council" },
  { lad_code: "E07000132", ons_name: "Hinckley and Bosworth", file: "Hinckley_and_Bosworth_Borough_Council" },
  { lad_code: "E07000133", ons_name: "Melton", file: "Melton_Borough_Council" },
  { lad_code: "E07000134", ons_name: "North West Leicestershire", file: "North_West_Leicestershire_District_Council" },
  { lad_code: "E07000135", ons_name: "Oadby and Wigston", file: "Oadby_and_Wigston_Borough_Council" },
  { lad_code: "E07000136", ons_name: "Boston", file: "Boston_Borough_Council" },
  { lad_code: "E07000137", ons_name: "East Lindsey", file: "East_Lindsey_District_Council" },
  { lad_code: "E07000138", ons_name: "Lincoln", file: "City_of_Lincoln_Council" },
  { lad_code: "E07000139", ons_name: "North Kesteven", file: "North_Kesteven_District_Council" },
  { lad_code: "E07000140", ons_name: "South Holland", file: "South_Holland_District_Council" },
  { lad_code: "E07000141", ons_name: "South Kesteven", file: "South_Kesteven_District_Council" },
  { lad_code: "E07000142", ons_name: "West Lindsey", file: "West_Lindsey_District_Council" },
  { lad_code: "E07000143", ons_name: "Breckland", file: "Breckland_District_Council" },
  { lad_code: "E07000144", ons_name: "Broadland", file: "Broadland_District_Council" },
  { lad_code: "E07000145", ons_name: "Great Yarmouth", file: "Great_Yarmouth_Borough_Council" },
  { lad_code: "E07000146", ons_name: "King's Lynn and West Norfolk", file: "Borough_Council_of_Kings_Lynn_and_West_Norfolk" },
  { lad_code: "E07000147", ons_name: "North Norfolk", file: "North_Norfolk_District_Council" },
  { lad_code: "E07000148", ons_name: "Norwich", file: "Norwich_City_Council" },
  { lad_code: "E07000149", ons_name: "South Norfolk", file: "South_Norfolk_Council" },
  { lad_code: "E07000170", ons_name: "Ashfield", file: "Ashfield_District_Council" },
  { lad_code: "E07000171", ons_name: "Bassetlaw", file: "Bassetlaw_District_Council" },
  { lad_code: "E07000172", ons_name: "Broxtowe", file: "Broxtowe_Borough_Council" },
  { lad_code: "E07000173", ons_name: "Gedling", file: "Gedling_Borough_Council" },
  { lad_code: "E07000174", ons_name: "Mansfield", file: "Mansfield_District_Council" },
  { lad_code: "E07000175", ons_name: "Newark and Sherwood", file: "Newark_and_Sherwood_District_Council" },
  { lad_code: "E07000176", ons_name: "Rushcliffe", file: "Rushcliffe_Borough_Council" },
  { lad_code: "E07000177", ons_name: "Cherwell", file: "Cherwell_District_Council" },
  { lad_code: "E07000178", ons_name: "Oxford", file: "Oxford_City_Council" },
  { lad_code: "E07000179", ons_name: "South Oxfordshire", file: "South_Oxfordshire_District_Council" },
  { lad_code: "E07000180", ons_name: "Vale of White Horse", file: "Vale_of_White_Horse_District_Council" },
  { lad_code: "E07000181", ons_name: "West Oxfordshire", file: "West_Oxfordshire_District_Council" },
  { lad_code: "E07000192", ons_name: "Cannock Chase", file: "Cannock_Chase_District_Council" },
  { lad_code: "E07000193", ons_name: "East Staffordshire", file: "East_Staffordshire_Borough_Council" },
  { lad_code: "E07000194", ons_name: "Lichfield", file: "Lichfield_District_Council" },
  { lad_code: "E07000195", ons_name: "Newcastle-under-Lyme", file: "Newcastle-under-Lyme_Borough_Council" },
  { lad_code: "E07000196", ons_name: "South Staffordshire", file: "South_Staffordshire_Council" },
  { lad_code: "E07000197", ons_name: "Stafford", file: "Stafford_Borough_Council" },
  { lad_code: "E07000198", ons_name: "Staffordshire Moorlands", file: "Staffordshire_Moorlands_District_Council" },
  { lad_code: "E07000199", ons_name: "Tamworth", file: "Tamworth_Borough_Council" },
  { lad_code: "E07000200", ons_name: "Babergh", file: "Babergh_District_Council" },
  { lad_code: "E07000202", ons_name: "Ipswich", file: "Ipswich_Borough_Council" },
  { lad_code: "E07000203", ons_name: "Mid Suffolk", file: "Mid_Suffolk_District_Council" },
  { lad_code: "E07000207", ons_name: "Elmbridge", file: "Elmbridge_Borough_Council" },
  { lad_code: "E07000208", ons_name: "Epsom and Ewell", file: "Epsom_and_Ewell_Borough_Council" },
  { lad_code: "E07000209", ons_name: "Guildford", file: "Guildford_Borough_Council" },
  { lad_code: "E07000210", ons_name: "Mole Valley", file: "Mole_Valley_District_Council" },
  { lad_code: "E07000211", ons_name: "Reigate and Banstead", file: "Reigate_and_Banstead_Borough_Council" },
  { lad_code: "E07000212", ons_name: "Runnymede", file: "Runnymede_Borough_Council" },
  { lad_code: "E07000213", ons_name: "Spelthorne", file: "Spelthorne_Borough_Council" },
  { lad_code: "E07000214", ons_name: "Surrey Heath", file: "Surrey_Heath_Borough_Council" },
  { lad_code: "E07000215", ons_name: "Tandridge", file: "Tandridge_District_Council" },
  { lad_code: "E07000216", ons_name: "Waverley", file: "Waverley_Borough_Council" },
  { lad_code: "E07000217", ons_name: "Woking", file: "Woking_Borough_Council" },
  { lad_code: "E07000218", ons_name: "North Warwickshire", file: "North_Warwickshire_Borough_Council" },
  { lad_code: "E07000219", ons_name: "Nuneaton and Bedworth", file: "Nuneaton_and_Bedworth_Borough_Council" },
  { lad_code: "E07000220", ons_name: "Rugby", file: "Rugby_Borough_Council" },
  { lad_code: "E07000221", ons_name: "Stratford-on-Avon", file: "Stratford-on-Avon_District_Council" },
  { lad_code: "E07000222", ons_name: "Warwick", file: "Warwick_District_Council" },
  { lad_code: "E07000223", ons_name: "Adur", file: "Adur_District_Council" },
  { lad_code: "E07000224", ons_name: "Arun", file: "Arun_District_Council" },
  { lad_code: "E07000225", ons_name: "Chichester", file: "Chichester_District_Council" },
  { lad_code: "E07000226", ons_name: "Crawley", file: "Crawley_Borough_Council" },
  { lad_code: "E07000227", ons_name: "Horsham", file: "Horsham_District_Council" },
  { lad_code: "E07000228", ons_name: "Mid Sussex", file: "Mid_Sussex_District_Council" },
  { lad_code: "E07000229", ons_name: "Worthing", file: "Worthing_Borough_Council" },
  { lad_code: "E07000234", ons_name: "Bromsgrove", file: "Bromsgrove_District_Council" },
  { lad_code: "E07000235", ons_name: "Malvern Hills", file: "Malvern_Hills_District_Council" },
  { lad_code: "E07000236", ons_name: "Redditch", file: "Redditch_Borough_Council" },
  { lad_code: "E07000237", ons_name: "Worcester", file: "Worcester_City_Council" },
  { lad_code: "E07000238", ons_name: "Wychavon", file: "Wychavon_District_Council" },
  { lad_code: "E07000239", ons_name: "Wyre Forest", file: "Wyre_Forest_District_Council" },
  { lad_code: "E07000240", ons_name: "St Albans", file: "St_Albans_City_and_District_Council" },
  { lad_code: "E07000241", ons_name: "Welwyn Hatfield", file: "Welwyn_Hatfield_Borough_Council" },
  { lad_code: "E07000242", ons_name: "East Hertfordshire", file: "East_Hertfordshire_District_Council" },
  { lad_code: "E07000243", ons_name: "Stevenage", file: "Stevenage_Borough_Council" },
  { lad_code: "E07000244", ons_name: "East Suffolk", file: "East_Suffolk_Council" },
  { lad_code: "E07000245", ons_name: "West Suffolk", file: "West_Suffolk_Council" },
  { lad_code: "E08000001", ons_name: "Bolton", file: "Bolton_Metropolitan_Borough_Council" },
  { lad_code: "E08000002", ons_name: "Bury", file: "Bury_Metropolitan_Borough_Council" },
  { lad_code: "E08000003", ons_name: "Manchester", file: "Manchester_City_Council" },
  { lad_code: "E08000004", ons_name: "Oldham", file: "Oldham_Metropolitan_Borough_Council" },
  { lad_code: "E08000005", ons_name: "Rochdale", file: "Rochdale_Metropolitan_Borough_Council" },
  { lad_code: "E08000006", ons_name: "Salford", file: "Salford_City_Council" },
  { lad_code: "E08000007", ons_name: "Stockport", file: "Stockport_Metropolitan_Borough_Council" },
  { lad_code: "E08000008", ons_name: "Tameside", file: "Tameside_Metropolitan_Borough_Council" },
  { lad_code: "E08000009", ons_name: "Trafford", file: "Trafford_Borough_Council" },
  { lad_code: "E08000010", ons_name: "Wigan", file: "Wigan_Metropolitan_Borough_Council" },
  { lad_code: "E08000011", ons_name: "Knowsley", file: "Knowsley_Metropolitan_Borough_Council" },
  { lad_code: "E08000012", ons_name: "Liverpool", file: "Liverpool_City_Council" },
  { lad_code: "E08000013", ons_name: "St. Helens", file: "St_Helens_Council" },
  { lad_code: "E08000014", ons_name: "Sefton", file: "Sefton_Metropolitan_Borough_Council" },
  { lad_code: "E08000015", ons_name: "Wirral", file: "Wirral_Borough_Council" },
  { lad_code: "E08000017", ons_name: "Doncaster", file: "Doncaster_Metropolitan_Borough_Council" },
  { lad_code: "E08000018", ons_name: "Rotherham", file: "Rotherham_Metropolitan_Borough_Council" },
  { lad_code: "E08000021", ons_name: "Newcastle upon Tyne", file: "Newcastle_City_Council" },
  { lad_code: "E08000022", ons_name: "North Tyneside", file: "North_Tyneside_Council" },
  { lad_code: "E08000023", ons_name: "South Tyneside", file: "South_Tyneside_Council" },
  { lad_code: "E08000024", ons_name: "Sunderland", file: "Sunderland_City_Council" },
  { lad_code: "E08000025", ons_name: "Birmingham", file: "Birmingham_City_Council" },
  { lad_code: "E08000026", ons_name: "Coventry", file: "Coventry_City_Council" },
  { lad_code: "E08000027", ons_name: "Dudley", file: "Dudley_Metropolitan_Borough_Council" },
  { lad_code: "E08000028", ons_name: "Sandwell", file: "Sandwell_Metropolitan_Borough_Council" },
  { lad_code: "E08000029", ons_name: "Solihull", file: "Solihull_Metropolitan_Borough_Council" },
  { lad_code: "E08000030", ons_name: "Walsall", file: "Walsall_Metropolitan_Borough_Council" },
  { lad_code: "E08000031", ons_name: "Wolverhampton", file: "City_of_Wolverhampton_Council" },
  { lad_code: "E08000032", ons_name: "Bradford", file: "City_of_Bradford_Metropolitan_District_Council" },
  { lad_code: "E08000033", ons_name: "Calderdale", file: "Calderdale_Metropolitan_Borough_Council" },
  { lad_code: "E08000034", ons_name: "Kirklees", file: "Kirklees_Council" },
  { lad_code: "E08000035", ons_name: "Leeds", file: "Leeds_City_Council" },
  { lad_code: "E08000036", ons_name: "Wakefield", file: "Wakefield_Metropolitan_District_Council" },
  { lad_code: "E08000037", ons_name: "Gateshead", file: "Gateshead_Metropolitan_Borough_Council" },
  { lad_code: "E08000038", ons_name: "Barnsley", file: "Barnsley_Metropolitan_Borough_Council" },
  { lad_code: "E08000039", ons_name: "Sheffield", file: "Sheffield_City_Council" },
  { lad_code: "E09000001", ons_name: "City of London", file: "City_of_London_Corporation" },
  { lad_code: "E09000002", ons_name: "Barking and Dagenham", file: "London_Borough_of_Barking_and_Dagenham" },
  { lad_code: "E09000003", ons_name: "Barnet", file: "London_Borough_of_Barnet" },
  { lad_code: "E09000004", ons_name: "Bexley", file: "London_Borough_of_Bexley" },
  { lad_code: "E09000005", ons_name: "Brent", file: "London_Borough_of_Brent" },
  { lad_code: "E09000006", ons_name: "Bromley", file: "London_Borough_of_Bromley" },
  { lad_code: "E09000007", ons_name: "Camden", file: "London_Borough_of_Camden" },
  { lad_code: "E09000008", ons_name: "Croydon", file: "London_Borough_of_Croydon" },
  { lad_code: "E09000009", ons_name: "Ealing", file: "London_Borough_of_Ealing" },
  { lad_code: "E09000010", ons_name: "Enfield", file: "London_Borough_of_Enfield" },
  { lad_code: "E09000011", ons_name: "Greenwich", file: "Royal_Borough_of_Greenwich" },
  { lad_code: "E09000012", ons_name: "Hackney", file: "London_Borough_of_Hackney" },
  { lad_code: "E09000013", ons_name: "Hammersmith and Fulham", file: "London_Borough_of_Hammersmith_and_Fulham" },
  { lad_code: "E09000014", ons_name: "Haringey", file: "London_Borough_of_Haringey" },
  { lad_code: "E09000015", ons_name: "Harrow", file: "London_Borough_of_Harrow" },
  { lad_code: "E09000016", ons_name: "Havering", file: "London_Borough_of_Havering" },
  { lad_code: "E09000017", ons_name: "Hillingdon", file: "London_Borough_of_Hillingdon" },
  { lad_code: "E09000018", ons_name: "Hounslow", file: "London_Borough_of_Hounslow" },
  { lad_code: "E09000019", ons_name: "Islington", file: "London_Borough_of_Islington" },
  { lad_code: "E09000020", ons_name: "Kensington and Chelsea", file: "Royal_Borough_of_Kensington_and_Chelsea" },
  { lad_code: "E09000021", ons_name: "Kingston upon Thames", file: "Royal_Borough_of_Kingston_upon_Thames" },
  { lad_code: "E09000022", ons_name: "Lambeth", file: "London_Borough_of_Lambeth" },
  { lad_code: "E09000023", ons_name: "Lewisham", file: "London_Borough_of_Lewisham" },
  { lad_code: "E09000024", ons_name: "Merton", file: "London_Borough_of_Merton" },
  { lad_code: "E09000025", ons_name: "Newham", file: "London_Borough_of_Newham" },
  { lad_code: "E09000026", ons_name: "Redbridge", file: "London_Borough_of_Redbridge" },
  { lad_code: "E09000027", ons_name: "Richmond upon Thames", file: "London_Borough_of_Richmond_upon_Thames" },
  { lad_code: "E09000028", ons_name: "Southwark", file: "London_Borough_of_Southwark" },
  { lad_code: "E09000029", ons_name: "Sutton", file: "London_Borough_of_Sutton" },
  { lad_code: "E09000030", ons_name: "Tower Hamlets", file: "London_Borough_of_Tower_Hamlets" },
  { lad_code: "E09000031", ons_name: "Waltham Forest", file: "London_Borough_of_Waltham_Forest" },
  { lad_code: "E09000032", ons_name: "Wandsworth", file: "London_Borough_of_Wandsworth" },
  { lad_code: "E09000033", ons_name: "Westminster", file: "City_of_Westminster" },
  { lad_code: "W06000001", ons_name: "Isle of Anglesey", file: "Isle_of_Anglesey_County_Council" },
  { lad_code: "W06000002", ons_name: "Gwynedd", file: "Gwynedd_Council" },
  { lad_code: "W06000003", ons_name: "Conwy", file: "Conwy_County_Borough_Council" },
  { lad_code: "W06000004", ons_name: "Denbighshire", file: "Denbighshire_County_Council" },
  { lad_code: "W06000005", ons_name: "Flintshire", file: "Flintshire_County_Council" },
  { lad_code: "W06000006", ons_name: "Wrexham", file: "Wrexham_County_Borough_Council" },
  { lad_code: "W06000008", ons_name: "Ceredigion", file: "Ceredigion_County_Council" },
  { lad_code: "W06000009", ons_name: "Pembrokeshire", file: "Pembrokeshire_County_Council" },
  { lad_code: "W06000010", ons_name: "Carmarthenshire", file: "Carmarthenshire_County_Council" },
  { lad_code: "W06000011", ons_name: "Swansea", file: "Swansea_Council" },
  { lad_code: "W06000012", ons_name: "Neath Port Talbot", file: "Neath_Port_Talbot_County_Borough_Council" },
  { lad_code: "W06000013", ons_name: "Bridgend", file: "Bridgend_County_Borough_Council" },
  { lad_code: "W06000014", ons_name: "Vale of Glamorgan", file: "Vale_of_Glamorgan_Council" },
  { lad_code: "W06000015", ons_name: "Cardiff", file: "Cardiff_Council" },
  { lad_code: "W06000016", ons_name: "Rhondda Cynon Taf", file: "Rhondda_Cynon_Taf_County_Borough_Council" },
  { lad_code: "W06000018", ons_name: "Caerphilly", file: "Caerphilly_County_Borough_Council" },
  { lad_code: "W06000019", ons_name: "Blaenau Gwent", file: "Blaenau_Gwent_County_Borough_Council" },
  { lad_code: "W06000020", ons_name: "Torfaen", file: "Torfaen_County_Borough_Council" },
  { lad_code: "W06000021", ons_name: "Monmouthshire", file: "Monmouthshire_County_Council" },
  { lad_code: "W06000022", ons_name: "Newport", file: "Newport_City_Council" },
  { lad_code: "W06000023", ons_name: "Powys", file: "Powys_County_Council" },
  { lad_code: "W06000024", ons_name: "Merthyr Tydfil", file: "Merthyr_Tydfil_County_Borough_Council" },
]);
/* END GENERATED ROWS */

const BY_LAD = new Map(INSPIRE_COUNCILS.map((c) => [c.lad_code, c]));

export type CouncilFile =
  | { readonly ok: true; readonly lad_code: string; readonly council: string; readonly file: string }
  | { readonly ok: false; readonly lad_code: string | null; readonly why: string };

/** A council's code to its file. A code with no row is refused, in plain words; nothing is matched by likeness. */
export function inspireFileForLad(lad_code: unknown): CouncilFile {
  if (typeof lad_code !== 'string' || lad_code.trim() === '') {
    return { ok: false, lad_code: null, why: 'We do not know which council the property is in, so we cannot tell which land boundary file to read.' };
  }
  const code = lad_code.trim().toUpperCase();
  const row = BY_LAD.get(code);
  if (row === undefined) {
    return {
      ok: false, lad_code: code,
      why: `Council code ${code} is not in our list of HM Land Registry's land boundary files. The lists may have changed since ` +
        `${ONS_LAD_LIST.read_on}; a person must read both again rather than guess.`,
    };
  }
  return { ok: true, lad_code: code, council: row.ons_name, file: row.file };
}
