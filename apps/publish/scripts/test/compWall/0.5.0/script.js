export default {
    id : "test/compWall/0.5",
    name: "compWall",
    author: "test",
    params: {
        length: {
            type: "number",
            default: 3000,
            min: 1000,
            max: 10000
        },
        height: {
            type: "number",
            default: 2500,
            min: 1000,
            max: 4000
        },
        thickness: {
            type: "number",
            default: 200,
            min: 100,
            max: 500
        }
    },
    code: `
        wall = box($LENGTH, $THICKNESS, $HEIGHT);

        function docPipeline()
        {
            iso = wall.iso();

            return { iso };
        }

        //// TEST DOC ////
        doc.create('spec')
            .page('spec')
            .pipeline(docPipeline)
            .text('Wall Component Test')
            .view('iso')
            .shapes('iso');


    `,
    published: {
        version: "0.5",
    }

}