export default {
  id: "archiyou/gardenchair/0.4.0",
  name: "gardenchair",
  author: "archiyou",
  description: "KAK triangular garden chair",
  tags: [],
  created: "2025-02-13T14:45:42.660Z",
  updated: "2024-12-16T16:33:30.000Z",
  code: `// Archiyou 0.3

//// SETTINGS ////

WIDTH = $WIDTH

BEAM_WIDTH = $BEAM_WIDTH;
BEAM_THICKNESS = $BEAM_THICKNESS;

BASE_DEPTH = 690; // depth of chair from base, without last support beam
BASE_HEIGHT = 350;

SEATING_ANGLE = 3;
SEATING_ANGLE_BACK = 18;
SEATING_DEPTH = 500;
SEATING_DEPTH_OVERHANG = 150;
SEATING_BACK_LENGTH = 450;

SEAT_PLANK_OVERHANG = BEAM_THICKNESS;
SEAT_PLANK_SPACING = 5;
BACK_SIZE = 300

BEAM_DEPTH_FROM_FLOOR = 15;
FRONT_BEAM_START_FROM_SEAT_BOTTOM = BEAM_THICKNESS;

layer('diagram').color('blue');

// Seating angles

diagramBaseLine = polyline(
        [0,0,BASE_HEIGHT],
        [0,0,0],
        [0,BASE_DEPTH,0]
)
diagramBaseFrontLine = diagramBaseLine.edges()[0];
diagramBaseBottomLine = diagramBaseLine.edges()[1];

diagramSeatLines = sketch('right')
                        .moveTo(0,BASE_HEIGHT)
                        .lineTo(\`\${SEATING_DEPTH-SEATING_DEPTH_OVERHANG}<-\${SEATING_ANGLE}\`)
                        .lineTo(\`\${SEATING_BACK_LENGTH}<\${90-SEATING_ANGLE-SEATING_ANGLE_BACK}\`)
                        .end()
diagramSeatBaseLine = diagramSeatLines.edges()[0];
diagramBackLine = diagramSeatLines.edges()[1];

diagramBackSupportLine = line(
                                diagramBackLine.middle(), 
                                diagramBaseLine.edges()[1]
                                        .end()
                        );

diagramSeatLine = diagramSeatBaseLine.copy()
        .extendTo(diagramBackSupportLine)
        .extend(SEATING_DEPTH_OVERHANG, 'start') // full extended line

layer('diagram').shapes().hide(); // hide diagram

layer('side').color('green');

sideBackSupportCutoffLine =  diagramBackSupportLine
                                .moved(
                                        diagramBackSupportLine
                                                .direction()
                                                .normalize()
                                                .scaled(BEAM_WIDTH)
                                                .rotateX(90)
                                ).extend(100, 'end').hide()

sideSeatingBeam = diagramSeatLine.extended(300, 'end')
                .extrude(BEAM_WIDTH, diagramSeatLine.direction().rotateX(-90))
                .cutoffBy(sideBackSupportCutoffLine)

sideSeatingCutoffLine = line(
                        sideSeatingBeam.select('E<<Y').center(),
                        sideSeatingBeam._intersection(diagramBaseFrontLine).select('V<<Z'))

sideSeatingBeam.cutoffBy(sideSeatingCutoffLine); 
        //.extrude(BEAM_THICKNESS) // wait for extrusion

sideSeatingBeamLongitudinalBeamStart = sideSeatingBeam.select('E>>Y').select('V>>Z')

sideBackBeam = diagramBackLine.copy().extendTo(
                        sideSeatingBeam.select('E<<Z')
                )
                .extrude(BEAM_WIDTH, diagramBackLine.direction().rotateX(-90))
                .cutoffBy(sideSeatingBeam.select('E<<Z'))

sideBackCutoffLine = line(
                        sideBackBeam.select('E>>Z').middle().copy().moveZ(50),
                        sideBackBeam.select('E>>Z').middle().copy().moveZ(-1000))
                        .hide();
                        
sideBackBeam.cutoffBy(sideBackCutoffLine);                  
sideBackSupportBeam = diagramBackSupportLine
                        .extended(400, 'start')
                        .extend(400, 'end')
                        .extrude(BEAM_WIDTH, diagramBackSupportLine.direction().normalize().rotateX(90))
                        .cutoffBy(diagramBackLine)
                        .cutoff('z',0)

sideLegFront = diagramBaseFrontLine
                .extruded(BEAM_WIDTH, [0,1,0])
                .cutoffBy(diagramSeatLine)

sideBeamDepth = planebetween(
                        [0,0,BEAM_DEPTH_FROM_FLOOR],
                        [0,1000,BEAM_DEPTH_FROM_FLOOR+BEAM_WIDTH] // whatever size - will be cut of
                )
                .cutoffBy(
                                diagramBackSupportLine
                                .moved(
                                        diagramBackSupportLine
                                                .direction()
                                                .normalize()
                                                .scaled(BEAM_WIDTH)
                                                .rotateX(90)
                                ).extend(100, 'end').hide()
                        ) 

// Save 2D for later
side2D = collection(sideSeatingBeam.toWire(), 
                        sideBackBeam.toWire(), 
                        sideBeamDepth.toWire()).hide()
                        // NOTE: keep sideLegFront and sideBackSupportBeam for layer because we need to cut off some things


// extude all parts now
sideSeatingBeam = sideSeatingBeam.hide().extruded(BEAM_THICKNESS, [1,0,0]) // update refs here too
sideBackBeam = sideBackBeam.hide().extruded(BEAM_THICKNESS, [1,0,0])
sideBackSupportBeam = sideBackSupportBeam.hide().extruded(BEAM_THICKNESS, [-1,0,0])
sideBeamDepth = sideBeamDepth.extrude(BEAM_THICKNESS, [1,0,0]);
sideLegFront = sideLegFront.extrude(BEAM_THICKNESS, [-1,0,0]);

sideSeatingBeamPadding = sideSeatingBeam.intersection(sideBackBeam) // pad seat beam
sideSeatingBeamPadding.moveX(-BEAM_THICKNESS)
sideBackBeam.moveX(-BEAM_THICKNESS*2);

side = collection(sideSeatingBeam,sideBackBeam,
                sideBackSupportBeam, sideBeamDepth, sideLegFront);

//// LONGITUDINAL BEAMS

layer('longitudinal').color('red')

longBeamFrontStart = sideSeatingCutoffLine.end()
                        ._copy()
                        .moveZ(-FRONT_BEAM_START_FROM_SEAT_BOTTOM-BEAM_WIDTH)
                        
longBeamFront = planebetween(
        longBeamFrontStart,
        longBeamFrontStart.moved(0, BEAM_THICKNESS, BEAM_WIDTH)
).extrude(WIDTH-2*BEAM_THICKNESS, [-1,0,0])

sideLegFront.subtract(longBeamFront);

longBeamBack = planebetween(
        sideSeatingBeamLongitudinalBeamStart,
        sideSeatingBeamLongitudinalBeamStart
                .moved(-WIDTH+2*BEAM_THICKNESS, 0, BEAM_WIDTH)
).rotateX(
        diagramBackSupportLine.direction().angle([0,-1,0])-90+180,
        sideSeatingBeamLongitudinalBeamStart
).extrude(-BEAM_THICKNESS)


sideBackSupportBeam.subtract(longBeamBack);

// Add to section2D for doc
side2D.add(sideLegFront._flattened('x').toWire());
side2D.add(sideBackSupportBeam._flattened('x').toWire());

//// SEAT ////
layer('seat').color('blue');

totalSeatDepth = SEAT_PLANK_OVERHANG 
                        + SEATING_DEPTH;
plankWithSpacing = BEAM_WIDTH+SEAT_PLANK_SPACING;

seatNumPlanks = Math.floor(totalSeatDepth/(plankWithSpacing));
seatPlanks = group()
new Array(seatNumPlanks).fill()
        .forEach((v,i) => {
                /* WARNING: Using variable without let/const makes it global, 
                        so in ShapeCollection the reference is overwritten
                        Was causing bugs in some cases
                */
                // plank = box(WIDTH,BEAM_WIDTH,BEAM_THICKNESS) resulted in bugs
                seatPlanks.add(
                                box(WIDTH,BEAM_WIDTH,BEAM_THICKNESS)
                                .moveY(i*plankWithSpacing)
                        )
                        
        })

mp = point(seatPlanks.bbox().maxX(),seatPlanks.bbox().minY(), seatPlanks.bbox().minZ())
mv = diagramSeatLine
        ._copy()
        .extended(SEAT_PLANK_OVERHANG, 'start')
        .start().toVector().subtract(mp);

seatPlanks
        .move(mv)
       .rotateX(-SEATING_ANGLE, diagramSeatLine.start())
        .moveX(BEAM_THICKNESS)

//// BACK REST ////
backPlanks = group();
backNumPlanks = Math.ceil(BACK_SIZE/plankWithSpacing)
new Array(backNumPlanks).fill()
        .forEach((v,i) => {
                let plank = box(WIDTH,BEAM_WIDTH,BEAM_THICKNESS) 
                        .moveY(i*plankWithSpacing)
                backPlanks.add(plank);
        })

mp = point(backPlanks.bbox().maxX(),backPlanks.bbox().maxY(), backPlanks.bbox().minZ())
diagramBackLineExt = diagramBackLine
        .copy()
        .extend(SEAT_PLANK_OVERHANG, 'end')
        .hide();
mv = diagramBackLineExt.end().toVector().subtract(mp)

backPlanks
        .move(mv)
        .rotateX(90-SEATING_ANGLE-SEATING_ANGLE_BACK, diagramBackLineExt.end())
        .moveX(BEAM_THICKNESS)

//// ASSEMBLY ////

layer('assembly').color('green')

side.mirroredY((-WIDTH+2*BEAM_THICKNESS)/2)
        .color('green'); // color not automatically added (BUG)

chair = all().solids().visible();

//// CALC ////

SECTION = \`\${BEAM_WIDTH}x\${BEAM_THICKNESS}\`
PARTS_COLUMNS = ['#', 'main part', 'subpart', 'section', 'length', 'quantity']
PART_ROWS = [
        [1, 'side', 'seat beam', SECTION, Math.round(sideSeatingBeam.obbox().maxSize()), 2],
        [2, 'side', 'back leg', SECTION, Math.round(sideBackBeam.obbox().maxSize()), 2],
        [3, 'side', 'depth beam', SECTION, Math.round(sideBeamDepth.obbox().maxSize()), 2],
        [4, 'side', 'front leg', SECTION, Math.round(sideLegFront.obbox().maxSize()), 2],
        [5, 'side', 'back rest support', SECTION, Math.round(sideBackSupportBeam.obbox().maxSize()), 2],
        [6, 'front', 'longitudinal beams', SECTION, Math.round(longBeamFront.bbox().width()), 2],
        [7, 'seat and back rest', 'planks', SECTION, seatPlanks.first().bbox().width(), backNumPlanks+seatPlanks.length],
        [8, 'seat', 'seat beam connector', SECTION, Math.round(sideSeatingBeamPadding.obbox().maxSize()), 2],
]

calc.table('parts', PART_ROWS, PARTS_COLUMNS)

//// DOC PIPELINE ////

function docPipeline()
{
        iso = chair.iso([1,-1,1])
                .rotateZ(-90-30)
                .move(-1500, -1500)

        sideSection = side2D
                .show()
                .rotateZ(90)
                .rotateX(-90)
                .rotateY(180)
                .moveToZ(0)
                .moveY(-1500);

        parts = sideSection.map((s,i) => s.copy().autoRotate());
        
        parts.add(
                seatPlanks.first()._flattened().layflat().toWire(),
                longBeamFront._flattened().layflat().toWire(),
                sideSeatingBeamPadding._flattened().layflat().toWire()
        )

        parts.forEach((p,i) => {
                p.moveToX(1000) // start at fixed x
                        .moveToY(-1500) // on one line y-axis
                        .move(i*(BEAM_WIDTH+250))
                p.autoDim({ offset: 25 });
        });
}

// docPipeline()

//// DOC ////

doc
        .create('plan')
        .page('spec')
        .pipeline(docPipeline)
        .titleblock( { 
                title: 'Garden Chair',
                designer: 'KAK', 
                designLicense: 'unknown', 
                })
        .view('iso')
        .shapes('iso')
        .width(0.35)
        .height(0.5)
        .pivot(1,0)
        .position(1,0.23)
        .view('parts')
        .shapes('parts')
        .pivot(0,1)
        .width(0.7)
        .height(0.5)
        .position(0,1)
        .table('parts', { fontsize: 7 })
        .width(0.35)
        .height(0.4)
        .position(0,0.24)
        .view('side')
        .shapes('sideSection')
        .width(0.5)
        .height(0.4)
        .pivot(0,0)
        .position(0.4,0 )
        `,
  params: {
    WIDTH: {
      name: "WIDTH",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Width",
      default: 525,
      _value: undefined,
      min: 400,
      max: 1200,
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
    BEAM_WIDTH: {
      name: "BEAM_WIDTH",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Beam Width",
      default: 90,
      _value: undefined,
      min: 60,
      max: 120,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    BEAM_THICKNESS: {
      name: "BEAM_THICKNESS",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Beam Thickness",
      default: 13,
      _value: undefined,
      min: 13,
      max: 40,
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
    url: "/archiyou/gardenchair:0.4.0",
    version: "0.4.0",
    title: "GardenChair",
    public: true,
    published: "2025-02-13T15:45:42.660569",
    description: "KAK triangular garden chair",
    params: {
      WIDTH: {
        MAX_TEXT_LENGTH: 255,
        name: "WIDTH",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Width",
        default: 525,
        min: 400,
        max: 1200,
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
      BEAM_WIDTH: {
        MAX_TEXT_LENGTH: 255,
        name: "BEAM_WIDTH",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Beam Width",
        default: 90,
        min: 60,
        max: 120,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: null,
        order: 0,
        iterable: true,
        description: null
      },
      BEAM_THICKNESS: {
        MAX_TEXT_LENGTH: 255,
        name: "BEAM_THICKNESS",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Beam Thickness",
        default: 13,
        min: 13,
        max: 40,
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
