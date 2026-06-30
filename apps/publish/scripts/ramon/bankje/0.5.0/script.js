export default {
  id: "ramon/bank/0.5.0",
  name: "bankje",
  author: "ramon",
  description: "Bankje",
  tags: [],
  created: "2026-04-07T09:18:17.489111",
  updated: "2026-04-07T09:53:27.079420",
  code: `// Archiyou 0.6.5

//// MATERIAL SETTINGS ////

PLANK_BREEDTE = $PLANK_BREEDTE;
PLANK_DIKTE = $PLANK_DIKTE;
PLANK_LENGTE = 100;

//// PARAMS ////

AANTAL_ZITTING_PLANKEN = 4;

SEAT_DEPTH = 495;
ZITTING_HOOGTE = 460; // from ground to top seat
ZITTING_LENGTE = $ZITTING_LENGTE;
ZITTING_OVERSTEK = $TERUGLIGGENDE_POTEN;
ZITTING_VOEG = 10; 
ZITTING_DIEPTE = AANTAL_ZITTING_PLANKEN*PLANK_BREEDTE+((AANTAL_ZITTING_PLANKEN-1)*ZITTING_VOEG);


//// POTEN ////

layer('poten').color('blue');

legFrontLeft = boxbetween([0,0,0],[PLANK_BREEDTE, PLANK_DIKTE,ZITTING_HOOGTE-PLANK_DIKTE ])
                                .move(0,ZITTING_OVERSTEK,0)
                               .name('leg front left')      

legFrontRight = legFrontLeft.moved(ZITTING_DIEPTE-PLANK_BREEDTE,0,0)     
                        .name('leg front right');
                        


                  
legFrontDwars = boxbetween([0,0,0],[ZITTING_DIEPTE-(2*PLANK_DIKTE), PLANK_DIKTE,PLANK_BREEDTE ])
                .move(PLANK_DIKTE,PLANK_DIKTE+ZITTING_OVERSTEK,ZITTING_HOOGTE-PLANK_DIKTE-PLANK_BREEDTE)
                .name('leg front dwars')      

legBackRight = legFrontRight.moved(0,ZITTING_LENGTE-2*ZITTING_OVERSTEK,0).name('leg back right');

legBackLeft = legFrontLeft.moved(0,ZITTING_LENGTE-2*ZITTING_OVERSTEK,0).name('leg back left');

legBackDwars = legFrontDwars.moved(0,ZITTING_LENGTE-2*ZITTING_OVERSTEK-2*PLANK_DIKTE,0).name('leg back dwars');

POOT_CONSTRUCTIE1 = collection((legFrontLeft),(legFrontRight),(legFrontDwars)).name('poot constructie 1');

POOT_CONSTRUCTIE2 = collection((legBackLeft),(legBackRight),(legBackDwars)).name('poot constructie 2');

//// ZITTING ////

layer('zitting').color('green');

ZitPlank = boxbetween([0,0,0],[PLANK_BREEDTE, ZITTING_LENGTE,PLANK_DIKTE ])
                .move(0,0,ZITTING_HOOGTE-PLANK_DIKTE)
                               .name('zit plank')    

zittingPlanken = ZitPlank.array([AANTAL_ZITTING_PLANKEN,1],[PLANK_BREEDTE+ZITTING_VOEG,0])
.color('green');

langsPlank1 =  boxbetween([0,0,0],[PLANK_DIKTE, ZITTING_LENGTE,PLANK_BREEDTE ])
                                .move(0,0,ZITTING_HOOGTE-PLANK_BREEDTE-PLANK_DIKTE)
                               .name('langs plank 1')   

langsPlank2 = langsPlank1.moved(AANTAL_ZITTING_PLANKEN*PLANK_BREEDTE+(AANTAL_ZITTING_PLANKEN-1)*ZITTING_VOEG-PLANK_DIKTE,0,0)
                .name('langs plank 2');

legFrontRight.subtract(langsPlank2);

legFrontLeft.subtract(langsPlank1);

legBackRight.subtract(langsPlank2);

legBackLeft.subtract(langsPlank1);

//// ORGANIZE FOR PART LIST ////

Zitting = group(
        langsPlank1.name('langs plank 1'),
        langsPlank2.name('langs plank 2'),
        zittingPlanken.name('zitplank').forEach(s => s.name('seat zitplank'))
        ).name('Zitting')

Poten = group(legBackLeft, legBackRight, legFrontLeft, legFrontRight,legBackDwars,legFrontDwars)
        .name('poten')

bankje = group(Zitting, Poten)


//// METRICS ////

WOOD_DENSITY_KG_PER_M3 = 320;
WOOD_Vuren_COST_EUR_PER_M3 = 2500; // consumer pricing for small timber
WOOD_Grenen_COST_EUR_PER_M3 = 3500; // consumer pricing for small timber
volumeM3 = bankje.volume()*1e-9;
calc.metric('weight', Math.round(volumeM3*WOOD_DENSITY_KG_PER_M3) , { icon: 'weight-kilogram', unit: 'kg'});
calc.metric('Vuren cost (EST) ', Math.round(volumeM3*WOOD_Vuren_COST_EUR_PER_M3), { icon: 'euro', unit: 'EUR'} )
calc.metric('Grenen cost (EST) ', Math.round(volumeM3*WOOD_Grenen_COST_EUR_PER_M3), { icon: 'euro', unit: 'EUR'} )
//// ZAAGLIJST ////



make.partList(bankje, 'Zaaglijst'); // Automatic part table generation
// TODO: add sum to partList
/*
calc.table('parts').addRow({ length: '---- +' })
calc.table('parts').addRow({ subpart: 'TOTAL', section: \`\${PLANK_BREEDTE}x\${PLANK_DIKTE}\`});

*/

//// DOC PIPELINE ////

function docPipeline()
{
        iso = bankje.iso().move(2000)

        elevationCollection = collection(
                        legFrontLeft,
                        legBackLeft,
                        legBackDwars,
                        legFrontDwars,
                        legBackRight,
                        legBackLeft,
                        langsPlank1,
                        langsPlank2,
                        zittingPlanken
                        )

        elevation = elevationCollection.flattened('x')
                        .moveY(1000)
                        .rotateY(90)
                        .rotateZ(90)
                        .moveTo(0,0,0)
                        .move(4000)

        /*
        // Elevation dimensions
        elevation['leg back left'].select('E<<Y').dim();

        elevation['leg front left'].select('E>>X').dim({ offset: 80 });
        elevation['poot constructie 1']
                .select('V<<Y')
                .lineTo(elevation['leg back left'])
                .dim({ offsetVec:[0,-1,0], offset: 50 })
                .link(elevation); // linking dimension to ShapeCollection

        */

        // EXAMPLE getting the right shape in flattened collection:
        // TODO: link preflattened legBackLeft with Shape in collection and then get it 
        // with something like elevation['base back'] (or elevation.query('base back'))
        elevation.at(1).select('E<<Y').dim(); 
        elevation.at(1).select('E<<X').dim();
        
        /*
        line(elevation['base back']
                .select('E>>Y') 
                .select('V>>X'),
                        elevation['leg back left']
                        .select('E>>Y').select('V<<X'))  
                        .dim( { offsetVec: [-1,0,0], offset: 50 })
                        .link(elevation);
        line(elevation['base front']
                .select('E>>Y') 
                .select('V<<X'),
                        elevation['leg front left']
                        .select('E>>Y').select('V>>X'))  
                        .dim( { offsetVec: [-1,0,0], offset: 50 })
                        .link(elevation);

        elevationFront = chair.elevation('front').move(5000);
        elevationFront.bbox().left().dim().link(elevationFront);
        elevationFront.bbox().front().dim().link(elevationFront);

        elevationTop = chair.elevation('top').move(6000);
        elevationTop.bbox().left().dim().link(elevationTop);
        elevationTop.bbox().front().dim().link(elevationTop);
        */

        // Example of automdim. It works with cutting "levels"
        elevation.autoDim({ levels: [
                { axis: 'x', at: 0.2 }, // vertical at x=0.2 = 20%
                { axis: 'y', at: 0.8 }
                ] });

}

// DEBUG
// docPipeline();


plan = doc
    .create('plan')
    .page('plan')
    .pipeline(docPipeline)
    .text('RAMONS BANKJE')
    .view('iso')
    .shapes('iso')
    .width(0.5)
    .height(0.5)
    .pivot(0,0)
    .position(0,0)
    .view('elevation').shapes('elevation').width(0.5).height(0.5).pivot(1,1).position(0.8,0.8)
`,
  params: {
    PLANK_BREEDTE: {
      name: "PLANK_BREEDTE",
      id: "3d82917d-c3a7-4aa4-8191-e08b2d8a4ae4",
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Plank Breedte",
      default: 90,
      _value: undefined,
      min: 60,
      max: 120,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "mm",
      order: 0,
      iterable: true,
      description: null
    },
    PLANK_DIKTE: {
      name: "PLANK_DIKTE",
      id: "c336a8d3-2dbe-4967-8f0e-e44316ef923a",
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Plank Dikte",
      default: 21,
      _value: undefined,
      min: 18,
      max: 32,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "mm",
      order: 0,
      iterable: true,
      description: null
    },
    ZITTING_LENGTE: {
      name: "ZITTING_LENGTE",
      id: "0a6ee4a0-48c9-4df7-978c-555a8e5552c2",
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Zitting Lengte",
      default: 1000,
      _value: undefined,
      min: 400,
      max: 2200,
      step: 10,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "mm",
      order: 0,
      iterable: true,
      description: null
    },
    TERUGLIGGENDE_POTEN: {
      name: "TERUGLIGGENDE_POTEN",
      id: "c3b579d2-bf77-407b-b3e2-73043ebed3b9",
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Terugliggende Poten",
      default: 100,
      _value: undefined,
      min: 0,
      max: 200,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "mm",
      order: 0,
      iterable: true,
      description: null
    }
  },
  presets: {},
  published: {
    url: "/ramon/bank:0.5.0",
    version: "0.5.0",
    title: "BankjeDoc",
    public: true,
    published: "2026-04-07T09:18:17.489111",
    description: "Stukje documentatie erbij",
    params: {
      PLANK_BREEDTE: {
        MAX_TEXT_LENGTH: 255,
        name: "PLANK_BREEDTE",
        id: "3d82917d-c3a7-4aa4-8191-e08b2d8a4ae4",
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Plank Breedte",
        default: 90,
        min: 60,
        max: 120,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "mm",
        order: 0,
        iterable: true,
        description: null
      },
      PLANK_DIKTE: {
        MAX_TEXT_LENGTH: 255,
        name: "PLANK_DIKTE",
        id: "c336a8d3-2dbe-4967-8f0e-e44316ef923a",
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Plank Dikte",
        default: 21,
        min: 18,
        max: 32,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "mm",
        order: 0,
        iterable: true,
        description: null
      },
      ZITTING_LENGTE: {
        MAX_TEXT_LENGTH: 255,
        name: "ZITTING_LENGTE",
        id: "0a6ee4a0-48c9-4df7-978c-555a8e5552c2",
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Zitting Lengte",
        default: 1000,
        min: 400,
        max: 2200,
        step: 10,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "mm",
        order: 0,
        iterable: true,
        description: null
      },
      TERUGLIGGENDE_POTEN: {
        MAX_TEXT_LENGTH: 255,
        name: "TERUGLIGGENDE_POTEN",
        id: "c3b579d2-bf77-407b-b3e2-73043ebed3b9",
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Terugliggende Poten",
        default: 100,
        min: 0,
        max: 200,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "mm",
        order: 0,
        iterable: true,
        description: null
      }
    },
    presets: {},
    libraryUrl: "http://localhost:4000"
  }
};
