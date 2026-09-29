/* ====================== UTILITIES ====================== */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rnd=(a,b)=>a+Math.random()*(b-a);
const rint=(a,b)=>Math.floor(rnd(a,b+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SUF=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc','Ud','Dd','Td'];
function fmt(n){
  if(n!==n) return '0';
  if(!isFinite(n)) return '∞';
  if(n<0) return '-'+fmt(-n);
  if(n<1000){ return n<10?String(Math.floor(n*100)/100):n<100?String(Math.floor(n*10)/10):String(Math.floor(n)); }
  const e=Math.floor(Math.log10(n)/3);
  if(e>=SUF.length) return n.toExponential(2).replace('e+','e');
  const v=n/Math.pow(1000,e);
  return (v<10?v.toFixed(2):v<100?v.toFixed(1):v.toFixed(0))+SUF[e];
}
const money=n=>'$'+fmt(n);
function clock(s){ s=Math.max(0,Math.ceil(s)); const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60; return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`; }
function dur(s){ s=Math.round(s); if(s<60) return s+'s'; if(s<3600) return Math.round(s/60)+'m'; if(s<86400){ const h=Math.floor(s/3600),m=Math.round(s%3600/60); return m?`${h}h ${m}m`:`${h}h`; } const d=Math.floor(s/86400),h=Math.round(s%86400/3600); return h?`${d}d ${h}h`:`${d}d`; }
const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const yesterdayKey=()=>{ const d=new Date(); d.setDate(d.getDate()-1); return dayKey(d); };

/* ====================== WORLD DATA ====================== */
const PACE=3;          /* pay dial: multiplies every crew's base pay */
const NT=16;           /* tiers per world */
const CURVE=[[15,.1],[100,1],[1100,8],[12000,47],[130000,260],[1.4e6,1400],[2e7,7800],[3.3e8,44000],[5.1e9,2.6e5],[7.5e10,1.6e6],[1e12,1e7],[1.4e13,6.5e7],[2.1e14,4.3e8],[3.2e15,3e9],[5e16,2.2e10],[8e17,1.7e11]];
function mkGens(rows){ return rows.map((r,i)=>({n:r[0],s:r[1],role:r[2],crime:r[3],lane:r[4],cap:r[5],col:r[6],cost:CURVE[i][0],inc:CURVE[i][1]*PACE})); }
const GUP_C=[400,2e4,1.5e6,1e8,8e9,5e11,3e13,3e15,3e17,3e19,3e21,3e23];
const GUP_P=[.10,.10,.15,.15,.2,.2,.25,.25,.3,.3,.4,.4];
const TAP_C=[150,1500,25e3,5e5,1e7,3e8,1e10,5e11,2e13,1e15];
const PCT_C=[5e3,5e5,5e7,5e9,5e11];
const MILE_T=[10,25,50,100,150,200,250,300];
const MILE_G=['bolt','cam','radio','shield','eye','target','key','star'];

const WORLDS=[
{
 id:'police',name:'Night Precinct',short:'Police',dept:'Police Department',kind:'crook',g:1.15,pay:1,
 req:{table:[5.417e7,6.513e11,4.733e14,8.352e19,9.882e24,3.221e27,9.437e28,6.056e29,1.64e30,6.299e30,2.043e31]},
 blurb:'Patrol the neon streets and climb from Rookie to Living Legend.',
 ranks:['Rookie','Patrol Officer','Corporal','Sergeant','Lieutenant','Captain','Major','Deputy Chief','Chief of Police','Commissioner','Marshal of the City','Living Legend'],
 districts:['Downtown','Harbor District','Old Town','Neon Mile','Financial Row','Skyline Heights'],
 L:{tap:'Arrest!',tapWord:'ARREST',rate:'arrests/s',ledger:'Crime Ledger',ledgerSub:'arrests by officer type',total:'Total arrests',roster:'Officers',rosterSub:'hire more, arrest more',done:'BUSTED',
    ops:'Squads on Duty',opsSub:'timed cases pay in cash, badges and lockers',cases:'Open Cases',locker:'Evidence Lockers',squad:'Squad',unit:'officer',hire:'Hire',bounty:'WANTED',bountyOk:'Fugitive cuffed',jackpot:'JACKPOT bust',spree:'CRIME SPREE'},
 crates:{std:'Evidence Locker',elite:'Sealed Case',legend:'Vault Drop'},
 ops:['Traffic Stop Sweep','Neighborhood Watch','Undercover Sting','Warehouse Raid','Kingpin Takedown'],
 gens:mkGens([
  ['Rookie Cadet','Cadet','Fresh out of the academy','Jaywalkers cited','walk',6,'#5aa0ff'],
  ['Foot Patrol','Patrol','Pounding the beat','Shoplifters cuffed','walk',6,'#3d8bff'],
  ['Motor Patrol','Moto','Two wheels, zero patience','Speeders stopped','road1',4,'#ff9f43'],
  ['Squad Car','Cruiser','Lights, sirens, cold coffee','Car thieves caught','road2',4,'#ff3d55'],
  ['K-9 Unit','K-9','A nose for trouble','Smugglers sniffed out','walk',4,'#c8894a'],
  ['Detective','Detective','Sees what you missed','Fraudsters exposed','walk',5,'#b08d57'],
  ['Forensics Lab','Forensics','Every hair tells a story','Cold cases cracked','walk',4,'#7ce8ff'],
  ['SWAT Team','SWAT','Knock knock. Police.','Heists foiled','walk',5,'#8b93b8'],
  ['Air Support','Chopper','Eyes in the sky','Getaways grounded','air',3,'#4de3c1'],
  ['Cyber Division','Cyber','Arrests by keystroke','Hackers traced','drone',3,'#b57cff'],
  ['Federal Task Force','Fed','Above your jurisdiction','Syndicates dismantled','road1',4,'#e4e9ff'],
  ['Orbital Watch','Orbital','Nowhere left to hide','Kingpins located','sat',2,'#ffc53d'],
  ['Armored Response','Armored','Rolls through anything','Standoffs ended','road2',3,'#6b7bb8'],
  ['Robo Patrol','Robo','Never sleeps, never tips','Tickets auto-issued','walk',4,'#9fb0d8'],
  ['Pre-Crime Unit','Precrime','Arrests you before you plan it','Crimes prevented','walk',3,'#b57cff'],
  ['Dimension Police','Dimension','Jurisdiction: everywhere','Timelines sealed','walk',2,'#ff5fa2'],
 ]),
 milestone:['Better Boots','Body Camera','Encrypted Radio','Ballistic Vest','AI Dispatch','Tactical Optics','Neural Link','Quantum Core'],
 tapUp:['Steel Cuffs','Quick-Draw Holster','Stun Baton','Taser X2','Riot Restraints','Smart Cuffs','Zip-Tie Cannon','Tractor Cuffs','Stasis Cuffs','Reality Cuffs'],
 gup:['Coffee Machine','Donut Budget','Police Union','Body Cams Program','City Hall Grant','Federal Funding','Public Trust','Zero Tolerance Act','World Police Treaty','Galactic Charter','Timeline Accord','Law of Everything'],
 msg:[
  ['wrote up a jaywalker crossing in a full clown suit','stopped a scooter chase at 4 mph','confiscated a suspicious sack of garden gnomes'],
  ['cuffed a shoplifter carrying 14 rotisserie chickens','broke up a tug-of-war over the last donut','walked a graffiti artist back to the wall he tagged'],
  ['clocked a speeder doing 90 in a school zone','pulled over a getaway scooter with a sidecar','tailed a stolen ice-cream truck by its jingle'],
  ['boxed in a stolen sports car outside the mall','ended a 3-block chase with one well-placed cone','pulled a trunk full of counterfeit sneakers'],
  ['Biscuit found a suitcase of fake watches','Biscuit sniffed out a stash under a hot dog cart','Biscuit tracked a runaway suspect across the park'],
  ['traced a forged-painting ring to a pizza shop','cracked the case of the vanishing statue','spotted the fake alibi in one sentence'],
  ['matched a shoelace to a stolen safe','lifted a fingerprint off a stolen crown','reopened a 20-year-old cold case and closed it'],
  ['breached a warehouse and cuffed twelve smugglers','ended a bank standoff without a single shot','raided a counterfeit money print shop'],
  ['spotlighted a getaway van on the freeway','grounded a stolen helicopter mid-escape','tracked a convoy across three districts'],
  ['traced a ransomware crew to a basement','froze a crypto-laundering scheme','unmasked a phishing gang in six minutes'],
  ['dismantled an international smuggling ring','seized a container of forged passports','arrested a fugitive banker at the border'],
  ['pinpointed a syndicate boss from orbit','watched a hidden airstrip light up on thermal','flagged an entire crime family from 400 km up'],
  ['rolled an armored van through a barricade of stolen scooters','extracted hostages from a bank vault in 40 seconds'],
  ['RX-7 flagged a jaywalker before he stepped off the curb','RX-7 issued 400 tickets in a single blink'],
  ['arrested a man for a heist he had only thought about','stopped a robbery that had not happened yet'],
  ['closed a portal full of counterfeit timelines','cuffed a burglar who robbed one house in three realities'],
 ],
 skins:[
  {id:'classic',n:'Classic Cruiser',price:0,body:'#eef1ff',stripe:'#2b6cff',roof:'#c9d4ff'},
  {id:'retro',n:'Black & White',price:120,body:'#171a2c',stripe:'#f3f4ff',roof:'#f3f4ff'},
  {id:'neon',n:'Neon Drift',price:200,body:'#1d0f45',stripe:'#ff2fd2',roof:'#7a3cff'},
  {id:'stealth',n:'Matte Stealth',price:250,body:'#262a35',stripe:'#4a5168',roof:'#1a1d27'},
  {id:'gold',n:'Gold Standard',price:600,body:'#e8b93a',stripe:'#fff0b3',roof:'#ffd766'},
 ],
 agents:[
  {id:'nova',n:'Det. Nova Reyes',role:'Cold-case closer',price:120,m:1.25,desc:'All income x1.25',face:{skin:'#c98b62',hair:'#1b1230',hat:'none',gl:1}},
  {id:'mabel',n:'Sgt. Iron Mabel',role:'Twenty years, zero paperwork',price:350,m:1.5,desc:'All income x1.5',face:{skin:'#8a5a3c',hair:'#d8d8e8',hat:'peak'}},
  {id:'biscuit',n:'Biscuit, K-9 Legend',role:'Good boy. Great cop.',price:500,m:3,gen:4,desc:'K-9 Units earn x3',face:{hat:'dog'}},
  {id:'vega',n:'Capt. Marco Vega',role:'Never loses a chase',price:900,m:2,desc:'All income x2',face:{skin:'#e0b48c',hair:'#111',hat:'peak',beard:1}},
  {id:'okoye',n:'Dr. Amara Okoye',role:'Forensics prodigy',price:1600,m:5,gen:6,desc:'Forensics Labs earn x5',face:{skin:'#6b432b',hair:'#0a0a12',hat:'hood',gl:1,body:'#f4f6ff'}},
  {id:'halloran',n:'Chief Halloran',role:'The commissioner fears him',price:4500,m:3,desc:'All income x3',face:{skin:'#f0c9a0',hair:'#9aa0b8',hat:'peak',gold:1,beard:1}},
 ],
 startBonus:0,
},
{
 id:'fire',name:'Ember Station',short:'Fire',dept:'Fire Department',kind:'flame',g:1.15,pay:1,
 req:{table:[1.194e14,7.72e20,1.844e26,1.202e29,3.568e30,1.802e31,4.614e31,1.252e32,2.248e32,2.915e32,6.228e32]},
 blurb:'Trade the badge for a hose. Put out every blaze in a city that never stops burning.',
 ranks:['Probie','Firefighter','Engineer','Lieutenant','Captain','Battalion Chief','Division Chief','Deputy Chief','Assistant Chief','Fire Chief','Fire Marshal','Blaze Legend'],
 districts:['Station 1','Riverside','Foundry Row','Old Mill','Ash Hills','Cinder Peak'],
 L:{tap:'Extinguish!',tapWord:'EXTINGUISH',rate:'fires out/s',ledger:'Incident Log',ledgerSub:'incidents by crew type',total:'Total incidents',roster:'Crews',rosterSub:'hire more, douse more',done:'DOUSED',
    ops:'Crews on Call',opsSub:'timed callouts pay in cash, badges and crates',cases:'Open Callouts',locker:'Gear Crates',squad:'Crew',unit:'firefighter',hire:'Hire',bounty:'FLASHOVER',bountyOk:'Hot spot doused',jackpot:'INFERNO cleared',spree:'FIRE STORM'},
 crates:{std:'Gear Locker',elite:'Toolbox Crate',legend:'Station Safe'},
 ops:['Hydrant Check','Brush Watch','Warehouse Fire','High-Rise Blaze','Wildfire Siege'],
 gens:mkGens([
  ['Probie','Probie','Rookie hose-dragger','Trash fires doused','walk',6,'#ffb02b'],
  ['Firefighter','Fighter','Turnout gear, zero fear','Kitchen fires put out','walk',6,'#ff8a3d'],
  ['Brush Rig ATV','Rig','Off-road, off-limits','Brush fires stopped','road1',4,'#ff5a1f'],
  ['Fire Engine','Engine','Red, loud, unstoppable','Structure fires doused','road2',4,'#ff3d3d'],
  ['Station Dalmatian','Dalmatian','Sniffs out smoke','Smoke alarms answered','walk',4,'#f4f6ff'],
  ['Fire Investigator','Investigator','Reads the burn patterns','Arson cases solved','walk',5,'#c9a24a'],
  ['Hazmat Team','Hazmat','Suits up for anything','Chemical spills contained','walk',4,'#ffd21f'],
  ['Rescue Squad','Rescue','Axes, jaws, nerves of steel','Trapped victims freed','walk',5,'#d1442a'],
  ['Water Tender','Tender','A river on wheels','Hydrants supplied','road1',3,'#8fd3ff'],
  ['Ladder Truck','Ladder','Up to the 20th floor','High-rise rescues','road2',3,'#e63946'],
  ['Helitanker','Helitanker','Buckets from the sky','Wildfires soaked','air',3,'#ff9f43'],
  ['Thermal Drones','Drones','Hot spots have nowhere to hide','Hot spots found','drone',3,'#ff7a1a'],
  ['Air Tanker','Tanker','Retardant carpet bombing','Firelines laid','air',2,'#ff5a3d'],
  ['Mobile Command','Command','The war room on wheels','Evacuations coordinated','road1',3,'#8b93b8'],
  ['Firebot','Firebot','Walks into the inferno','Blazes entered','walk',4,'#e07040'],
  ['Orbital Fire Watch','Orbital','Sees smoke from space','Wildfires predicted','sat',2,'#ffc53d'],
 ]),
 milestone:['Reflective Stripes','Thermal Camera','Radio Headset','Fireproof Coat','Smart Nozzle','SCBA Upgrade','Neural Link','Quantum Core'],
 tapUp:['Heavy Nozzle','Quick Coupler','Foam Sprayer','Jet Nozzle','Pressure Boost','Smart Nozzle','Cold Fire Foam','Aqua Cannon','Wave Cannon','Rain Engine'],
 gup:['Station Chili Night','Bake Sale Budget','Firefighters Union','Helmet Cams Program','City Hall Grant','Federal Funding','Public Trust','Zero Fire Act','World Fire Treaty','Galactic Charter','Timeline Accord','Law of Water'],
 msg:[
  ['dragged a hose the wrong way, then the right way','doused a trash can fire with a very full bucket'],
  ['put out a kitchen fire before the toast burned','rescued a cat from a very tall tree'],
  ['blasted a brush fire on a mountain trail','cut a firebreak in ninety seconds flat'],
  ['answered a warehouse fire in record time','hooked a hydrant and drowned a dumpster fire'],
  ['Ember barked at a smoke alarm nobody heard','Ember led the crew to a hidden basement fire'],
  ['traced a blaze to a faulty toaster','matched burn patterns to one very guilty candle'],
  ['sealed a leaking drum of mystery goo','neutralized a chemical spill on the highway'],
  ['cut a driver free with the jaws of life','pulled two hikers from a collapsed cabin'],
  ['piped a river to a far-off wildfire','refilled three engines from a single pond'],
  ['rescued a window washer from the 20th floor','put out a rooftop blaze from the air'],
  ['dumped a lake on a raging hillside','soaked a whole ridge line in one pass'],
  ['found a hidden hot spot inside a wall','mapped a wildfire edge in real time'],
  ['laid a red firebreak across three canyons','carpet-bombed a wildfire with retardant'],
  ['evacuated a neighborhood with one radio call','coordinated six crews from a single map'],
  ['walked into a furnace and walked out unbothered','carried a fridge out of a burning kitchen'],
  ['spotted a spark from 400 km up','predicted a wildfire before it was a wildfire'],
 ],
 skins:[
  {id:'classic',n:'Fire Engine Red',price:0,body:'#d82b2b',stripe:'#ffe28a',roof:'#a81f1f'},
  {id:'retro',n:'Lime-Yellow Engine',price:120,body:'#c8e03a',stripe:'#d82b2b',roof:'#a0b620'},
  {id:'neon',n:'Neon Blaze',price:200,body:'#2a0f10',stripe:'#ff7a1a',roof:'#ff3d3d'},
  {id:'stealth',n:'Matte Black Engine',price:250,body:'#22252b',stripe:'#ff3d3d',roof:'#15171c'},
  {id:'gold',n:'Gold Engine',price:600,body:'#e8b93a',stripe:'#fff0b3',roof:'#ffd766'},
 ],
 agents:[
  {id:'f_blaze',n:'Capt. Rosa Blaze',role:'Ran into every fire',price:120,m:1.25,desc:'All income x1.25',face:{skin:'#c98b62',hair:'#4a1a10',hat:'fire',hc:'#ffd21f',body:'#cfa64a'}},
  {id:'f_ash',n:'Eng. Marcus Ash',role:'Pump operator, poet',price:350,m:1.5,desc:'All income x1.5',face:{skin:'#8a5a3c',hair:'#111',hat:'fire',hc:'#d82b2b',body:'#cfa64a',beard:1}},
  {id:'f_ember',n:'Ember, Station Legend',role:'Spotted. Loved. Unstoppable.',price:500,m:3,gen:4,desc:'Dalmatians earn x3',face:{hat:'dog'}},
  {id:'f_cinder',n:'Lt. Cinder Okafor',role:'First in, last out',price:900,m:2,desc:'All income x2',face:{skin:'#6b432b',hair:'#0a0a12',hat:'fire',hc:'#f4f6ff',body:'#d1442a'}},
  {id:'f_tanaka',n:'Dr. Yuki Tanaka',role:'Fire scientist',price:1600,m:5,gen:6,desc:'Hazmat Teams earn x5',face:{skin:'#e0b48c',hair:'#111',hat:'hood',gl:1,body:'#ffd21f'}},
  {id:'f_chief',n:'Chief Brannigan',role:'Has never been on the cold side of a door',price:4500,m:3,desc:'All income x3',face:{skin:'#f0c9a0',hair:'#b8b8c8',hat:'fire',hc:'#f4f6ff',body:'#20242e',gold:1,beard:1}},
 ],
 startBonus:100,
},
{
 id:'ems',name:'Golden Hour',short:'EMS',dept:'Emergency Medical Service',kind:'patient',hard:true,g:1.22,pay:0.45,bountyMul:1.5,opMul:.7,
 req:{table:[2.016e15,1.334e23,1.938e27,2.001e29,1.827e30,6.275e30,1.198e31,2.28e31,3.411e31,4.5e31,8.327e31]},
 blurb:'Race the clock. Every second counts, every save pays. The hardest shift in the city.',
 ranks:['Trainee','EMT','Paramedic','Field Supervisor','Lieutenant Medic','Captain Medic','Battalion Medic','Deputy Director','Medical Director','Chief of EMS','Surgeon General','Lifegiver'],
 districts:['Mercy General','Eastside','Harbor Clinic','Golden Mile','Northgate','Skyline Med'],
 L:{tap:'Treat!',tapWord:'TREAT',rate:'patients/s',ledger:'Patient Log',ledgerSub:'patients by team type',total:'Total patients',roster:'Medics',rosterSub:'hire more, save more',done:'SAVED',
    ops:'Rigs on Call',opsSub:'timed transports pay in cash, badges and crates',cases:'Open Calls',locker:'Supply Crates',squad:'Rig',unit:'medic',hire:'Hire',bounty:'GURNEY',bountyOk:'Patient stabilized',jackpot:'MIRACLE save',spree:'CODE BLUE RUSH'},
 crates:{std:'Supply Cabinet',elite:'Trauma Kit Case',legend:'Med Vault'},
 ops:['Routine Transport','Street Fair Standby','Highway Collision','Hospital Surge','Disaster Zone'],
 gens:mkGens([
  ['Trainee EMT','Trainee','First day on the rig','Scraped knees treated','walk',6,'#39c6a6'],
  ['Paramedic','Medic','Calm under pressure','Sprains splinted','walk',6,'#2a7fd6'],
  ['Bike Medic','Bike','Through traffic in seconds','Bike crashes aided','road1',4,'#e8ecff'],
  ['Ambulance','Rig','Sirens and stretchers','Patients transported','road2',4,'#ff4d6d'],
  ['Therapy Dog','Dog','Best bedside manner','Frightened kids comforted','walk',4,'#e0a860'],
  ['Flight Nurse','Nurse','Seconds count','Critical patients stabilized','walk',5,'#ff4d6d'],
  ['Trauma Team','Trauma','Golden hour, gold standard','Traumas treated','walk',4,'#39c6a6'],
  ['Rapid Response','Response','Defib in hand','Hearts restarted','walk',5,'#ff4d6d'],
  ['Medevac Helicopter','Medevac','A hospital in the sky','Airlifts completed','air',3,'#e8ecff'],
  ['Telemedicine Drone','Drone','AED delivery in 90 seconds','Defibs delivered','drone',3,'#2ee6c8'],
  ['Mobile Surgery Truck','Surgery','An operating room on wheels','Field surgeries done','road1',3,'#39c6a6'],
  ['Orbital Med Link','Orbital','Specialists on every screen','Remote diagnoses made','sat',2,'#ffc53d'],
  ['Disaster Response Bus','Bus','Triage for a thousand','Mass-casualty incidents handled','road2',3,'#f4f6ff'],
  ['Nano-Med Unit','Nano','Repairs at cell level','Cellular repairs made','walk',4,'#2ee6c8'],
  ['Cryo Response','Cryo','Pause. Repair. Resume.','Patients revived','road1',3,'#7ce8ff'],
  ['Time Clinic','Clinic','Treats yesterday\'s injuries','Timelines healed','walk',2,'#b57cff'],
 ]),
 milestone:['Comfort Shoes','Body Camera','Trauma Radio','Pro Med Bag','AI Triage','Smart Monitor','Neural Link','Quantum Core'],
 tapUp:['Quick Bandage','Trauma Shears','Auto-Splint','Defib Pro','Stim Injector','Smart Stretcher','Med Cannon','Nano Injector','Gene Patch','Life Beam'],
 gup:['Coffee Machine','Hospital Partnership','Paramedics Union','Telemetry Program','City Hall Grant','Federal Funding','Public Trust','Universal Care Act','World Health Treaty','Galactic Charter','Timeline Accord','Law of Life'],
 msg:[
  ['bandaged a scraped knee with great ceremony','took a pulse and only lost count once'],
  ['splinted a sprain right on the sidewalk','talked a nervous patient through an IV'],
  ['cut through gridlock to reach a fainting jogger','beat the ambulance to a cyclist by two minutes'],
  ['transported a patient in record time','delivered a baby on the way to the hospital'],
  ['Pip calmed a crying kid with one wag','Pip sat with a patient until the doctor arrived'],
  ['stabilized a patient at 3,000 feet','handled a code blue with one hand'],
  ['saved a life inside the golden hour','ran a whole trauma bay on the pavement'],
  ['restarted a heart with two paddles','shocked a marathon runner back to life'],
  ['airlifted a hiker off a mountain ridge','landed on a highway to save a driver'],
  ['delivered a defibrillator in 90 seconds','dropped an EpiPen onto a picnic blanket'],
  ['performed emergency surgery in a parking lot','operated on the road, no scalpel wasted'],
  ['connected a specialist from orbit','diagnosed a rare condition over a video call'],
  ['triaged forty patients in twenty minutes','set up a field clinic right after a storm'],
  ['repaired a fracture at the cell level','healed a paper cut so fast it never happened'],
  ['froze a critical patient until surgery was ready','paused a heart attack mid-attack'],
  ['treated a sprain from last Tuesday','patched a timeline where the patient never fell'],
 ],
 skins:[
  {id:'classic',n:'Classic Ambulance',price:0,body:'#f4f6ff',stripe:'#ff4d6d',roof:'#dfe6ff'},
  {id:'retro',n:'Green & White',price:120,body:'#e8f5ee',stripe:'#1fae6a',roof:'#c8e6d4'},
  {id:'neon',n:'Neon Pulse',price:200,body:'#0d2b2a',stripe:'#2ee6c8',roof:'#12494a'},
  {id:'stealth',n:'Night Medic',price:250,body:'#1f2733',stripe:'#3a4a63',roof:'#151c26'},
  {id:'gold',n:'Gold Lifeline',price:600,body:'#e8b93a',stripe:'#fff0b3',roof:'#ffd766'},
 ],
 agents:[
  {id:'e_hart',n:'Dr. Lena Hart',role:'Never lost a shift',price:120,m:1.25,desc:'All income x1.25',face:{skin:'#e0b48c',hair:'#6a3a1a',hat:'ems',hc:'#39c6a6',body:'#2ee6c8',gl:1}},
  {id:'e_cole',n:'Medic Jonah Cole',role:'Fastest hands in the county',price:350,m:1.5,desc:'All income x1.5',face:{skin:'#8a5a3c',hair:'#111',hat:'ems',hc:'#2a7fd6',body:'#2a7fd6'}},
  {id:'e_pip',n:'Pip, Therapy Legend',role:'Certified good boy',price:500,m:3,gen:4,desc:'Therapy Dogs earn x3',face:{hat:'dog'}},
  {id:'e_nadia',n:'Flight Nurse Nadia',role:'Calm at 3,000 feet',price:900,m:2,desc:'All income x2',face:{skin:'#c98b62',hair:'#0a0a12',hat:'ems',hc:'#ff4d6d',body:'#1c2a5a'}},
  {id:'e_vo',n:'Dr. Kim Vo',role:'Trauma surgeon',price:1600,m:5,gen:6,desc:'Trauma Teams earn x5',face:{skin:'#f0c9a0',hair:'#111',hat:'ems',hc:'#39c6a6',body:'#39c6a6',gl:1}},
  {id:'e_dir',n:'Director Alvarez',role:'Runs every hospital in town',price:4500,m:3,desc:'All income x3',face:{skin:'#d9a679',hair:'#c8c8d8',hat:'peak',gold:1,body:'#e8ecff'}},
 ],
 startBonus:100,
},
];
const worldById=id=>WORLDS.find(w=>w.id===id)||WORLDS[0];

/* Gear from lockers (shared by every world) */
const RAR=[{n:'Common',c:'#9fb0d8',b:.01},{n:'Rare',c:'#4da3ff',b:.03},{n:'Epic',c:'#c77dff',b:.06},{n:'Legendary',c:'#ffc53d',b:.12}];
const GEARS=[
 {id:'vest',n:'Field Vest',r:0,g:'shield'},{id:'flash',n:'Tac Flashlight',r:0,g:'bolt'},{id:'notes',n:'Field Notebook',r:0,g:'bag'},
 {id:'radio',n:'Shoulder Radio',r:0,g:'radio'},{id:'cone',n:'Flare Kit',r:0,g:'target'},{id:'whistle',n:'Silver Whistle',r:0,g:'bolt'},
 {id:'radar',n:'Thermal Scanner',r:1,g:'target'},{id:'lock',n:'Master Key Set',r:1,g:'key'},{id:'nv',n:'Night Vision',r:1,g:'eye'},
 {id:'bag',n:'Supply Bag',r:1,g:'bag'},{id:'cuffs',n:'Rescue Tool',r:1,g:'cuffs'},
 {id:'jam',n:'Signal Booster',r:2,g:'radio'},{id:'drone',n:'Recon Drone',r:2,g:'eye'},{id:'turbo',n:'Turbo Kit',r:2,g:'bolt'},
 {id:'baton',n:'Commander Badge',r:3,g:'star'},{id:'lamp',n:'Beacon Lamp',r:3,g:'eye'},
];
const CRATES={
 std:{price:30,cash:600,badge:[3,8],odds:[['cash',.55],['badge',.25],['g0',.15],['g1',.05]]},
 elite:{price:120,cash:3600,badge:[15,40],odds:[['cash',.25],['badge',.25],['g1',.30],['g2',.17],['g3',.03]]},
 legend:{price:300,cash:14400,badge:[60,150],odds:[['cash',.10],['badge',.20],['g1',.20],['g2',.35],['g3',.15]]},
};
const OPS=[
 {id:'stop',dur:30,k:8,badge:[0,0],crate:0,xp:4},
 {id:'watch',dur:180,k:45,badge:[0,1],crate:0.05,xp:8},
 {id:'sting',dur:900,k:225,badge:[1,3],crate:0.2,xp:14},
 {id:'raid',dur:3600,k:900,badge:[3,8],crate:0.6,xp:24},
 {id:'king',dur:14400,k:3600,badge:[10,25],crate:1,xp:40,elite:true},
];
const THEMES=[
 {id:'night',n:'Midnight Downtown',price:0},
 {id:'dusk',n:'Sunset Skyline',price:250},
 {id:'rain',n:'Neon Rain',price:350},
];
const PATRON=[[4.99,'Bronze Patron',.05],[19.99,'Silver Patron',.10],[49.99,'Gold Patron',.15],[99.99,'Platinum Patron',.25],[249.99,'Diamond Patron',.40]];
const PACKS=[
 {id:'p1',sku:'badges_80',n:'Pocketful',b:80,bonus:0,price:0.99},
 {id:'p2',sku:'badges_500',n:'Handful',b:500,bonus:50,price:4.99},
 {id:'p3',sku:'badges_1200',n:'Duffel Bag',b:1200,bonus:200,price:9.99},
 {id:'p4',sku:'badges_2600',n:'The Vault',b:2600,bonus:600,price:19.99,tag:'Popular'},
 {id:'p5',sku:'badges_7000',n:'Evidence Room',b:7000,bonus:2000,price:49.99},
 {id:'p6',sku:'badges_15000',n:'Federal Reserve',b:15000,bonus:5000,price:99.99,tag:'Best value'},
];
const DAILY=[
 {k:'cash',v:600},{k:'badge',v:10},{k:'crate',v:'std'},{k:'badge',v:20},{k:'cash',v:3600},{k:'crate',v:'elite'},{k:'jack'}
];
const PASS_N=30, PASS_XP=100;
const AUTO_RATE=8, AUTO_MULT=1.5;
const OFFLINE_X2=6, OFFLINE_X3=15;   /* Gold Badges to double / triple offline earnings */
function passReward(t,prem){
  if(!prem){
    if(t%10===0) return {k:'badge',v:40};
    if(t%5===0) return {k:'crate',v:'std'};
    if(t%2===0) return {k:'badge',v:5};
    return {k:'cash',v:300*t};
  }
  if(t===30) return {k:'crate',v:'legend',x:{k:'badge',v:250}};
  if(t===20) return {k:'theme',v:'rain'};
  if(t===10) return {k:'skin',v:'neon'};
  if(t%5===0) return {k:'crate',v:'elite'};
  return {k:'badge',v:10+t};
}

/* ====================== ACTIVE WORLD ====================== */
let W=WORLDS[0],GENS=W.gens,AGENTS=W.agents,UPS=[],ACH=[];
function buildUpgrades(){
  UPS=[];
  GENS.forEach((g,i)=>MILE_T.forEach((t,k)=>UPS.push({id:`g${i}_${k}`,kind:'gen',gen:i,cost:g.cost*Math.pow(W.g,t)*12,name:`${g.s}: ${W.milestone[k]}`,desc:`${g.n} pay x2`,glyph:MILE_G[k],ok:()=>S.owned[i]>=t})));
  TAP_C.forEach((c,k)=>UPS.push({id:`t${k}`,kind:'tap',cost:c,name:W.tapUp[k],desc:'Each tap earns x2',glyph:'cuffs',ok:()=>(k===0||S.ups[`t${k-1}`])&&S.run>=c*0.1}));
  ['Adrenaline','Energy Drinks','Hero Complex','Overdrive','Caffeine IV'].forEach((n,k)=>UPS.push({id:`p${k}`,kind:'pct',cost:PCT_C[k],name:n,desc:'Taps also earn +1% of your income/s',glyph:'bolt',ok:()=>(k===0||S.ups[`p${k-1}`])&&S.run>=PCT_C[k]*0.1}));
  W.gup.forEach((n,k)=>UPS.push({id:`u${k}`,kind:'glob',p:GUP_P[k],cost:GUP_C[k],name:n,desc:`All income +${Math.round(GUP_P[k]*100)}%`,glyph:['bag','bag','radio','cam','shield','star','star','star','eye','eye','key','key'][k],ok:()=>S.run>=GUP_C[k]*0.1}));
}
function buildAch(){
  ACH=[]; const p=W.id+':';
  [1e3,1e6,1e9,1e12,1e15,1e18,1e21,1e24].forEach(v=>ACH.push({id:p+'life'+v,n:`${money(v)} Club`,d:`Earn ${money(v)} in total`,t:()=>S.life>=v,r:5+Math.round(Math.log10(v))}));
  [100,1000,10000,50000].forEach(v=>ACH.push({id:p+'tap'+v,n:`${fmt(v)} Taps`,d:`Make ${fmt(v)} taps by hand`,t:()=>S.taps>=v,r:3+Math.round(Math.log10(v))}));
  GENS.forEach((g,i)=>{
    ACH.push({id:p+'own1_'+i,n:`First ${g.s}`,d:`Get your first ${g.n}`,t:()=>S.owned[i]>=1,r:1+Math.floor(i/3)});
    ACH.push({id:p+'own25_'+i,n:`${g.s} Force`,d:`Have 25 ${g.n}s`,t:()=>S.owned[i]>=25,r:3+Math.floor(i/2)});
  });
  [1,10,50].forEach(v=>ACH.push({id:p+'bty'+v,n:`${W.L.bounty} x${v}`,d:`Catch ${v} bounty target${v>1?'s':''}`,t:()=>S.bounties>=v,r:2+Math.round(Math.log10(v)*3)}));
  [1,10,50].forEach(v=>ACH.push({id:p+'ops'+v,n:`Case Closed x${v}`,d:`Complete ${v} timed job${v>1?'s':''}`,t:()=>S.opsDone>=v,r:2+Math.round(Math.log10(v)*3)}));
  [1,3,6,11].forEach(v=>ACH.push({id:p+'rank'+v,n:`Rank ${v+1}: ${W.ranks[v]}`,d:`Reach the rank of ${W.ranks[v]}`,t:()=>S.promos>=v,r:8+v*4}));
  [1,10,50].forEach(v=>ACH.push({id:p+'lock'+v,n:`Crate Opener x${v}`,d:`Open ${v} crate${v>1?'s':''}`,t:()=>S.opened>=v,r:2+Math.round(Math.log10(v)*4)}));
}
function setWorld(id){
  W=worldById(id); GENS=W.gens; AGENTS=W.agents;
  buildUpgrades(); buildAch();
  document.documentElement.dataset.world=W.id;
}
const crateName=k=>W.crates[k];
const opName=id=>W.ops[OPS.findIndex(o=>o.id===id)];

/* ====================== STATE ====================== */
const KEY='night-precinct-v2', WIPE_KEY='night-precinct-wiped';
const WKEYS=['funds','run','life','medals','promos','owned','ups','crimes','ops','taps','bounties','opsDone','skin'];
function freshWorld(id){
  const w=worldById(id);
  return {funds:0,run:0,life:0,medals:0,promos:0,owned:Array(NT).fill(0),ups:{},crimes:Array(NT).fill(0),ops:[null,null,null,null,null],taps:0,bounties:0,opsDone:0,skin:'classic'};
}
function fresh(){
  const now=Date.now();
  return Object.assign({
    v:3,t0:now,last:now,world:'police',ws:{},done:{},
    badges:60,opened:0,pity:0,crates:{std:1,elite:0,legend:0},gear:{},agents:{},
    perm:{off:0,slots:0,auto:0},autoOn:true,boosts:{dbl:0,spree:0},vip:0,vipDay:'',
    pass:{xp:0,premium:false,f:{},p:{}},piggy:0,spent:0,packs:{},starter:false,
    daily:{last:'',streak:0},ach:{},skins:{'police:classic':1},theme:'night',themes:{night:1},
    sound:true,haptics:true,calm:false,calmSet:false,txs:[],
    pending:null,rallyAt:0,supplyAt:0,amt:1,sessions:0,deals:{},
  },freshWorld('police'));
}
const MAPS=new Set(['ups','gear','agents','packs','ach','skins','themes','deals','f','p','ws','done']);
function merge(d,o){
  for(const k in o){
    if(!(k in d)) continue;
    const dv=d[k],ov=o[k];
    if(k==='txs'){ if(Array.isArray(ov)) d[k]=ov.filter(x=>typeof x==='string').slice(-300); continue; }
    if(MAPS.has(k)&&ov&&typeof ov==='object'){ Object.assign(dv,ov); continue; }
    if(k==='amt'&&(ov==='max'||typeof ov==='number')){ d[k]=ov; continue; }
    if(dv&&typeof dv==='object'&&!Array.isArray(dv)&&ov&&typeof ov==='object'&&!Array.isArray(ov)) merge(dv,ov);
    else if(Array.isArray(dv)){ if(Array.isArray(ov)) ov.forEach((x,i)=>{ if(i<dv.length) dv[i]=x; }); }
    else if(typeof dv===typeof ov) d[k]=ov;
  }
}
let S=(function(){
  const d=fresh();
  try{
    let stored=null; try{ stored=localStorage.getItem(KEY); }catch(e){}
    /* The iOS app also keeps a copy in a file. Use whichever copy is newer. */
    const mirror=(BOOT&&typeof BOOT.save==='string'&&BOOT.save)?BOOT.save:null;
    const stamp=t=>{ try{ const x=JSON.parse(t); return (x&&isFinite(x.last))?x.last:0; }catch(e){ return -1; } };
    /* After "Erase save" a stale copy of the old save may still be handed to the page by the app; anything last played before the erase is ignored. */
    let wiped=0; try{ wiped=+localStorage.getItem(WIPE_KEY)||0; }catch(e){}
    let raw=stored;
    if(mirror&&stamp(mirror)>wiped&&(!stored||stamp(mirror)>stamp(stored))) raw=mirror;
    if(raw){ const o=JSON.parse(raw); if(o&&typeof o==='object') merge(d,o); }
  }catch(e){}
  ['funds','run','life','badges','medals','piggy','spent'].forEach(k=>{ if(!isFinite(d[k])||d[k]<0) d[k]=0; });
  ['owned','crimes'].forEach(k=>d[k]=d[k].map(x=>isFinite(x)&&x>0?x:0));
  if(!WORLDS.some(w=>w.id===d.world)) d.world='police';
  d.skins['police:classic']=1;
  const okOps=a=>a.map(o=>o&&OPS.some(x=>x.id===o.id)&&isFinite(o.end)?o:null);
  const fixArr=(st,k)=>{ if(!Array.isArray(st[k])) st[k]=Array(NT).fill(0); st[k]=st[k].slice(0,NT).map(x=>isFinite(x)&&x>0?x:0); while(st[k].length<NT) st[k].push(0); };
  const fixWorld=st=>{ fixArr(st,'owned'); fixArr(st,'crimes'); if(Array.isArray(st.ops)) st.ops=okOps(st.ops); ['funds','run','life','medals','taps','bounties','opsDone'].forEach(k=>{ if(k in st&&(!isFinite(st[k])||st[k]<0)) st[k]=0; }); if(typeof st.promos!=='number'||!(st.promos>=0)) st.promos=0; st.promos=Math.min(11,Math.floor(st.promos)); if(!st.ups||typeof st.ups!=='object') st.ups={}; };
  fixWorld(d);
  const wd=worldById(d.world); if(!wd.skins.some(s=>s.id===d.skin)) d.skin='classic';
  Object.keys(d.ws).forEach(id=>{ if(!WORLDS.some(w=>w.id===id)||id===d.world||!d.ws[id]||typeof d.ws[id]!=='object') delete d.ws[id]; else fixWorld(d.ws[id]); });
  ['dbl','spree'].forEach(k=>{ if(!isFinite(d.boosts[k])) d.boosts[k]=0; });
  ['vip','rallyAt','supplyAt','t0','last'].forEach(k=>{ if(!isFinite(d[k])||d[k]<0) d[k]=(k==='t0'||k==='last')?Date.now():0; });
  if(d.last>Date.now()) d.last=Date.now();
  if(![0,1,2].includes(d.perm.auto)) d.perm.auto=d.perm.auto?1:0;
  d.perm.off=clamp(Math.floor(d.perm.off)||0,0,3); d.perm.slots=clamp(Math.floor(d.perm.slots)||0,0,2);
  if(!(d.amt==='max'||[1,10,100].includes(d.amt))) d.amt=1;
  if(!d.calmSet){ d.calmSet=true; if(APP.reduceMotion) d.calm=true; }
  return d;
})();
setWorld(S.world);
let wiping=false;
function save(){
  if(wiping) return;
  let j; try{ j=JSON.stringify(S); }catch(e){ return; }
  try{ localStorage.setItem(KEY,j); }catch(e){}
  Native.save(j);
}
function wipe(){
  wiping=true;
  try{ localStorage.removeItem(KEY); localStorage.setItem(WIPE_KEY,String(Date.now())); }catch(e){}
  Native.wipe().then(()=>{ S=fresh(); location.reload(); });
}
const worldUnlocked=id=>{ const i=WORLDS.findIndex(w=>w.id===id); return i<=0||!!S.done[WORLDS[i-1].id]; };
const skinOwned=id=>id==='classic'||!!S.skins[W.id+':'+id];

/* ====================== DERIVED ====================== */
const D={ips:0,gm:1,gen:Array(NT).fill(0),unit:Array(NT).fill(0),tap:1,crimeRate:0,vip:false,auto:0};
const now=()=>Date.now();
const gearBonus=()=>GEARS.reduce((a,g)=>a+(S.gear[g.id]||0)*RAR[g.r].b,0);
function patronTier(){ let t=-1; PATRON.forEach((p,i)=>{ if(S.spent>=p[0]-0.001) t=i; }); return t; }
const patronBonus=()=>{ const t=patronTier(); return t<0?0:PATRON[t][2]; };
const achCount=()=>Object.keys(S.ach).length;
const legacyBonus=()=>0.5*Object.keys(S.done).length;
function recalc(){
  const t=now();
  D.vip=S.vip>t;
  let gm=1;
  UPS.forEach(u=>{ if(u.kind==='glob'&&S.ups[u.id]) gm*=1+u.p; });
  gm*=1+MEDAL.bonus*S.medals;
  gm*=1+0.01*achCount();
  gm*=1+gearBonus();
  AGENTS.forEach(a=>{ if(S.agents[a.id]&&a.gen===undefined) gm*=a.m; });
  gm*=1+patronBonus();
  gm*=1+legacyBonus();
  if(D.vip) gm*=1.5;
  if(S.boosts.dbl>t) gm*=2;
  if(S.boosts.spree>t) gm*=7;
  gm*=W.pay;
  D.gm=gm;
  let ips=0,rate=0;
  GENS.forEach((g,i)=>{
    let m=1;
    for(let k=0;k<MILE_T.length;k++) if(S.ups[`g${i}_${k}`]) m*=2;
    AGENTS.forEach(a=>{ if(S.agents[a.id]&&a.gen===i) m*=a.m; });
    D.unit[i]=g.inc*m*gm; D.gen[i]=S.owned[i]*D.unit[i];
    ips+=D.gen[i]; rate+=S.owned[i]*m*gm/10;
  });
  D.ips=ips; D.crimeRate=rate;
  let tb=1; TAP_C.forEach((_,k)=>{ if(S.ups[`t${k}`]) tb*=2; });
  let pct=0.01; PCT_C.forEach((_,k)=>{ if(S.ups[`p${k}`]) pct+=0.01; });
  D.tap=tb*gm+ips*pct;
}
const MEDAL={div:2e7,pow:0.4,bonus:0.03};
const medalsFor=l=>Math.floor(Math.pow(l/MEDAL.div,MEDAL.pow));
const medalGain=()=>Math.max(0,medalsFor(S.life)-S.medals);
const isTop=()=>S.promos>=W.ranks.length-1;
const rankName=()=>W.ranks[Math.min(S.promos,W.ranks.length-1)];
const promoReq=()=>W.req.table[Math.min(isTop()?W.ranks.length-3:S.promos,W.req.table.length-1)];
const canPromote=()=>S.run>=promoReq()&&medalGain()>=1;
const cashFor=sec=>Math.max(D.ips,1)*sec;
const boostOn=k=>S.boosts[k]>now();
const passLevel=()=>Math.min(PASS_N,Math.floor(S.pass.xp/PASS_XP));
const opSlots=()=>2+(D.vip?1:0)+S.perm.slots;
const offlineCap=()=>Math.max([2,4,8,24][S.perm.off]||2,D.vip?8:0)*3600;

function checkAch(){
  let got=0,badges=0,first='';
  ACH.forEach(a=>{ if(!S.ach[a.id]&&a.t()){ S.ach[a.id]=1; S.badges+=a.r; badges+=a.r; if(!got) first=a.n; got++; } });
  if(got){ toast(`Service Record: ${first}${got>1?` and ${got-1} more`:''}  +${badges} Badges`,'gold'); recalc(); sfx('level'); dirty('career'); }
}

/* ====================== ACTIONS ====================== */
function addFunds(n){ S.funds+=n; S.run+=n; S.life+=n; }
const unitCost=(i,n=1)=>{ const r=W.g,o=S.owned[i]; return GENS[i].cost*Math.pow(r,o)*(Math.pow(r,n)-1)/(r-1); };
function maxAfford(i){
  const r=W.g,base=GENS[i].cost*Math.pow(r,S.owned[i]);
  return Math.max(0,Math.floor(Math.log(S.funds*(r-1)/base+1)/Math.log(r)+1e-9));
}
function buyCount(i){ const a=S.amt; if(a==='max'||a===0) return Math.max(1,maxAfford(i)); return a; }
function buyGen(i,free){
  const n=buyCount(i),c=unitCost(i,n);
  if(!free&&S.funds<c){ sfx('no'); return false; }
  if(!free) S.funds-=c;
  S.owned[i]+=n; recalc(); sfx('buy'); dirty('upgrades');
  return true;
}
function buyUp(id){
  const u=UPS.find(x=>x.id===id); if(!u||S.ups[id]||S.funds<u.cost){ sfx('no'); return; }
  S.funds-=u.cost; S.ups[id]=1; recalc(); sfx('buy'); toast(`${u.name} installed`,'good'); dirty('upgrades');
}
const combo={n:0,t:0};
function comboMult(){ if(performance.now()-combo.t>1400) combo.n=0; return 1+Math.min(combo.n,50)*0.04; }
function doTap(x){
  const tn=performance.now();
  if(tn-combo.t>1400) combo.n=0;
  combo.n++; combo.t=tn;
  const v=D.tap*(1+Math.min(combo.n,50)*0.04);
  addFunds(v); S.taps++;
  if(S.taps%10===0) addXP(1);
  Scene.tap(x,v); sfx('tap');
}
let autoAcc=0,autoVis=0;
function autoTick(dt){
  const lvl=S.perm.auto; if(!lvl||!S.autoOn) return;
  autoAcc+=dt*AUTO_RATE; const n=Math.floor(autoAcc); autoAcc-=n;
  if(lvl>=2){ for(let k=0;k<n;k++){ combo.n++; combo.t=performance.now(); addFunds(D.tap*(1+Math.min(combo.n,50)*0.04)); } }
  else if(n>0) addFunds(D.tap*AUTO_MULT*n);
  autoVis+=dt;
  if(autoVis>=.3){ autoVis=0; Scene.tap(rnd(30,330),D.tap*(lvl>=2?comboMult():AUTO_MULT)*AUTO_RATE*.3,true); }
}
function addXP(n){
  const before=passLevel();
  S.pass.xp=Math.min(PASS_N*PASS_XP,S.pass.xp+n);
  if(passLevel()>before){ toast(`Career Pass tier ${passLevel()} reached`,'gold'); sfx('level'); dirty('career'); }
}
const skinById=id=>W.skins.find(s=>s.id===id);
function grant(r){
  switch(r.k){
    case 'badge': S.badges+=r.v; return {t:`+${r.v} Gold Badges`,g:'badge'};
    case 'cash': { const a=cashFor(r.v); addFunds(a); return {t:`+${money(a)}`,g:'bag'}; }
    case 'crate': S.crates[r.v]=(S.crates[r.v]||0)+(r.n||1); if(r.x) grant(r.x); return {t:`${crateName(r.v)}${r.x?` and ${r.x.v} Badges`:''}`,g:'crate'};
    case 'skin': S.skins[W.id+':'+r.v]=1; return {t:`${skinById(r.v).n}`,g:'cam'};
    case 'theme': S.themes[r.v]=1; return {t:`${THEMES.find(s=>s.id===r.v).n} skyline`,g:'eye'};
  }
  return {t:'',g:'star'};
}
function rewardLabel(r){
  switch(r.k){
    case 'badge': return `${r.v} Badges`;
    case 'cash': return dur(r.v)+' of pay';
    case 'crate': return crateName(r.v);
    case 'skin': return skinById(r.v).n;
    case 'theme': return THEMES.find(s=>s.id===r.v).n;
  }
  return '';
}
const rewardGlyph=r=>({badge:'badge',cash:'bag',crate:'crate',skin:'cam',theme:'eye'}[r.k]||'star');

/* Crates */
function rollGear(rar){
  const pool=GEARS.filter(g=>g.r===rar);
  const g=pick(pool); const lv=S.gear[g.id]||0;
  if(lv>=10){ S.badges+=3; return {kind:'dupe',g,t:`${g.n} is maxed. +3 Badges`}; }
  S.gear[g.id]=lv+1; return {kind:'gear',g,lv:lv+1,t:`${g.n} ${lv?`Lv ${lv+1}`:'NEW'}`};
}
function openCrate(type){
  if(!S.crates[type]) return null;
  S.crates[type]--; S.opened++;
  const c=CRATES[type]; let roll=Math.random(),pick_='cash',acc=0;
  for(const [k,p] of c.odds){ acc+=p; if(roll<acc){ pick_=k; break; } }
  if(type!=='std'){
    S.pity++;
    if(S.pity>=10){ pick_=pick_[0]==='g'&&+pick_[1]>=2?pick_:'g2'; }
    if(pick_[0]==='g'&&+pick_[1]>=2) S.pity=0;
  }
  let res;
  if(pick_==='cash'){ const a=cashFor(c.cash)*rnd(0.8,1.4); addFunds(a); res={kind:'cash',t:`+${money(a)}`,g:'bag'}; }
  else if(pick_==='badge'){ const n=rint(c.badge[0],c.badge[1]); S.badges+=n; res={kind:'badge',t:`+${n} Gold Badges`,g:'badge'}; }
  else res=rollGear(+pick_[1]);
  recalc(); checkAch(); dirty('ops'); dirty('shop');
  return res;
}

/* Timed jobs */
function startOp(id){
  const slots=opSlots(); let i=-1;
  for(let k=0;k<slots;k++) if(!S.ops[k]){ i=k; break; }
  if(i<0){ toast(`All ${W.L.squad.toLowerCase()}s are out`,'bad'); sfx('no'); return; }
  const o=OPS.find(x=>x.id===id);
  S.ops[i]={id,end:now()+o.dur*1000}; sfx('buy'); dirty('ops');
}
const opLeft=i=>S.ops[i]?Math.max(0,(S.ops[i].end-now())/1000):0;
function claimOp(i){
  const s=S.ops[i]; if(!s||opLeft(i)>0) return;
  const o=OPS.find(x=>x.id===s.id);
  const cash=cashFor(o.k)*(W.opMul||1); addFunds(cash);
  const b=rint(o.badge[0],o.badge[1]); S.badges+=b;
  let extra='';
  if(Math.random()<o.crate){ const type=o.elite&&Math.random()<.5?'elite':'std'; S.crates[type]++; extra=` + ${crateName(type)}`; }
  S.ops[i]=null; S.opsDone++; addXP(o.xp); addPiggy(3);
  toast(`${opName(o.id)} complete: ${money(cash)}${b?` + ${b} Badges`:''}${extra}`,'good'); sfx('coin');
  checkAch(); dirty('ops');
}
const speedCost=i=>Math.max(1,Math.ceil(opLeft(i)/300));
function speedOp(i){
  if(!S.ops[i]) return;
  const c=speedCost(i); if(S.badges<c){ sfx('no'); toast('Not enough Gold Badges','bad'); openShopHint(); return; }
  S.badges-=c; S.ops[i].end=now(); claimOp(i);
}
function addPiggy(n){ S.piggy=Math.min(500,S.piggy+n); }
/* The Evidence Safe always holds at least 20 Gold Badges, so it can be bought at any time. */
const piggyBadges=()=>Math.max(20,Math.floor(S.piggy));
function addBoost(k,sec,cap){
  const t=now(); const base=Math.max(S.boosts[k],t);
  S.boosts[k]=Math.min(base+sec*1000,cap?t+cap*1000:Infinity);
  recalc();
}
/* Free rewards. This game has no ads: these are simple cooldown claims. */
const RALLY_CD=3*36e5, RALLY_SEC=900, SUPPLY_CD=6*36e5;
const rallyReady=()=>now()>=S.rallyAt+RALLY_CD;
const supplyReady=()=>now()>=S.supplyAt+SUPPLY_CD;
function claimRally(){
  if(!rallyReady()){ sfx('no'); toast('Rally Boost is still recharging'); return false; }
  S.rallyAt=now(); addBoost('dbl',RALLY_SEC); sfx('level'); Native.haptic('success'); toast('Rally Boost: double income for 15 minutes','gold'); dirty('hq'); return true;
}
function claimSupply(){
  if(!supplyReady()){ sfx('no'); toast('The next Supply Drop is still on its way'); return false; }
  S.supplyAt=now(); S.crates.std++; sfx('coin'); toast(crateName('std')+' delivered','gold'); dirty('ops'); dirty('hq'); return true;
}
const spend=n=>{ if(S.badges<n){ sfx('no'); toast('Not enough Gold Badges','bad'); openShopHint(); return false; } S.badges-=n; return true; };

/* Bounty targets */
function bountyReward(){
  const r=Math.random();
  if(r<0.55){ const a=Math.max(cashFor(45),D.tap*20); addFunds(a); return `${W.L.bountyOk}: ${money(a)}`; }
  if(r<0.65){ addBoost('spree',20); return `${W.L.spree}! Income x7 for 20s`; }
  if(r<0.90){ const n=rint(2,6); S.badges+=n; return `Reward posted: +${n} Gold Badges`; }
  if(r<0.96){ S.crates.std++; dirty('ops'); return `${crateName('std')} recovered`; }
  const a=Math.max(cashFor(300),D.tap*150); addFunds(a); return `${W.L.jackpot}: ${money(a)}`;
}
function catchFugitive(){
  S.bounties++; addXP(3); addPiggy(1);
  const msg=bountyReward(); toast(msg,'gold'); sfx('siren'); Native.haptic('light'); checkAch(); recalc(); dirty('shop');
}

/* Promotion, world clear, travel */
function promote(){
  if(!canPromote()) return null;
  const g=medalGain(),wasTop=isTop();
  S.medals+=g; if(!wasTop) S.promos++;
  S.funds=0; S.run=0; S.owned=Array(NT).fill(0); S.ups={}; S.ops=[null,null,null,null,null];
  S.owned[0]=Math.min(50,S.promos*5); S.badges+=25;
  const cleared=!wasTop&&isTop();
  if(cleared) S.done[W.id]=true;
  recalc(); checkAch(); save(); sfx('level'); Native.haptic('success');
  toast(cleared?`${W.ranks[W.ranks.length-1]}! ${W.name} cleared`:`Promoted to ${rankName()}! +${g} Medals`,'gold');
  dirty('roster'); dirty('upgrades'); dirty('ops'); dirty('career');
  return {gain:g,cleared};
}
function travel(id){
  if(id===S.world||!worldUnlocked(id)) return false;
  const first=!S.ws[id];
  S.ws[S.world]={}; WKEYS.forEach(k=>{ S.ws[S.world][k]=S[k]; });
  const target=Object.assign(freshWorld(id),S.ws[id]||{});
  ['owned','crimes'].forEach(k=>{ while(target[k].length<NT) target[k].push(0); });
  delete S.ws[id];
  WKEYS.forEach(k=>{ S[k]=target[k]; });
  S.world=id; setWorld(id);
  if(first){ S.owned[0]=10; S.badges+=worldById(id).startBonus; }
  combo.n=0; autoAcc=0;
  recalc(); save(); sfx('level');
  return {first};
}

/* Offline */
function offlineFor(sec){
  const cap=offlineCap(); const eff=D.vip?1:0.5;
  const s=Math.min(sec,cap);
  return {amount:D.ips*s*eff,secs:s,capped:sec>cap};
}

/* Daily */
function dailyState(){
  const today=dayKey();
  if(S.daily.last===today) return {claimed:true,day:(S.daily.streak-1+7)%7,broken:false};
  const cont=S.daily.last===yesterdayKey();
  if(cont||!S.daily.last) return {claimed:false,day:S.daily.streak%7,broken:false};
  return {claimed:false,day:0,broken:S.daily.streak>0,lost:S.daily.streak};
}
function claimDaily(){
  const st=dailyState(); if(st.claimed) return null;
  const idx=st.broken?0:st.day;
  if(st.broken) S.daily.streak=0;
  const d=DAILY[idx]; let out;
  if(d.k==='jack'){ grant({k:'badge',v:60}); grant({k:'crate',v:'elite'}); grant({k:'cash',v:7200}); out=`60 Badges, ${crateName('elite')}, 2h of pay`; }
  else out=grant(d).t;
  S.daily.streak++; S.daily.last=dayKey(); addXP(10); dirty('career');
  return out;
}
function restoreStreak(){
  if(!spend(15)) return false;
  S.daily.last=yesterdayKey(); dirty('career'); return true;
}
