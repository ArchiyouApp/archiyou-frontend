export default {
  id: "archiyou/maritavolo/0.6.0",
  name: "maritavolo",
  author: "archiyou",
  description: "The classical table of Enzo Mari",
  tags: [],
  created: "2025-02-13T14:45:44.184Z",
  updated: "2024-12-23T10:39:55.000Z",
  code: `// Archiyou 0.15
units('mm');


TABLE_HEIGHT = $HEIGHT*10;
TABLE_WIDTH = $DEPTH*10; // from cm to mm
TABLE_DEPTH = $LENGTH*10; // from front view - is table length
TABLE_OVERHANG = 350;

STRUT_HEIGHT = $BEAM_THICKNESS;
STRUT_WIDTH = $BEAM_WIDTH;

//// CALCULATED PARAMS ////

spineHeight = TABLE_HEIGHT/2 - STRUT_WIDTH;
spineWidth = TABLE_DEPTH - TABLE_OVERHANG*2;

//// 

layer('sides').color('red');

sidePostLeft = boxbetween([0,0,0],[STRUT_WIDTH,STRUT_HEIGHT,TABLE_HEIGHT]).name('sideV');
sideHorMid = boxbetween([0,0,0], [TABLE_WIDTH, STRUT_HEIGHT, STRUT_WIDTH])
                .move(0,-STRUT_HEIGHT, TABLE_HEIGHT/2-STRUT_WIDTH) // horizontal is aligned from top to middle of height
                .name('sideH');

sideHorMidIn = sideHorMid.moved(0, STRUT_HEIGHT*2).name('sideH')

sideHorTop = sideHorMid.moved(0,0,TABLE_HEIGHT/2).name('sideH')
sideHorTopIn = sideHorMidIn.moved(0,0,TABLE_HEIGHT/2).name('sideH');

sideCenterLine = line(
                    [TABLE_WIDTH/2],
                    [TABLE_WIDTH/2, 0, TABLE_HEIGHT]
                    ).hide();
sidePostRight = sidePostLeft.mirroredY(sideCenterLine.center().x).name('sideV');

layer('diagonalLeft').color('purple')

diagLineStart = sideHorMid.select('V||leftbackbottom')
                    .moved(STRUT_WIDTH*2)
                    .color('blue')

diagLineEnd = sideCenterLine.end()
                .moved(-STRUT_WIDTH*2,0,-STRUT_WIDTH)
                .color('blue')
diagLine = line(diagLineStart,diagLineEnd)
diagLineVec = diagLineEnd.toVector().subtract(diagLineStart);
diagLineWidthVec = diagLineVec.rotated(-90, [0,0,0], [0,1,0])
diagStrutVertexLeftBottom = diagLineStart 
                            .moved(diagLineWidthVec.normalize().scale(STRUT_WIDTH))
                            .color('yellow')
                            .hide();
diagStrutTestLine = line(
                        diagStrutVertexLeftBottom, 
                        diagStrutVertexLeftBottom.moved(diagLineVec.normalized().scale(1000)).hide()
                    ).hide();


diagStrutLineLeftEnd = diagStrutTestLine.intersection(sideHorTop.select('E||topback'))
                            .copy()
                            .hide();

diagStrutLeft = line(diagStrutVertexLeftBottom, diagStrutLineLeftEnd)
                .extrude(STRUT_WIDTH, diagLineWidthVec.reversed())
                .extrude(STRUT_HEIGHT, [0,1,0])
                .name('sideD');

diagStrutLeft.mirroredY(sideCenterLine.center().x)
            .name('sideD')

sideFront = all().visible().color('red').name('sideFront');
sideBack =  sideFront
            .clone()
            .move(0,spineWidth+STRUT_HEIGHT)
            .name('sideBack')
            .color('red');

//// SPINE ////
/* 
    NOTE: spine is first positioned on flat XY plane 
*/

layer('spine').color('green');

trussesInsideRect = rectbetween(
    [0,0,0], [spineWidth, spineHeight-STRUT_HEIGHT] // slightly lower due to montage rotat
    ).hide();

verticalStrutsMid = group();
trussInsideSegmentsArr = group();

new Array(4).fill(null)
                        .forEach( (v,i, arr) => {
                            const segmSize = trussesInsideRect.bbox().width()/4;
                            sx1 = i*segmSize + ((i > 0) ? STRUT_HEIGHT : 0);
                            sx2 = sx1+segmSize - ((i > 0) ? STRUT_HEIGHT : 0) 

                            trussInsideSegmentsArr.add(
                                rectbetween(
                                [sx1, 0],
                                [sx2, trussesInsideRect.bbox().depth()])
                                .hide()
                            )

                            if (i < arr.length - 1 )
                            {
                                verticalStrutsMid.add(
                                    boxbetween(
                                    [sx2, 0,0],
                                    [sx2+STRUT_HEIGHT, trussesInsideRect.bbox().depth(), STRUT_WIDTH])
                                )
                            }
                            
                        });


verticalStrutsMid.forEach(s => s.name('strut V mid'))

diagonalStruts = trussInsideSegmentsArr.map( (segmRect,i) => 
{    
    d = make.fitRectStrut(
        STRUT_HEIGHT,
        [segmRect.bbox().width(), segmRect.bbox().depth()]
        ).moveTo(segmRect.center())

    if(i % 2 == 1)
    {
        d = d.hide().mirrored(d.center(), [1,0,0]);
    }
    d.hide();
    return d;
})
diagonalStruts = diagonalStruts.extruded(STRUT_WIDTH, [0,0,1])
                    .forEach((s,i) => s.name(\`strutD\`))

spineStrutLeft = boxbetween([-STRUT_HEIGHT,-STRUT_WIDTH, 0],
                            [0,spineHeight+STRUT_WIDTH,STRUT_WIDTH]
                            ).name('strutV ends')

spineStrutRight = spineStrutLeft.mirroredY(spineWidth/2).name('strutV ends')

spineHorFrontTop = boxbetween(
                        [-STRUT_HEIGHT*2,0, STRUT_WIDTH],
                        [spineWidth+STRUT_WIDTH,STRUT_WIDTH, STRUT_WIDTH+STRUT_HEIGHT])
                        .name('strutH');

spineHorFrontBottom = spineHorFrontTop.mirroredZ(STRUT_WIDTH/2).name('strutH')
spineHorBackTop = spineHorFrontTop.mirroredX(spineHeight/2).moveY(-STRUT_HEIGHT)
                        .name('strutH')
spineHorBackBottom = spineHorBackTop.mirroredZ(STRUT_WIDTH/2)
                        .name('strutH')
// cleanup and group spine

spine = group(verticalStrutsMid, 
                diagonalStruts,
                spineStrutLeft,
                spineStrutRight,
                spineHorFrontTop,
                spineHorFrontBottom,
                spineHorBackTop,
                spineHorBackBottom);

spine.rotateX(90).rotateZ(90);

spine.align(sideFront, 'topfrontcenter', 'topfrontcenter')
        .name('spine')



//// TABLE TOP ////

layer('tabletop').color('brown');
topNumPlanks = Math.round(TABLE_WIDTH/STRUT_WIDTH);
topPlank = box(STRUT_WIDTH, TABLE_DEPTH, STRUT_HEIGHT);
topPlanks = topPlank.arrayX(topNumPlanks, topPlank.bbox().width())
topPlanks.align(spine, 'bottomcenter', 'topcenter').name('top')

//// COMBINE MODEL /////
table = group(sideFront, sideBack, spine, topPlanks);


//// DATA ////

parts = make.partList(collection(spine,sideFront), 'parts');

//// DOC PIPELINE ////

function docPipeline()
{
    table.getGroup('top').moveZ(700)
    iso = table.iso().move(8000)
    table.getGroup('top').moveZ(-700); // move back
   

    // Spine elevation and dimensioning
    spineElevation = spine.elevation('left', true); //.move(8000, -2000);

    spineElevation.autoDim({ levels: [
        { axis: 'y', at: -spineHeight/2, minDistance : 1  },
        { axis: 'x', at: spineWidth/2 + STRUT_HEIGHT*0.5, minDistance : 1, showLine:true },
    ]})
    spineElevation.bbox().back().dim();
    spineElevation.bbox().left().dim();

    // Side elevation and dimensioning
    sideElevation = sideBack.elevation('front', true).move(5000, -2000);
    sideElevation.autoDim({
        levels: [
            { axis: 'x', at: 0.01, minDistance: 1, offset: 50 },
            { axis: 'y', at: 1.0, minDistance: 1, offset: 100 },
        ]
    })
    sideElevation.bbox().front().dim({ offset: 50 });
    sideElevation.bbox().right().dim({ offset: 50 });
}

//docPipeline(); // UNCOMMENT TO DEBUG


plan =  doc.create('plan')
            .page('plan')
            .pipeline(docPipeline)
            .titleblock({ title: 'Tavolo', designer: 'Enzo Mari', designLicense: 'CC-BY-NC', manualLicence: 'CC-BY-NC' })
            .text('Tavolo Rettangolare', { size: '10mm' })
            .position(0,1.0)
            .text(\`\${$LENGTH}x\${$DEPTH} H\${$HEIGHT} \${STRUT_HEIGHT}x\${STRUT_WIDTH}\`, { size: '6mm' })
            .position(0,0.93)
            .view('iso')
            .shapes('iso')
            .pivot('topleft')
            .position(0,0.8)
            .width(0.55)
            .height(0.75)
            .view('spineElevation')
            .shapes('spineElevation')
            .pivot('topright')
            .position(1.0,1)
            .width(0.6)
            .height(0.3)
            .table('parts', { fontsize: 7 })
            .position(0.45,0.32)
            .width(0.32)
            .text('Cut list', { size: '6mm' })
            .position(0.45, 0.39)
            .view('side')
            .shapes('sideElevation')
            .pivot('bottomright')
            .position(1,0.3)
            .width(0.2)
            .height(0.3)
            
            `,
  params: {
    DEPTH: {
      name: "DEPTH",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Depth",
      default: 80,
      _value: undefined,
      min: 40,
      max: 120,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
      order: 0,
      iterable: true,
      description: null
    },
    LENGTH: {
      name: "LENGTH",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Length",
      default: 200,
      _value: undefined,
      min: 150,
      max: 220,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
      order: 0,
      iterable: true,
      description: null
    },
    HEIGHT: {
      name: "HEIGHT",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Height",
      default: 70,
      _value: undefined,
      min: 50,
      max: 120,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
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
      default: 50,
      _value: undefined,
      min: 40,
      max: 80,
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
    BEAM_THICKNESS: {
      name: "BEAM_THICKNESS",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Beam Thickness",
      default: 25,
      _value: undefined,
      min: 15,
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
    url: "/archiyou/maritavolo:0.6.0",
    version: "0.6.0",
    title: "MariTavolo",
    public: true,
    published: "2025-02-13T15:45:44.184544",
    description: "The classical table of Enzo Mari",
    params: {
      DEPTH: {
        MAX_TEXT_LENGTH: 255,
        name: "DEPTH",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Depth",
        default: 80,
        min: 40,
        max: 120,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "cm",
        order: 0,
        iterable: true,
        description: null
      },
      LENGTH: {
        MAX_TEXT_LENGTH: 255,
        name: "LENGTH",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Length",
        default: 200,
        min: 150,
        max: 220,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "cm",
        order: 0,
        iterable: true,
        description: null
      },
      HEIGHT: {
        MAX_TEXT_LENGTH: 255,
        name: "HEIGHT",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Height",
        default: 70,
        min: 50,
        max: 120,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "cm",
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
        default: 50,
        min: 40,
        max: 80,
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
      BEAM_THICKNESS: {
        MAX_TEXT_LENGTH: 255,
        name: "BEAM_THICKNESS",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "Beam Thickness",
        default: 25,
        min: 15,
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
