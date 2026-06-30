export default {
    id : "test/compAssembly/0.5",
    name: "compAssembly",
    author: "test",
    code: `
        print('===== Assembly Component Test =====');
        // NOTE: Walls components are have x axis as main direction


        const { model: leftWall, docs: leftWallDocs } = $component("test/compWall:0.5.0", { LENGTH: 4000, HEIGHT: 2500, THICKNESS: 200  })
                                                    .all();

        leftWall.rotateZ(90)
                .align([0,0,0], 'frontbottomright', 'center');

        const { model: backWall, docs: backWallDocs } = $component("test/compWall:0.5.0", { LENGTH: 2000, HEIGHT: 2500, THICKNESS: 200  })
                .all();

        backWall.align(leftWall, 'leftbackbottom', 'backrightbottom');
        
        print('==== ASSEMBLY RESULTS ====');
        print(leftWall);
        print(Object.keys(leftWallDocs));
        print(backWall);
        print(Object.keys(backWallDocs));

        doc.create('assembly')
            .page('assembly')
            .pipeline(
                () => 
                {
                    iso = all().iso();
                    return { iso };
                }
            )
            .text('Assembly Test')
            .view('iso')
            .shapes('iso')
            .merge(leftWallDocs, 'leftWall')
            .merge(backWallDocs, 'backWall')

    `,
    published: {
        version: "0.5",
    }
    

}