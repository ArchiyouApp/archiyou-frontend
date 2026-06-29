export default {
  "id": "archiyou/gardenchair/0.4.0",
  "name": "gardenchair",
  "author": "archiyou",
  "description": "KAK triangular garden chair",
  "tags": [],
  "created": "2025-02-13T14:45:42.660Z",
  "updated": "2024-12-16T16:33:30.000Z",
  "code": "// Archiyou 0.3\n\n//// SETTINGS ////\n\nWIDTH = $WIDTH\n\nBEAM_WIDTH = $BEAM_WIDTH;\nBEAM_THICKNESS = $BEAM_THICKNESS;\n\nBASE_DEPTH = 690; // depth of chair from base, without last support beam\nBASE_HEIGHT = 350;\n\nSEATING_ANGLE = 3;\nSEATING_ANGLE_BACK = 18;\nSEATING_DEPTH = 500;\nSEATING_DEPTH_OVERHANG = 150;\nSEATING_BACK_LENGTH = 450;\n\nSEAT_PLANK_OVERHANG = BEAM_THICKNESS;\nSEAT_PLANK_SPACING = 5;\nBACK_SIZE = 300\n\nBEAM_DEPTH_FROM_FLOOR = 15;\nFRONT_BEAM_START_FROM_SEAT_BOTTOM = BEAM_THICKNESS;\n\nlayer('diagram').color('blue');\n\n// Seating angles\n\ndiagramBaseLine = polyline(\n        [0,0,BASE_HEIGHT],\n        [0,0,0],\n        [0,BASE_DEPTH,0]\n)\ndiagramBaseFrontLine = diagramBaseLine.edges()[0];\ndiagramBaseBottomLine = diagramBaseLine.edges()[1];\n\ndiagramSeatLines = sketch('right')\n                        .moveTo(0,BASE_HEIGHT)\n                        .lineTo(`${SEATING_DEPTH-SEATING_DEPTH_OVERHANG}<-${SEATING_ANGLE}`)\n                        .lineTo(`${SEATING_BACK_LENGTH}<<${90-SEATING_ANGLE_BACK}`)\n                        .end();\n\ndiagramSeatBaseLine = diagramSeatLines.edges()[0];\ndiagramBackLine = diagramSeatLines.edges()[1];\n\ndiagramBackSupportLine = line(\n                                diagramBackLine.middle(), \n                                diagramBaseLine.edges().at(1).end()\n                        );\n\ndiagramSeatLine = diagramSeatBaseLine.copy()\n        .extendTo(diagramBackSupportLine.color('red'))\n        .extend(SEATING_DEPTH_OVERHANG, 'start')\n        .color('yellow') // full extended line\n\nlayer('diagram').shapes().hide(); // hide diagram\n\nlayer('side').color('green');\n\nsideBackSupportCutoffLine =  diagramBackSupportLine\n                                .copy()\n                                .move(\n                                        diagramBackSupportLine\n                                                .direction()\n                                                .normalize()\n                                                .copy()\n                                                .scale(BEAM_WIDTH)\n                                                .rotateX(90)\n                                ).extend(100, 'end').hide()\n\nsideSeatingBeam = diagramSeatLine.copy().extend(300, 'end')\n                .extrude(BEAM_WIDTH, diagramSeatLine.direction().rotateX(-90))\n                .cutoffBy(sideBackSupportCutoffLine)\n\nsideSeatingCutoffLine = line(\n                        sideSeatingBeam.select('E<<Y').center(),\n                        sideSeatingBeam._intersection(diagramBaseFrontLine).select('V<<Z'))\n\nsideSeatingBeam.cutoffBy(sideSeatingCutoffLine); \n        //.extrude(BEAM_THICKNESS) // wait for extrusion\n\nsideSeatingBeamLongitudinalBeamStart = sideSeatingBeam.select('E>>Y').select('V>>Z')\n\nsideBackBeam = diagramBackLine.copy().extendTo(\n                        sideSeatingBeam.select('E<<Z')\n                )\n                .extrude(BEAM_WIDTH, diagramBackLine.direction().rotateX(-90))\n                .cutoffBy(sideSeatingBeam.select('E<<Z'))\n\nsideBackCutoffLine = line(\n                        sideBackBeam.select('E>>Z').middle().copy().moveZ(50),\n                        sideBackBeam.select('E>>Z').middle().copy().moveZ(-1000))\n                        .hide();\n                        \nsideBackBeam.cutoffBy(sideBackCutoffLine);                  \nsideBackSupportBeam = diagramBackSupportLine\n                        .extended(400, 'start')\n                        .extend(400, 'end')\n                        .extrude(BEAM_WIDTH, diagramBackSupportLine.direction().normalize().rotateX(90))\n                        .cutoffBy(diagramBackLine)\n                        .cutoff('z',0)\n\nsideLegFront = diagramBaseFrontLine\n                .extruded(BEAM_WIDTH, [0,1,0])\n                .cutoffBy(diagramSeatLine)\n\nsideBeamDepth = planebetween(\n                        [0,0,BEAM_DEPTH_FROM_FLOOR],\n                        [0,1000,BEAM_DEPTH_FROM_FLOOR+BEAM_WIDTH] // whatever size - will be cut of\n                )\n                .cutoffBy(\n                                diagramBackSupportLine\n                                .moved(\n                                        diagramBackSupportLine\n                                                .direction()\n                                                .normalize()\n                                                .scaled(BEAM_WIDTH)\n                                                .rotateX(90)\n                                ).extend(100, 'end').hide()\n                        ) \n\n// Save 2D for later\nside2D = collection(sideSeatingBeam.toWire(), \n                        sideBackBeam.toWire(), \n                        sideBeamDepth.toWire()).hide()\n                        // NOTE: keep sideLegFront and sideBackSupportBeam for layer because we need to cut off some things\n\n\n// extude all parts now\nsideSeatingBeam = sideSeatingBeam.hide().extruded(BEAM_THICKNESS, [1,0,0]) // update refs here too\nsideBackBeam = sideBackBeam.hide().extruded(BEAM_THICKNESS, [1,0,0])\nsideBackSupportBeam = sideBackSupportBeam.hide().extruded(BEAM_THICKNESS, [-1,0,0])\nsideBeamDepth = sideBeamDepth.extrude(BEAM_THICKNESS, [1,0,0]);\nsideLegFront = sideLegFront.extrude(BEAM_THICKNESS, [-1,0,0]);\n\nsideSeatingBeamPadding = sideSeatingBeam.intersection(sideBackBeam) // pad seat beam\nsideSeatingBeamPadding.moveX(-BEAM_THICKNESS)\nsideBackBeam.moveX(-BEAM_THICKNESS*2);\n\nside = collection(sideSeatingBeam,sideBackBeam,\n                sideBackSupportBeam, sideBeamDepth, sideLegFront);\n\n//// LONGITUDINAL BEAMS\n\nlayer('longitudinal').color('red')\n\nlongBeamFrontStart = sideSeatingCutoffLine.end()\n                        ._copy()\n                        .moveZ(-FRONT_BEAM_START_FROM_SEAT_BOTTOM-BEAM_WIDTH)\n                        \nlongBeamFront = planebetween(\n        longBeamFrontStart,\n        longBeamFrontStart.moved(0, BEAM_THICKNESS, BEAM_WIDTH)\n).extrude(WIDTH-2*BEAM_THICKNESS, [-1,0,0])\n\nsideLegFront.subtract(longBeamFront);\n\nlongBeamBack = planebetween(\n        sideSeatingBeamLongitudinalBeamStart,\n        sideSeatingBeamLongitudinalBeamStart\n                .moved(-WIDTH+2*BEAM_THICKNESS, 0, BEAM_WIDTH)\n).rotateX(\n        diagramBackSupportLine.direction().angle([0,-1,0])-90+180,\n        sideSeatingBeamLongitudinalBeamStart\n).extrude(-BEAM_THICKNESS)\n\n\nsideBackSupportBeam.subtract(longBeamBack);\n\n// Add to section2D for doc\nside2D.add(sideLegFront._flattened('x').toWire());\nside2D.add(sideBackSupportBeam._flattened('x').toWire());\n\n//// SEAT ////\nlayer('seat').color('blue');\n\ntotalSeatDepth = SEAT_PLANK_OVERHANG \n                        + SEATING_DEPTH;\nplankWithSpacing = BEAM_WIDTH+SEAT_PLANK_SPACING;\n\nseatNumPlanks = Math.floor(totalSeatDepth/(plankWithSpacing));\nseatPlanks = group()\nnew Array(seatNumPlanks).fill()\n        .forEach((v,i) => {\n                /* WARNING: Using variable without let/const makes it global, \n                        so in ShapeCollection the reference is overwritten\n                        Was causing bugs in some cases\n                */\n                // plank = box(WIDTH,BEAM_WIDTH,BEAM_THICKNESS) resulted in bugs\n                seatPlanks.add(\n                                box(WIDTH,BEAM_WIDTH,BEAM_THICKNESS)\n                                .moveY(i*plankWithSpacing)\n                        )\n                        \n        })\n\nmp = point(seatPlanks.bbox().maxX(),seatPlanks.bbox().minY(), seatPlanks.bbox().minZ())\nmv = diagramSeatLine\n        ._copy()\n        .extended(SEAT_PLANK_OVERHANG, 'start')\n        .start().toVector().subtract(mp);\n\nseatPlanks\n        .move(mv)\n       .rotateX(-SEATING_ANGLE, diagramSeatLine.start())\n        .moveX(BEAM_THICKNESS)\n\n//// BACK REST ////\nbackPlanks = group();\nbackNumPlanks = Math.ceil(BACK_SIZE/plankWithSpacing)\nnew Array(backNumPlanks).fill()\n        .forEach((v,i) => {\n                let plank = box(WIDTH,BEAM_WIDTH,BEAM_THICKNESS) \n                        .moveY(i*plankWithSpacing)\n                backPlanks.add(plank);\n        })\n\nmp = point(backPlanks.bbox().maxX(),backPlanks.bbox().maxY(), backPlanks.bbox().minZ())\ndiagramBackLineExt = diagramBackLine\n        .copy()\n        .extend(SEAT_PLANK_OVERHANG, 'end')\n        .hide();\nmv = diagramBackLineExt.end().toVector().subtract(mp)\n\nbackPlanks\n        .move(mv)\n        .rotateX(90-SEATING_ANGLE-SEATING_ANGLE_BACK, diagramBackLineExt.end())\n        .moveX(BEAM_THICKNESS)\n\n//// ASSEMBLY ////\n\nlayer('assembly').color('green')\n\nside.mirroredY((-WIDTH+2*BEAM_THICKNESS)/2)\n        .color('green'); // color not automatically added (BUG)\n\nchair = all().solids().visible();\n\n//// CALC ////\n\nSECTION = `${BEAM_WIDTH}x${BEAM_THICKNESS}`\nPARTS_COLUMNS = ['#', 'main part', 'subpart', 'section', 'length', 'quantity']\nPART_ROWS = [\n        [1, 'side', 'seat beam', SECTION, Math.round(sideSeatingBeam.obbox().maxSize()), 2],\n        [2, 'side', 'back leg', SECTION, Math.round(sideBackBeam.obbox().maxSize()), 2],\n        [3, 'side', 'depth beam', SECTION, Math.round(sideBeamDepth.obbox().maxSize()), 2],\n        [4, 'side', 'front leg', SECTION, Math.round(sideLegFront.obbox().maxSize()), 2],\n        [5, 'side', 'back rest support', SECTION, Math.round(sideBackSupportBeam.obbox().maxSize()), 2],\n        [6, 'front', 'longitudinal beams', SECTION, Math.round(longBeamFront.bbox().width()), 2],\n        [7, 'seat and back rest', 'planks', SECTION, seatPlanks.first().bbox().width(), backNumPlanks+seatPlanks.length],\n        [8, 'seat', 'seat beam connector', SECTION, Math.round(sideSeatingBeamPadding.obbox().maxSize()), 2],\n]\n\ncalc.table('parts', PART_ROWS, PARTS_COLUMNS)\n\n//// DOC PIPELINE ////\n\nfunction docPipeline()\n{\n        iso = chair.iso([1,-1,1])\n                .rotateZ(-90-30)\n                .move(-1500, -1500)\n\n        sideSection = side2D\n                .show()\n                .rotateZ(90)\n                .rotateX(-90)\n                .rotateY(180)\n                .moveToZ(0)\n                .moveY(-1500);\n\n        parts = sideSection.map((s,i) => s.copy().autoRotate());\n        \n        parts.add(\n                seatPlanks.first()._flattened().layflat().toWire(),\n                longBeamFront._flattened().layflat().toWire(),\n                sideSeatingBeamPadding._flattened().layflat().toWire()\n        )\n\n        parts.forEach((p,i) => {\n                p.moveToX(1000) // start at fixed x\n                        .moveToY(-1500) // on one line y-axis\n                        .move(i*(BEAM_WIDTH+250))\n                p.autoDim({ offset: 25 });\n        });\n}\n\n// docPipeline()\n\n//// DOC ////\n\ndoc\n        .create('plan')\n        .page('spec')\n        .pipeline(docPipeline)\n        .titleblock( { \n                title: 'Garden Chair',\n                designer: 'KAK', \n                designLicense: 'unknown', \n                })\n        .view('iso')\n        .shapes('iso')\n        .width(0.35)\n        .height(0.5)\n        .pivot(1,0)\n        .position(1,0.23)\n        .view('parts')\n        .shapes('parts')\n        .pivot(0,1)\n        .width(0.7)\n        .height(0.5)\n        .position(0,1)\n        .table('parts', { fontsize: 7 })\n        .width(0.35)\n        .height(0.4)\n        .position(0,0.24)\n        .view('side')\n        .shapes('sideSection')\n        .width(0.5)\n        .height(0.4)\n        .pivot(0,0)\n        .position(0.4,0 );\n\n",
  "params": {
    "WIDTH": {
      "name": "WIDTH",
      "type": "number",
      "label": "Width",
      "enabled": true,
      "order": 0,
      "iterable": true,
      "units": "mm",
      "default": 525,
      "schema": {
        "type": "number",
        "default": 525,
        "minimum": 400,
        "maximum": 1200,
        "multipleOf": 1
      }
    },
    "BEAM_WIDTH": {
      "name": "BEAM_WIDTH",
      "type": "number",
      "label": "Beam Width",
      "enabled": true,
      "order": 0,
      "iterable": true,
      "default": 90,
      "schema": {
        "type": "number",
        "default": 90,
        "minimum": 60,
        "maximum": 120,
        "multipleOf": 1
      }
    },
    "BEAM_THICKNESS": {
      "name": "BEAM_THICKNESS",
      "type": "number",
      "label": "Beam Thickness",
      "enabled": true,
      "order": 0,
      "iterable": true,
      "units": "mm",
      "default": 13,
      "schema": {
        "type": "number",
        "default": 13,
        "minimum": 13,
        "maximum": 40,
        "multipleOf": 1
      }
    }
  },
  "presets": {},
  "published": {
    "url": "/archiyou/gardenchair:0.4.0",
    "version": "0.4.0",
    "title": "GardenChair",
    "public": true,
    "published": true,
    "description": "KAK triangular garden chair",
    "params": {
      "WIDTH": {
        "name": "WIDTH",
        "type": "number",
        "label": "Width",
        "enabled": true,
        "order": 0,
        "iterable": true,
        "units": "mm",
        "default": 525,
        "schema": {
          "type": "number",
          "default": 525,
          "minimum": 400,
          "maximum": 1200,
          "multipleOf": 1
        }
      },
      "BEAM_WIDTH": {
        "name": "BEAM_WIDTH",
        "type": "number",
        "label": "Beam Width",
        "enabled": true,
        "order": 0,
        "iterable": true,
        "default": 90,
        "schema": {
          "type": "number",
          "default": 90,
          "minimum": 60,
          "maximum": 120,
          "multipleOf": 1
        }
      },
      "BEAM_THICKNESS": {
        "name": "BEAM_THICKNESS",
        "type": "number",
        "label": "Beam Thickness",
        "enabled": true,
        "order": 0,
        "iterable": true,
        "units": "mm",
        "default": 13,
        "schema": {
          "type": "number",
          "default": 13,
          "minimum": 13,
          "maximum": 40,
          "multipleOf": 1
        }
      }
    },
    "presets": [],
    "libraryUrl": "http://localhost:4000"
  }
};
